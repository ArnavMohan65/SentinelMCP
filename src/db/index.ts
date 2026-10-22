/**
 * PostgreSQL Database Connection Module
 * Initializes and exports a centralized pg Pool using the DATABASE_URL environment variable.
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Shared connection pool for executing database queries
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;

