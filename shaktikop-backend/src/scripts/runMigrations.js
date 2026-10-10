// ============================================================
// ShaktiCop — Universal PostgreSQL Migration Runner
//
// Features:
// - Works across all environments: Render, Neon, Supabase, Railway, Local Postgres
// - Uses 'pg' client directly (Zero dependency on external 'psql' binary)
// - Automatically resolves DATABASE_URL, PGURL, or NEON_DATABASE_URL
// - Creates and manages 'schema_migrations' tracking table
// - Tracks execution timestamp and duration for every migration
// - Handles 'CONCURRENTLY' indexes safely (executes outside transaction blocks)
// - Supports --dry-run, --status, --file=<name>, and --force
// - Fully idempotent: Safe to run repeatedly
// ============================================================

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_DIR = path.resolve(__dirname, '../db');

// Ordered migration pipeline matching schema dependencies
const MIGRATION_PIPELINE = [
  // 1. Core Schema Baseline
  { name: 'schema.sql', description: 'Core ShaktiCop Schema (28 tables, triggers, enums)' },

  // 2. Auxiliary Tables & Feature Modules
  { name: 'service_requests.sql', description: 'Citizen Police Service Requests table' },
  { name: 'service_requests_advanced.sql', description: 'Service Requests advanced columns & priorities' },
  { name: 'service_providers_extra_fields.sql', description: 'Counsellors & Support NGOs registry' },
  { name: 'service_providers_login.sql', description: 'Counsellor authentication & session management' },
  { name: 'police_services.sql', description: 'Police Services catalog & master list' },
  { name: 'complaint_views.sql', description: 'Officer first-view accountability tracking' },
  { name: 'account_deletion_requests.sql', description: 'DPDP Act Right-to-Erasure workflow' },
  { name: 'complaint_messages.sql', description: 'In-app 1-on-1 Case chat between citizen and IO' },

  // 3. Schema Patches & Idempotent Column Additions
  { name: 'session_device_tracking.sql', description: 'Multi-device session & device name tracking' },
  { name: 'safe_travel_checkin_safety_net.sql', description: 'Server-side automated checkin escalation' },
  { name: 'advanced_settings.sql', description: 'Station geo-tagging & officer notification preferences' },
  { name: 'complaints_soft_delete.sql', description: 'Soft-delete support for complaints' },
  { name: 'accused_linking.sql', description: 'Accused encrypted details & blind-index hashes' },
  { name: 'complaint_resolved_at.sql', description: 'Independent resolution timestamp for accurate SLAs' },
  { name: 'citizen_email.sql', description: 'Optional email support for citizens' },
  { name: 'rename_sp_to_asp.sql', description: 'Update legacy SP designation to ASP' },
  { name: 'ig_dig_range_support.sql', description: 'Multi-district range supervision for IG/DIG' },
  { name: 'officer_transfer_support.sql', description: 'PNO reuse across stations upon transfer' },
  { name: 'officer_designation_column.sql', description: 'Officer functional designation column' },
  { name: 'officer_admin_photo.sql', description: 'Officer & Admin profile photo storage' },
  { name: 'officer_soft_delete.sql', description: 'Safe soft-delete support for officers' },
  { name: 'notifications_priority.sql', description: 'Priority levels for in-app notifications' },
  { name: 'live_tracking_upgrade.sql', description: 'Live location trail enhancements' },
  { name: 'field_visit_gps_encryption.sql', description: 'AES-256 encrypted GPS check-ins for field visits' },
  { name: 'audit_tamper_evidence.sql', description: 'HMAC cryptographic seal on activity logs' },
  { name: 'otp_hashing.sql', description: 'One-time passwords stored as SHA-256 hashes' },

  // 4. Master Geographical & Station Registry
  { name: 'all_up_districts.sql', description: 'Master registry of all 75 UP Districts' },
  { name: 'up_police_stations_ALL.sql', description: 'Master registry of 1,561 UP Police Stations' },
  { name: 'police_station_english_names.sql', description: 'English name columns for police stations' },
  { name: 'backfill_station_english_names.sql', description: 'English names backfill (Part 1)' },
  { name: 'station_english_names_remaining.sql', description: 'English names backfill (Part 2 - complete)' },

  // 5. Data Hygiene & Constraint Hardening
  { name: 'fix_duplicates.sql', description: 'Deduplicate banners, helplines, schemes, and add unique constraints' },
  { name: 'fix_admins.sql', description: 'Correct admin ranks and district boundaries' },

  { name: 'monitor_analytics_menu.sql', description: 'Grant analytics & leaderboard menu access to DSP/ASP/SSP' },
  { name: 'scale_indexes.sql', description: '10 state-scale concurrent indexes for sub-second queries' },
  { name: 'consolidate_gautam_buddha_nagar.sql', description: 'Consolidate Noida into Gautam Buddha Nagar (75 Canonical UP Districts)' },
  { name: 'single_district_admin_constraint.sql', description: 'Enforce single active primary District Admin per district' },
];

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isStatusOnly = args.includes('--status');
const isForce = args.includes('--force');
const fileArg = args.find((a) => a.startsWith('--file=') || a === '-f');
const specificFile = fileArg
  ? (fileArg.includes('=') ? fileArg.split('=')[1] : args[args.indexOf(fileArg) + 1])
  : null;
