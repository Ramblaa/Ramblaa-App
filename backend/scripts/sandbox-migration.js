import pool from '../config/database.js';

const runMigration = async () => {
  const client = await pool.connect();

  try {
    console.log('Starting sandbox migration...');

    // First check what already exists
    console.log('Checking existing schema...');

    const existingTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('sandbox_sessions', 'sandbox_ai_processing', 'sandbox_tasks');
    `);
    const existingTableNames = existingTables.rows.map(r => r.table_name);
    console.log('Existing tables:', existingTableNames);

    // Check existing columns in message_log
    const existingColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'message_log'
      AND column_name IN ('is_sandbox', 'sandbox_session_id', 'sandbox_metadata');
    `);
    const existingColumnNames = existingColumns.rows.map(r => r.column_name);
    console.log('Existing message_log columns:', existingColumnNames);

    // Start transaction for actual changes
    await client.query('BEGIN');

    // Add sandbox fields to message_log table (if they don't exist)
    if (!existingColumnNames.includes('is_sandbox')) {
      console.log('Adding is_sandbox column...');
      await client.query(`ALTER TABLE message_log ADD COLUMN is_sandbox BOOLEAN DEFAULT FALSE;`);
    }
    if (!existingColumnNames.includes('sandbox_session_id')) {
      console.log('Adding sandbox_session_id column...');
      await client.query(`ALTER TABLE message_log ADD COLUMN sandbox_session_id UUID;`);
    }
    if (!existingColumnNames.includes('sandbox_metadata')) {
      console.log('Adding sandbox_metadata column...');
      await client.query(`ALTER TABLE message_log ADD COLUMN sandbox_metadata JSONB;`);
    }

    // Create sandbox_sessions table if it doesn't exist
    if (!existingTableNames.includes('sandbox_sessions')) {
      console.log('Creating sandbox_sessions table...');
      await client.query(`
        CREATE TABLE sandbox_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          account_id INTEGER NOT NULL REFERENCES accounts(id),
          created_by INTEGER REFERENCES users(id),
          session_name VARCHAR(255),
          scenario_data JSONB NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }

    // Create sandbox_ai_processing table if it doesn't exist
    if (!existingTableNames.includes('sandbox_ai_processing')) {
      console.log('Creating sandbox_ai_processing table...');
      await client.query(`
        CREATE TABLE sandbox_ai_processing (
          id SERIAL PRIMARY KEY,
          sandbox_session_id UUID NOT NULL REFERENCES sandbox_sessions(id) ON DELETE CASCADE,
          message_uuid VARCHAR(255) NOT NULL,
          processing_type VARCHAR(50) NOT NULL,
          input_data JSONB,
          output_data JSONB,
          ai_model VARCHAR(100),
          processing_status VARCHAR(50) DEFAULT 'pending',
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP
        );
      `);
    }

    // Create sandbox_tasks table if it doesn't exist
    if (!existingTableNames.includes('sandbox_tasks')) {
      console.log('Creating sandbox_tasks table...');
      await client.query(`
        CREATE TABLE sandbox_tasks (
          id SERIAL PRIMARY KEY,
          sandbox_session_id UUID NOT NULL REFERENCES sandbox_sessions(id) ON DELETE CASCADE,
          task_uuid VARCHAR(255) NOT NULL,
          task_type VARCHAR(50),
          title VARCHAR(500),
          description TEXT,
          property_id VARCHAR(255),
          assignee_name VARCHAR(255),
          assignee_role VARCHAR(100),
          status VARCHAR(50) DEFAULT 'pending',
          priority VARCHAR(20) DEFAULT 'medium',
          due_date DATE,
          due_time TIME,
          created_from_message_uuid VARCHAR(255),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }

    // Commit the transaction
    await client.query('COMMIT');
    console.log('Tables created successfully!');

    // Create indexes outside of transaction (they auto-commit anyway)
    console.log('Creating indexes...');

    // Check if sandbox_session_id column exists before creating index
    const messageLogColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'message_log'
      AND column_name = 'sandbox_session_id';
    `);

    if (messageLogColumns.rows.length > 0) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_message_log_sandbox
          ON message_log(sandbox_session_id)
          WHERE is_sandbox = TRUE;
        `);
        console.log('Created idx_message_log_sandbox');
      } catch (e) {
        console.log('Index idx_message_log_sandbox might already exist');
      }
    }

    // Create other indexes
    const indexQueries = [
      { table: 'sandbox_sessions', sql: `CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_account ON sandbox_sessions(account_id);` },
      { table: 'sandbox_ai_processing', sql: `CREATE INDEX IF NOT EXISTS idx_sandbox_ai_processing_session ON sandbox_ai_processing(sandbox_session_id);` },
      { table: 'sandbox_tasks', sql: `CREATE INDEX IF NOT EXISTS idx_sandbox_tasks_session ON sandbox_tasks(sandbox_session_id);` },
      { table: 'sandbox_tasks', sql: `CREATE INDEX IF NOT EXISTS idx_sandbox_tasks_status ON sandbox_tasks(status);` }
    ];

    for (const { table, sql } of indexQueries) {
      // Check if table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = $1
        );
      `, [table]);

      if (tableExists.rows[0].exists) {
        try {
          await client.query(sql);
          console.log(`Created index on ${table}`);
        } catch (e) {
          console.log(`Index on ${table} might already exist`);
        }
      }
    }

    // Add RLS policies
    console.log('Setting up RLS policies...');

    // Enable RLS on tables (if they exist)
    for (const table of ['sandbox_sessions', 'sandbox_ai_processing', 'sandbox_tasks']) {
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = $1
        );
      `, [table]);

      if (tableExists.rows[0].exists) {
        try {
          await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
          console.log(`RLS enabled for ${table}`);
        } catch (e) {
          console.log(`RLS might already be enabled for ${table}`);
        }
      }
    }

    // Create RLS policies (checking if they already exist)
    const policies = [
      {
        name: 'sandbox_sessions_account_isolation',
        table: 'sandbox_sessions',
        sql: `
          CREATE POLICY sandbox_sessions_account_isolation ON sandbox_sessions
          FOR ALL
          USING (account_id = COALESCE(
            NULLIF(current_setting('app.current_account_id', true), '')::INTEGER,
            (SELECT account_id FROM users WHERE id = COALESCE(
              NULLIF(current_setting('app.current_user_id', true), '')::INTEGER,
              0
            ))
          ));
        `
      },
      {
        name: 'sandbox_ai_processing_account_isolation',
        table: 'sandbox_ai_processing',
        sql: `
          CREATE POLICY sandbox_ai_processing_account_isolation ON sandbox_ai_processing
          FOR ALL
          USING (
            sandbox_session_id IN (
              SELECT id FROM sandbox_sessions
              WHERE account_id = COALESCE(
                NULLIF(current_setting('app.current_account_id', true), '')::INTEGER,
                (SELECT account_id FROM users WHERE id = COALESCE(
                  NULLIF(current_setting('app.current_user_id', true), '')::INTEGER,
                  0
                ))
              )
            )
          );
        `
      },
      {
        name: 'sandbox_tasks_account_isolation',
        table: 'sandbox_tasks',
        sql: `
          CREATE POLICY sandbox_tasks_account_isolation ON sandbox_tasks
          FOR ALL
          USING (
            sandbox_session_id IN (
              SELECT id FROM sandbox_sessions
              WHERE account_id = COALESCE(
                NULLIF(current_setting('app.current_account_id', true), '')::INTEGER,
                (SELECT account_id FROM users WHERE id = COALESCE(
                  NULLIF(current_setting('app.current_user_id', true), '')::INTEGER,
                  0
                ))
              )
            )
          );
        `
      }
    ];

    for (const { name, table, sql } of policies) {
      // Check if table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = $1
        );
      `, [table]);

      if (tableExists.rows[0].exists) {
        // Check if policy already exists
        const policyExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM pg_policies
            WHERE tablename = $1 AND policyname = $2
          );
        `, [table, name]);

        if (!policyExists.rows[0].exists) {
          try {
            await client.query(sql);
            console.log(`Created policy ${name}`);
          } catch (e) {
            console.log(`Error creating policy ${name}:`, e.message);
          }
        } else {
          console.log(`Policy ${name} already exists`);
        }
      }
    }

    console.log('Sandbox migration completed successfully!');

  } catch (error) {
    // Try to rollback if we're in a transaction
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Ignore rollback errors
    }
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run the migration
runMigration()
  .then(() => {
    console.log('Migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration error:', error);
    process.exit(1);
  });