-- ClickHouse Schema for Reliability Monitoring
-- Execution events table - time-series events for all execution lifecycle events
CREATE TABLE IF NOT EXISTS execution_events
(
    id UUID,
    trace_id String,
    flow_name String,
    step_name String,
    event_type String, -- 'execution_started', 'step_started', 'step_completed', 'step_failed', 'execution_completed', 'execution_failed', 'api_call'
    status String, -- 'running', 'success', 'failed', 'timeout'
    error_category Nullable(String), -- 'api_error', 'validation_error', 'timeout', 'unknown'
    error_message Nullable(String),
    error_code Nullable(String),
    metadata String, -- JSON with context
    duration_ms Nullable(UInt64), -- How long this step/execution/API call took
    external_service Nullable(String), -- 'wrike', 'shopvox', null if internal
    event_timestamp DateTime,
    created_at DateTime DEFAULT now()
)
ENGINE = MergeTree()
PRIMARY KEY (trace_id, event_timestamp)
ORDER BY (trace_id, event_timestamp)
PARTITION BY toYYYYMM(event_timestamp)
TTL event_timestamp + INTERVAL 365 DAY;

-- Reliability snapshots table - pre-aggregated daily reliability metrics
CREATE TABLE IF NOT EXISTS reliability_snapshots
(
    id UUID,
    snapshot_date Date,
    flow_name String,
    step_name Nullable(String), -- NULL for flow-level aggregates
    total_executions UInt64,
    successful_executions UInt64,
    failed_executions UInt64,
    success_rate Float64,
    avg_duration_ms Float64,
    p50_duration_ms Float64,
    p95_duration_ms Float64,
    p99_duration_ms Float64,
    error_count_by_category String, -- JSON: {"api_error": 5, "timeout": 2}
    created_at DateTime DEFAULT now()
)
ENGINE = SummingMergeTree()
PRIMARY KEY (snapshot_date, flow_name, step_name)
ORDER BY (snapshot_date, flow_name, step_name)
PARTITION BY toYYYYMM(snapshot_date)
TTL snapshot_date + INTERVAL 365 DAY;

-- Error patterns table - track recurring errors
CREATE TABLE IF NOT EXISTS error_patterns
(
    id UUID,
    trace_id String,
    flow_name String,
    step_name String,
    error_category String,
    error_message String,
    error_code Nullable(String),
    external_service Nullable(String),
    first_seen DateTime,
    last_seen DateTime,
    occurrence_count UInt64,
    is_resolved UInt8, -- 0 or 1
    resolved_at Nullable(DateTime),
    created_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(created_at)
PRIMARY KEY (error_category, error_code, step_name)
ORDER BY (error_category, error_code, step_name, first_seen);

