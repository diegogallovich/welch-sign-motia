-- PostgreSQL Schema for Flow Observability and Debugging
-- Optimized for trace analysis, performance monitoring, and error pattern detection

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Flow Executions Table
-- Top-level tracking for entire flow executions from start to completion
CREATE TABLE IF NOT EXISTS flow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id VARCHAR(255) UNIQUE NOT NULL,
    flow_name VARCHAR(255) NOT NULL,
    flow_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    error_message TEXT,
    error_category VARCHAR(100) CHECK (error_category IN ('api_error', 'validation_error', 'timeout', 'unknown')),
    input_summary JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Step Executions Table
-- Individual step tracking within a flow execution
CREATE TABLE IF NOT EXISTS step_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id VARCHAR(255) NOT NULL,
    execution_id UUID NOT NULL REFERENCES flow_executions(id) ON DELETE CASCADE,
    step_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('started', 'success', 'failed', 'skipped')),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    error_message TEXT,
    error_category VARCHAR(100) CHECK (error_category IN ('api_error', 'validation_error', 'timeout', 'unknown')),
    skip_reason VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- External API Calls Table
-- Tracking all external service interactions for performance and reliability monitoring
CREATE TABLE IF NOT EXISTS external_api_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id VARCHAR(255) NOT NULL,
    execution_id UUID NOT NULL REFERENCES flow_executions(id) ON DELETE CASCADE,
    step_execution_id UUID REFERENCES step_executions(id) ON DELETE CASCADE,
    service VARCHAR(100) NOT NULL CHECK (service IN ('wrike', 'shopvox', 'mailgun', 'other')),
    operation VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed', 'timeout')),
    http_status INTEGER,
    duration_ms INTEGER NOT NULL,
    error_message TEXT,
    called_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Flow Executions Indexes
CREATE INDEX IF NOT EXISTS idx_flow_executions_trace_id ON flow_executions(trace_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_name ON flow_executions(flow_name);
CREATE INDEX IF NOT EXISTS idx_flow_executions_started_at ON flow_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_executions_status_started ON flow_executions(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_type ON flow_executions(flow_type);

-- Step Executions Indexes
CREATE INDEX IF NOT EXISTS idx_step_executions_trace_id ON step_executions(trace_id);
CREATE INDEX IF NOT EXISTS idx_step_executions_execution_id ON step_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_step_executions_step_name ON step_executions(step_name);
CREATE INDEX IF NOT EXISTS idx_step_executions_status ON step_executions(status);
CREATE INDEX IF NOT EXISTS idx_step_executions_started_at ON step_executions(started_at DESC);

-- External API Calls Indexes
CREATE INDEX IF NOT EXISTS idx_api_calls_trace_id ON external_api_calls(trace_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_execution_id ON external_api_calls(execution_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_step_execution_id ON external_api_calls(step_execution_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_service ON external_api_calls(service);
CREATE INDEX IF NOT EXISTS idx_api_calls_service_operation ON external_api_calls(service, operation);
CREATE INDEX IF NOT EXISTS idx_api_calls_called_at ON external_api_calls(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_calls_status ON external_api_calls(status);

-- =============================================================================
-- USEFUL VIEWS FOR COMMON QUERIES
-- =============================================================================

-- Recent Failed Executions
CREATE OR REPLACE VIEW recent_failed_executions AS
SELECT 
    fe.trace_id,
    fe.flow_name,
    fe.flow_type,
    fe.error_message,
    fe.error_category,
    fe.started_at,
    fe.duration_ms,
    COUNT(se.id) as total_steps,
    COUNT(CASE WHEN se.status = 'failed' THEN 1 END) as failed_steps
FROM flow_executions fe
LEFT JOIN step_executions se ON fe.id = se.execution_id
WHERE fe.status = 'failed'
    AND fe.started_at > NOW() - INTERVAL '7 days'
GROUP BY fe.id, fe.trace_id, fe.flow_name, fe.flow_type, fe.error_message, fe.error_category, fe.started_at, fe.duration_ms
ORDER BY fe.started_at DESC;

-- API Performance Summary
CREATE OR REPLACE VIEW api_performance_summary AS
SELECT 
    service,
    operation,
    COUNT(*) as total_calls,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_calls,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_calls,
    ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)::numeric, 2) as p50_duration_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 2) as p95_duration_ms,
    ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms)::numeric, 2) as p99_duration_ms,
    MAX(duration_ms) as max_duration_ms
FROM external_api_calls
WHERE called_at > NOW() - INTERVAL '24 hours'
GROUP BY service, operation
ORDER BY avg_duration_ms DESC;

-- Flow Performance Summary
CREATE OR REPLACE VIEW flow_performance_summary AS
SELECT 
    flow_name,
    flow_type,
    COUNT(*) as total_executions,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_executions,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_executions,
    ROUND((100.0 * COUNT(CASE WHEN status = 'success' THEN 1 END) / COUNT(*))::numeric, 2) as success_rate_percent,
    ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)::numeric, 2) as p50_duration_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 2) as p95_duration_ms
FROM flow_executions
WHERE started_at > NOW() - INTERVAL '24 hours'
    AND status IN ('success', 'failed')
GROUP BY flow_name, flow_type
ORDER BY total_executions DESC;

-- =============================================================================
-- DATA RETENTION & PARTITIONING
-- =============================================================================

-- Note: Partitioning should be set up manually based on your PostgreSQL version
-- For PostgreSQL 10+, consider partitioning flow_executions by month:
-- 
-- ALTER TABLE flow_executions 
-- PARTITION BY RANGE (started_at);
--
-- Then create monthly partitions:
-- CREATE TABLE flow_executions_2025_01 PARTITION OF flow_executions
-- FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Data retention function (call periodically via cron or pg_cron)
CREATE OR REPLACE FUNCTION cleanup_old_executions(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM flow_executions
    WHERE started_at < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE flow_executions IS 'Top-level flow execution tracking for tracing and debugging';
COMMENT ON TABLE step_executions IS 'Individual step execution details within flows';
COMMENT ON TABLE external_api_calls IS 'External API call monitoring for performance and reliability analysis';

COMMENT ON COLUMN flow_executions.trace_id IS 'Unique correlation ID for tracing a flow execution across systems';
COMMENT ON COLUMN flow_executions.input_summary IS 'Lightweight metadata about input (IDs only, not full payloads)';
COMMENT ON COLUMN step_executions.skip_reason IS 'Reason for skipping step execution (e.g., loop_prevention)';
COMMENT ON COLUMN step_executions.metadata IS 'Essential context only - keep lightweight';

