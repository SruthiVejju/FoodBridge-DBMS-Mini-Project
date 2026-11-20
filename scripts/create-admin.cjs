// Provision an admin account locally: never permit public registration as ADMIN.
const { config } = require('dotenv');
config({ path: '.env.local' });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Set ADMIN_EMAIL to a valid email');
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters and no more than 72 UTF-8 bytes');
  }
  const pool = new Pool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const organization = await client.query(
      `INSERT INTO organizations
       (org_name, org_type, address, contact_person, contact_phone, verification_status)
       VALUES ('FoodBridge Administration', 'ADMIN', 'Internal Administration', 'Administrator', '0000000000', 'VERIFIED')
       RETURNING org_id`
    );
    await client.query(
      `INSERT INTO users (org_id, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [organization.rows[0].org_id, 'FoodBridge Administrator', email, await bcrypt.hash(password, 12)]
    );
    await client.query('COMMIT');
    console.log('Admin account created:', email);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((err) => { console.error('Admin creation failed:', err.message); process.exitCode = 1; });
