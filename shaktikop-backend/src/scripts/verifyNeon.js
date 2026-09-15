// ============================================================
// ShaktiCop — Neon Production Read-Only Verification Tool
//
// Read-Only checks:
// - A. Database connection test
// - B. Core tables check
// - C. Service provider & counselling tables check
// - D. Police service tables check
// - E. District data existence & count
// - F. Police station data existence & count
// - G. Required indexes verification
// - H. Zero demo/development seed accounts check
// - I. Major data tables row counts
// ============================================================

try {
  require('dotenv').config();
} catch (_) {}

const { Client } = require('pg');

async function verify() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) {
    console.error('❌ ERROR: NEON_DATABASE_URL is not set.');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    console.error('❌ ERROR: Invalid NEON_DATABASE_URL.');
    process.exit(1);
  }

  console.log('\n=============================================================');
  console.log('         ShaktiCop — Neon Read-Only Verification             ');
  console.log('=============================================================');
  console.log(`Target Host: ${parsed.hostname}`);
  console.log(`Target DB  : ${parsed.pathname.replace('/', '')}`);
  console.log('-------------------------------------------------------------');

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✓ [A] Database connection: SUCCESS\n');

    // B, C, D: Check tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tables = tableRes.rows.map(r => r.table_name);
    console.log(`Total Public Tables: ${tables.length}`);

    const coreTables = ['citizens', 'officers', 'admins', 'complaints', 'activity_logs', 'police_stations'];
    const serviceTables = ['counselling_requests', 'service_providers', 'service_request_history'];
    const policeServiceTables = ['police_services'];

    const checkGroup = (label, required) => {
      const missing = required.filter(t => !tables.includes(t));
      if (missing.length === 0) {
        console.log(`✓ [${label}] All expected tables present: (${required.join(', ')})`);
      } else {
        console.error(`❌ [${label}] Missing tables: ${missing.join(', ')}`);
      }
    };

    checkGroup('B: Core Tables', coreTables);
    checkGroup('C: Counselling/Provider Tables', serviceTables);
    checkGroup('D: Police Services Table', policeServiceTables);

    // E: District Data
    const districtRes = await client.query(`
      SELECT COUNT(DISTINCT district) as total_districts 
      FROM police_stations 
      WHERE district IS NOT NULL;
    `);
    console.log(`✓ [E] District Data: ${districtRes.rows[0].total_districts} distinct districts found in police_stations.`);

    // F: Police Station Data
    const stationRes = await client.query(`
      SELECT COUNT(*) as total_stations 
      FROM police_stations;
    `);
    console.log(`✓ [F] Police Station Data: ${stationRes.rows[0].total_stations} total police stations recorded.`);

    // G: Scale Indexes
    const indexRes = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND indexname IN (
          'idx_complaints_active_recent',
          'idx_complaints_district_recent',
          'idx_complaints_station_recent',
          'idx_complaints_officer_recent',
          'idx_complaints_citizen_recent',
          'idx_complaints_sos_active',
          'idx_complaints_open_oldest',
          'idx_trail_recorded_at',
          'idx_notifications_recipient_recent',
          'idx_activity_logs_created'
        );
    `);
    console.log(`✓ [G] Verified High-Scale Indexes: ${indexRes.rows.length}/10 present.`);

    // H: Demo Seed Accounts Check
    const citizenCount = await client.query(`SELECT COUNT(*) as c FROM citizens;`);
    const officerCount = await client.query(`SELECT COUNT(*) as c FROM officers;`);
    const adminCount = await client.query(`SELECT COUNT(*) as c FROM admins;`);

    const hasDemoData = Number(citizenCount.rows[0].c) > 0 || Number(officerCount.rows[0].c) > 0 || Number(adminCount.rows[0].c) > 0;
    if (!hasDemoData) {
      console.log('✓ [H] Seed Accounts Check: ZERO demo/seed accounts present (clean production state).');
    } else {
      console.warn(`⚠️ [H] WARNING: Existing accounts found - Citizens: ${citizenCount.rows[0].c}, Officers: ${officerCount.rows[0].c}, Admins: ${adminCount.rows[0].c}`);
    }

    // I: Major Table Row Counts
    console.log('\n--- [I] Row Counts for Major Tables ---');
    const tablesToCount = [
      'police_stations',
      'police_services',
      'citizens',
      'officers',
      'admins',
      'complaints',
      'counselling_requests',
      'service_providers',
      'activity_logs'
    ];

    for (const tbl of tablesToCount) {
      if (tables.includes(tbl)) {
        const cntRes = await client.query(`SELECT COUNT(*) as cnt FROM "${tbl}";`);
        console.log(`  - ${tbl.padEnd(25, ' ')} : ${cntRes.rows[0].cnt}`);
      }
    }

    console.log('\n=============================================================');
    console.log('✓ [J] Read-Only Verification Finished Successfully!');
    console.log('=============================================================\n');
  } catch (err) {
    console.error('❌ Verification Error:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

verify();
