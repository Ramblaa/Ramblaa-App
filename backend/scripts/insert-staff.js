import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const insertStaff = async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔄 Connecting to database...');
    
    // Staff data to insert
    const staffData = {
      property_id: 1,
      staff_id: 1,
      staff_name: "Made Wiratni",
      phone: "whatsapp:+31630211666",
      preferred_language: "id",
      role: "Staff"
    };

    // Check if staff already exists
    const checkQuery = `
      SELECT id, staff_name FROM staff 
      WHERE staff_id = $1 AND property_id = $2
    `;
    const checkResult = await pool.query(checkQuery, [staffData.staff_id, staffData.property_id]);
    
    if (checkResult.rows.length > 0) {
      console.log(`⚠️ Staff member already exists: ${checkResult.rows[0].staff_name} (ID: ${checkResult.rows[0].id})`);
      console.log('Updating existing record...');
      
      const updateQuery = `
        UPDATE staff SET
          staff_name = $1,
          phone = $2,
          preferred_language = $3,
          role = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE staff_id = $5 AND property_id = $6
        RETURNING id, staff_id, staff_name, phone, preferred_language, role, property_id
      `;
      
      const updateResult = await pool.query(updateQuery, [
        staffData.staff_name,
        staffData.phone,
        staffData.preferred_language,
        staffData.role,
        staffData.staff_id,
        staffData.property_id
      ]);
      
      console.log('✅ Staff record updated:');
      console.log(updateResult.rows[0]);
    } else {
      // Insert new staff record
      const insertQuery = `
        INSERT INTO staff (
          account_id, property_id, staff_id, staff_name, 
          phone, preferred_language, role
        ) VALUES (
          1, $1, $2, $3, $4, $5, $6
        ) RETURNING id, staff_id, staff_name, phone, preferred_language, role, property_id
      `;

      const insertResult = await pool.query(insertQuery, [
        staffData.property_id,
        staffData.staff_id,
        staffData.staff_name,
        staffData.phone,
        staffData.preferred_language,
        staffData.role
      ]);

      console.log('✅ Staff record inserted successfully:');
      console.log(insertResult.rows[0]);
    }

    // Show all staff records
    console.log('\n📋 All staff records:');
    const allStaff = await pool.query('SELECT id, staff_id, staff_name, phone, role, property_id FROM staff ORDER BY staff_id');
    console.table(allStaff.rows);

  } catch (error) {
    console.error('💥 Error:', error.message);
    throw error;
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
};

insertStaff()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

