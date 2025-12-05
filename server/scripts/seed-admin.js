/**
 * Seed Script - Create default admin user
 * Run with: node scripts/seed-admin.js
 */

import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

async function seedAdmin() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔄 Checking for existing admin user...');

    // Check if admin exists
    const adminCheck = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role = 'admin'"
    );
    const adminCount = parseInt(adminCheck.rows[0].count);

    if (adminCount > 0) {
      console.log(`ℹ️  Found ${adminCount} admin user(s) - skipping creation`);
      return;
    }

    console.log('👤 Creating default admin user...');

    // Create default admin
    const defaultPassword = 'AdminPass123!';
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified) 
      VALUES ($1, $2, $3, $4, $5, true, true)
    `, ['admin@rambley.com', passwordHash, 'Admin', 'User', 'admin']);

    console.log('✅ Default admin user created:');
    console.log('   Email: admin@rambley.com');
    console.log('   Password: AdminPass123!');
    console.log('   ⚠️  Please change this password after first login!');

  } catch (error) {
    console.error('❌ Error seeding admin:', error);
  } finally {
    await pool.end();
  }
}

seedAdmin();