const urlArg = args.find((a) => a.startsWith('--url=') || a === '-u');
const customUrl = urlArg
  ? (urlArg.includes('=') ? urlArg.split('=')[1] : args[args.indexOf(urlArg) + 1])
  : null;
const isListOnly = args.includes('--list') || args.includes('-l');

if (isListOnly) {
  console.log('\n=============================================================');
  console.log('         ShaktiCop — Migration Pipeline Catalog              ');
  console.log('=============================================================');
  console.log(`Total Migrations: ${MIGRATION_PIPELINE.length}`);
  console.log('-------------------------------------------------------------');
  MIGRATION_PIPELINE.forEach((m, i) => {
    const num = String(i + 1).padStart(2, ' ');
    const filePath = path.join(DB_DIR, m.name);
    const sizeKb = fs.existsSync(filePath) ? (fs.statSync(filePath).size / 1024).toFixed(1) + ' KB' : 'MISSING';
    console.log(`  [${num}] ${m.name.padEnd(38, ' ')} (${sizeKb.padStart(9, ' ')}) — ${m.description}`);
  });
  console.log('=============================================================\n');
  process.exit(0);
}

function getConnectionString() {
  const url =
    customUrl ||
    process.env.DATABASE_URL ||
    process.env.PGURL ||
    process.env.NEON_DATABASE_URL ||
    process.env.RENDER_DATABASE_URL;

  if (!url || !url.trim()) {
    console.error('\n❌ DATABASE CONNECTION ERROR:');
    console.error('   No database connection URL found.');
    console.error('   Please provide one using:');
    console.error('     1. Environment variable: DATABASE_URL, PGURL, or NEON_DATABASE_URL');
    console.error('     2. Command line flag: node src/scripts/runMigrations.js --url="postgresql://user:pass@host:5432/dbname"');
    console.error('     3. Or define DATABASE_URL inside your .env file.\n');
    process.exit(1);
  }
  return url.trim();
}

function sanitizeUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const user = parsed.username ? parsed.username : '';
    const auth = user ? `${user}:••••••@` : '';
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${auth}${parsed.hostname}${port}${parsed.pathname}`;
  } catch (_) {
    return 'postgresql://••••••';
  }
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_ms INTEGER
    );
  `);
}

async function getAppliedMigrations(client) {
  const res = await client.query('SELECT name, applied_at, duration_ms FROM schema_migrations ORDER BY id ASC');
  const map = new Map();
  for (const row of res.rows) {
    map.set(row.name, { appliedAt: row.applied_at, durationMs: row.duration_ms });
  }
  return map;
}

async function recordMigration(client, name, durationMs) {
  await client.query(
    `INSERT INTO schema_migrations (name, applied_at, duration_ms)
     VALUES ($1, now(), $2)
     ON CONFLICT (name) DO UPDATE SET applied_at = now(), duration_ms = $2`,
    [name, durationMs]
  );
}

// Executes an individual SQL file safely
async function executeMigrationFile(client, filename, filePath) {
  const sqlContent = fs.readFileSync(filePath, 'utf8');
  const startTime = Date.now();

  // Special handling for scale_indexes.sql:
  // CREATE INDEX CONCURRENTLY cannot run inside a multi-statement transaction or batch.
  if (filename === 'scale_indexes.sql') {
    const rawStatements = sqlContent
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of rawStatements) {
      if (stmt.trim()) {
        try {
          await client.query(stmt);
        } catch (err) {
          // If index already exists or table does not exist, log cleanly
          if (err.message && err.message.includes('already exists')) {
            // Already present, safe to continue
          } else {
            throw err;
          }
        }
      }
    }
  } else {
    // Standard migration
    await client.query(sqlContent);
  }

  return Date.now() - startTime;
}

