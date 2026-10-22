/**
 * Database Migration Script
 * Reads schema.sql and executes DDL statements within a transaction to set up PostgreSQL tables.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Executes schema.sql inside a transaction and exits with status 0 on success or 1 on failure.
 */
async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    // Run schema migrations atomically
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('Migrations applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Release client back to the pool and close pool
    client.release();
    await pool.end();
  }
}

migrate();

