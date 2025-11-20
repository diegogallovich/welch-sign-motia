#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

async function runMigration() {
  const pool = new Pool({
    host: process.env.POSTGRESQL_HOST,
    port: parseInt(process.env.POSTGRESQL_PORT || '5432'),
    database: process.env.POSTGRESQL_DB,
    user: process.env.POSTGRESQL_USER,
    password: process.env.POSTGRESQL_PASSWORD,
    ssl: {
      rejectUnauthorized: false, // Same SSL config as the service
    },
  });

  try {
    console.log('🔗 Connecting to PostgreSQL...');
    const client = await pool.connect();
    console.log('✅ Connected!');

    console.log('🚀 Running migration...');
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, '../database/postgres-schema.sql'),
      'utf8'
    );

    await client.query(schemaSQL);
    console.log('✅ Migration completed successfully!');

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('\n📊 Tables in database:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));

    client.release();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