async function main() {
  const connectionUrl = getConnectionString();
  const sanitized = sanitizeUrl(connectionUrl);

  let parsedHost = 'remote';
  try {
    parsedHost = new URL(connectionUrl).hostname;
  } catch (_) {}

  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(parsedHost);

  console.log('\n=============================================================');
  console.log('            ShaktiCop — Database Migration Runner           ');
  console.log('=============================================================');
  console.log(`Target Database : ${sanitized}`);
  console.log(`Mode            : ${isDryRun ? '🔍 DRY RUN (Preview only)' : isStatusOnly ? '📊 STATUS CHECK' : '⚡ LIVE EXECUTION'}`);
  console.log('=============================================================\n');

  // Verify all files on disk
  for (const m of MIGRATION_PIPELINE) {
    const p = path.join(DB_DIR, m.name);
    if (!fs.existsSync(p)) {
      console.error(`❌ ERROR: Migration file missing: ${m.name} (${p})`);
      process.exit(1);
    }
  }

  // Connect via pg client
  const client = new Client({
    connectionString: connectionUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✓ Successfully connected to PostgreSQL.\n');

    await ensureMigrationTable(client);
    const appliedMap = await getAppliedMigrations(client);

    // Determine target files
    let targetList = MIGRATION_PIPELINE;
    if (specificFile) {
      const match = MIGRATION_PIPELINE.find((m) => m.name.toLowerCase() === specificFile.toLowerCase());
      if (!match) {
        console.error(`❌ ERROR: Specified migration "${specificFile}" not found in pipeline.`);
        console.error('   Available migrations:\n' + MIGRATION_PIPELINE.map((m) => `   - ${m.name}`).join('\n'));
        process.exit(1);
      }
      targetList = [match];
    }

    console.log('Migration Status:');
    console.log('-------------------------------------------------------------');
    const pending = [];
    targetList.forEach((m, idx) => {
      const isApplied = appliedMap.has(m.name);
      const statusSymbol = isApplied ? '✅ [APPLIED]' : '⏳ [PENDING]';
      const appliedInfo = isApplied
        ? `(at ${new Date(appliedMap.get(m.name).appliedAt).toLocaleString()})`
        : '';
      console.log(`  ${String(idx + 1).padStart(2, ' ')}. ${statusSymbol} ${m.name.padEnd(38, ' ')} ${appliedInfo}`);
      if (!isApplied || isForce) {
        pending.push(m);
      }
    });
    console.log('-------------------------------------------------------------\n');

    if (isStatusOnly) {
      console.log(`Total: ${targetList.length} | Applied: ${appliedMap.size} | Pending: ${pending.length}\n`);
      return;
    }

    if (pending.length === 0) {
      console.log('✨ All migrations are up to date! Nothing to execute.\n');
      return;
    }

    if (isDryRun) {
      console.log(`🔍 DRY RUN COMPLETE: ${pending.length} migration(s) pending execution:`);
      pending.forEach((p, i) => console.log(`   ${i + 1}. ${p.name} — ${p.description}`));
      console.log('\nTo apply these migrations live, run:');
      console.log('   npm run db:migrate\n');
      return;
    }

    console.log(`⚡ Executing ${pending.length} pending migration(s)...\n`);

    for (let i = 0; i < pending.length; i++) {
      const m = pending[i];
      const filePath = path.join(DB_DIR, m.name);
      const stepStr = `[${i + 1}/${pending.length}]`;

      process.stdout.write(`  ${stepStr} Running ${m.name}... `);
      try {
        const durationMs = await executeMigrationFile(client, m.name, filePath);
        await recordMigration(client, m.name, durationMs);
        console.log(`✓ DONE (${durationMs}ms)`);
      } catch (err) {
        console.log(`❌ FAILED`);
        console.error(`\n❌ MIGRATION ERROR in "${m.name}":`);
        console.error(`   Message: ${err.message}`);
        if (err.detail) console.error(`   Detail : ${err.detail}`);
        if (err.hint) console.error(`   Hint   : ${err.hint}`);
        if (err.position) console.error(`   Position: ${err.position}`);
        console.error('\nExecution aborted to preserve database consistency.\n');
        process.exit(1);
      }
    }

    console.log('\n=============================================================');
    console.log('✅ ALL PENDING MIGRATIONS APPLIED SUCCESSFULLY!');
    console.log('=============================================================\n');

  } catch (err) {
    console.error('\n❌ DATABASE CONNECTION FAILED:');
    console.error(`   ${err.message}\n`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
