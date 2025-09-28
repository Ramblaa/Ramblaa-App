import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkUsers() {
  try {
    const result = await pool.query(
      "SELECT email, first_name, last_name, role, is_active, email_verified FROM users WHERE email ILIKE '%budd.harrison%'"
    );
    console.log('Found users with budd.harrison in email:');
    console.log(result.rows);

    // Also check all users
    const allUsers = await pool.query(
      "SELECT email, first_name, last_name, role FROM users ORDER BY created_at DESC LIMIT 10"
    );
    console.log('\nLast 10 users created:');
    console.log(allUsers.rows);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();