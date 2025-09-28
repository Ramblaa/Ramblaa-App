import pool from '../config/database.js';

const fixSandboxTasks = async () => {
  const client = await pool.connect();

  try {
    console.log('Fixing sandbox_tasks table...');

    // Check if sandbox_session_id column exists
    const checkColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sandbox_tasks'
      AND column_name = 'sandbox_session_id';
    `);

    if (checkColumn.rows.length === 0) {
      console.log('Adding sandbox_session_id column to sandbox_tasks...');
      await client.query(`
        ALTER TABLE sandbox_tasks
        ADD COLUMN sandbox_session_id UUID REFERENCES sandbox_sessions(id) ON DELETE CASCADE;
      `);
      console.log('Column added successfully!');

      // Now try to create the policy
      try {
        await client.query(`
          CREATE POLICY IF NOT EXISTS sandbox_tasks_account_isolation ON sandbox_tasks
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
        `);
        console.log('Policy created successfully!');
      } catch (e) {
        console.log('Policy might already exist');
      }
    } else {
      console.log('sandbox_session_id column already exists');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
  }
};

fixSandboxTasks()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });