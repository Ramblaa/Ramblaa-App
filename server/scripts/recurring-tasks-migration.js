/**
 * Migration: Add recurring task columns to tasks table (consolidated approach)
 * Run with: node server/scripts/recurring-tasks-migration.js
 */

import { config } from 'dotenv';
config();

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('[Migration] Starting recurring tasks migration (consolidated)...');
    
    // Add recurring columns to tasks table
    const columnsToAdd = [
      { name: 'is_recurring_template', type: 'BOOLEAN DEFAULT false' },
      { name: 'repeat_type', type: "TEXT DEFAULT 'NONE'" },
      { name: 'interval_days', type: 'INTEGER DEFAULT 1' },
      { name: 'recurrence_end_date', type: 'DATE' },
      { name: 'time_of_day', type: "TEXT DEFAULT '09:00'" },
      { name: 'max_occurrences', type: 'INTEGER' },
      { name: 'occurrences_created', type: 'INTEGER DEFAULT 0' },
      { name: 'next_run_at', type: 'TIMESTAMP' },
      { name: 'last_run_at', type: 'TIMESTAMP' },
      { name: 'parent_task_id', type: 'TEXT' },
    ];
    
    for (const col of columnsToAdd) {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = $1
      `, [col.name]);
      
      if (check.rows.length === 0) {
        await client.query(`ALTER TABLE tasks ADD COLUMN ${col.name} ${col.type}`);
        console.log(`[Migration] Added ${col.name} column to tasks`);
      } else {
        console.log(`[Migration] ${col.name} column already exists`);
      }
    }
    
    // Create indexes for recurring task queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_recurring_template ON tasks(is_recurring_template)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run_at)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)
    `);
    console.log('[Migration] Created indexes for recurring tasks');
    
    // Drop the separate recurring_tasks table if it exists (cleanup)
    await client.query(`DROP TABLE IF EXISTS recurring_tasks`);
    console.log('[Migration] Dropped recurring_tasks table (if existed)');
    
    console.log('[Migration] ✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('[Migration] ❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
