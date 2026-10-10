// ============================================================
// checkConsolidationMigration.js
//
// Read-only inspection script:
// Checks schema_migrations table for any entries matching 'gautam' or 'consolidate'.
// Does not modify data, schema, or print sensitive database credentials.
// ============================================================

require('dotenv').config({ quiet: true });
const { Client } = require('pg');

async function checkConsolidationMigration() {
  const connectionUrl =
    process.env.DATABASE_URL ||
    process.env.PGURL ||
    process.env.NEON_DATABASE_URL;

  if (!connectionUrl) {
    console.error('❌ Error: DATABASE_URL not found in environment or .env file.');
    process.exit(1);
  }

  const isLocalhost = connectionUrl.includes('localhost') || connectionUrl.includes('127.0.0.1');
  const client = new Client({
    connectionString: connectionUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const sql = `
      SELECT id, name, applied_at
      FROM schema_migrations
      WHERE name ILIKE '%gautam%' OR name ILIKE '%consolidate%'
      ORDER BY id
    `;

    const res = await client.query(sql);

    console.log('\n=============================================================');
    console.log('       ShaktiCop — schema_migrations Read-Only Check         ');
    console.log('=============================================================');
    if (res.rows.length === 0) {
      console.log('No matching records found (0 rows matching %gautam% or %consolidate%).');
    } else {
      console.table(res.rows);
    }
    console.log(`Total matching records: ${res.rows.length}`);
    console.log('=============================================================\n');
  } catch (err) {
    console.error('❌ Database query error:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

checkConsolidationMigration();
