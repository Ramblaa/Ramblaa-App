/**
 * PostgreSQL Database Connection
 * Uses Railway's PostgreSQL database for persistent storage
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../config/env.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pool = null;

export function getDb() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

export async function initDatabase() {
  // Create PostgreSQL connection pool
  pool = new Pool({
    connectionString: config.database.url,
    ssl: config.server.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
  });

  // Test connection
  const client = await pool.connect();
  console.log('[DB] Connected to PostgreSQL');
  
  // Run schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  
  try {
    await client.query(schema);
    console.log('[DB] Schema initialized');
  } catch (error) {
    // Tables might already exist, that's OK
    if (!error.message.includes('already exists')) {
      console.error('[DB] Schema error:', error.message);
    }
  } finally {
    client.release();
  }

  return pool;
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Wrapper to provide consistent API
class PreparedStatement {
  constructor(pool, sql) {
    this.pool = pool;
    this.sql = sql;
  }

  async get(...params) {
    try {
      const flatParams = params.flat();
      const result = await this.pool.query(this.sql, flatParams);
      return result.rows[0] || undefined;
    } catch (e) {
      console.error('[DB] get error:', e.message, 'SQL:', this.sql);
      return undefined;
    }
  }

  async all(...params) {
    try {
      const flatParams = params.flat();
      const result = await this.pool.query(this.sql, flatParams);
      return result.rows;
    } catch (e) {
      console.error('[DB] all error:', e.message, 'SQL:', this.sql);
      return [];
    }
  }

  async run(...params) {
    try {
      const flatParams = params.flat();
      const result = await this.pool.query(this.sql, flatParams);
      return {
        changes: result.rowCount,
        lastInsertRowid: 0,
      };
    } catch (e) {
      console.error('[DB] run error:', e.message, 'SQL:', this.sql);
      return { changes: 0, lastInsertRowid: 0 };
    }
  }
}

// Database wrapper with prepare method
export const dbWrapper = {
  prepare(sql) {
    // Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
    let paramIndex = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
    return new PreparedStatement(pool, pgSql);
  },

  async query(sql, params = []) {
    let paramIndex = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
    const result = await pool.query(pgSql, params);
    return result.rows;
  },

  async run(sql, params = []) {
    let paramIndex = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
    const result = await pool.query(pgSql, params);
    return { changes: result.rowCount };
  },
};

// Export getDb that returns the wrapper
export function getDbWithPrepare() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbWrapper;
}

export default { 
  getDb: getDbWithPrepare, 
  initDatabase, 
  closeDatabase,
};
