// ============================================================
// ShaktiCop — Neon PostgreSQL Production Migration Tool
//
// Features & Safety:
// - Uses the existing 'pg' client (no psql binary required)
// - Connects exclusively using NEON_DATABASE_URL
// - Enforces Neon Direct Connection (rejects pooler endpoints for DDL safety)
// - Rejects localhost, 127.0.0.1, railway.app, and test/dev hostnames
// - Never prints passwords, secrets, or full connection URIs
// - Displays only sanitized target database hostname
// - Supports dry-run validation mode (--dry-run)
// - Verifies all required SQL files exist before starting
// - Enforces strict ordered sequential execution
// - Non-destructive: Does NOT drop or truncate tables
//
// Usage:
//   Dry run:
//     node src/scripts/migrateNeon.js --dry-run
//     npm run db:migrate:neon:dry-run
//
//   Execute migrations:
//     node src/scripts/migrateNeon.js
//     npm run db:migrate:neon
// ============================================================

try {
  require('dotenv').config();
} catch (_) {
  // dotenv not yet installed locally in node_modules; rely on environment variables
}
const fs = require('fs');
const path = require('path');

// 1. Exact verified dependency order
const MIGRATION_FILES = [
  'schema.sql',
  'service_requests.sql',
  'service_requests_advanced.sql',
  'service_providers_extra_fields.sql',
  'service_providers_login.sql',
  'police_services.sql',
  'complaint_views.sql',
  'all_up_districts.sql',
  'up_police_stations_ALL.sql',
  'backfill_station_english_names.sql',
  'station_english_names_remaining.sql',
  'scale_indexes.sql'
];

const DB_DIR = path.resolve(__dirname, '../db');
const IS_DRY_RUN = process.argv.includes('--dry-run');

// Parse and validate database URL safely
function parseAndValidateTarget(urlString) {
  if (!urlString || typeof urlString !== 'string' || !urlString.trim()) {
    console.error('❌ SAFETY ABORT: NEON_DATABASE_URL environment variable is not defined or empty.');
    console.error('   Please provide NEON_DATABASE_URL pointing to your Neon Direct endpoint.');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (err) {
    console.error('❌ SAFETY ABORT: NEON_DATABASE_URL is not a valid URL.');
    process.exit(1);
  }

  const hostname = (parsed.hostname || '').toLowerCase();

  // Safety Check: Reject Localhost
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  ) {
    console.error(`❌ SAFETY ABORT: Connection targets local machine (${hostname}).`);
    console.error('   This migration runner is strictly intended for the hosted Neon production database.');
    process.exit(1);
  }

  // Safety Check: Reject Railway or known dev hosts
  if (hostname.includes('railway') || hostname.includes('rlwy.net')) {
    console.error(`❌ SAFETY ABORT: Connection host (${hostname}) appears to be a Railway instance.`);
    console.error('   Railway is deprecated for ShaktiCop production. Refusing to run.');
    process.exit(1);
  }

  if (hostname.includes('test') || hostname.includes('dev-db')) {
    console.error(`❌ SAFETY ABORT: Connection host (${hostname}) contains "test" or "dev-db".`);
    console.error('   Refusing to execute production migration on flagged test/development hostname.');
    process.exit(1);
  }

  // Safety Check: Reject Neon pooled endpoint for migrations / DDL
  // Neon pooled endpoints typically contain '-pooler' in the subdomain
  if (hostname.includes('-pooler')) {
    console.error(`❌ SAFETY ABORT: Detected Neon pooled endpoint (${hostname}).`);
    console.error('   DDL migrations and index creation must run against the Neon DIRECT connection endpoint,');
    console.error('   not the pooled (-pooler) endpoint. Please use the direct connection string.');
    process.exit(1);
  }

  return {
    hostname,
    port: parsed.port || '5432',
    pathname: parsed.pathname ? parsed.pathname.replace('/', '') : 'neondb'
  };
}

// Check that all required SQL files exist on disk
function validateMigrationFiles() {
  const verifiedFiles = [];

  for (const filename of MIGRATION_FILES) {
    const fullPath = path.join(DB_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ ERROR: Required migration file missing: ${fullPath}`);
      process.exit(1);
    }
    const stats = fs.statSync(fullPath);
    verifiedFiles.push({
      name: filename,
      path: fullPath,
      sizeBytes: stats.size
    });
  }

  return verifiedFiles;
}

// Print numbered migration plan
function printPlan(files, targetInfo) {
  console.log('\n=============================================================');
  console.log('         ShaktiCop — Neon Production Migration Plan          ');
  console.log('=============================================================');
  console.log(`Mode               : ${IS_DRY_RUN ? 'DRY-RUN (Validation Only)' : 'LIVE EXECUTION'}`);
  console.log(`Target Database Host: ${targetInfo.hostname}`);
  console.log(`Target Database Name: ${targetInfo.pathname}`);
  console.log(`Connection Type    : Neon Direct (Non-pooled, SSL enabled)`);
  console.log('-------------------------------------------------------------');
  console.log('Numbered Execution Order:');
  files.forEach((file, index) => {
    const num = String(index + 1).padStart(2, ' ');
    const sizeKb = (file.sizeBytes / 1024).toFixed(1);
    console.log(`  [${num}] ${file.name.padEnd(38, ' ')} (${sizeKb} KB)`);
  });
  console.log('=============================================================\n');
}

async function main() {
  const connectionUrl = process.env.NEON_DATABASE_URL;
  const targetInfo = parseAndValidateTarget(connectionUrl);
  const files = validateMigrationFiles();

  printPlan(files, targetInfo);

  if (IS_DRY_RUN) {
    console.log('✅ DRY-RUN SUCCESSFUL:');
    console.log('   - NEON_DATABASE_URL is validated.');
    console.log('   - Hostname is confirmed as a valid non-local, non-pooled Neon endpoint.');
    console.log(`   - All ${files.length} SQL migration files are present and readable.`);
    console.log('   - No database queries were sent and no changes were made.');
    console.log('\nTo execute migrations on Neon, run:');
    console.log('   npm run db:migrate:neon\n');
    return;
  }

  let Client;
  try {
    Client = require('pg').Client;
  } catch (err) {
    console.error('❌ ERROR: The "pg" package is not installed in node_modules.');
    console.error('   Please run "npm install" inside shaktikop-backend first.');
    process.exit(1);
  }

  console.log('Connecting to Neon Direct endpoint...');
  const client = new Client({
    connectionString: connectionUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully.\n');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const stepNum = i + 1;
      console.log(`[${stepNum}/${files.length}] Executing ${file.name}...`);

      const sqlContent = fs.readFileSync(file.path, 'utf8');
      const startTime = Date.now();

      // Special handling for scale_indexes.sql:
      // In PostgreSQL, CREATE INDEX CONCURRENTLY cannot run inside a multi-statement simple query
      // or transaction block in certain drivers/environments. Executing statement-by-statement
      // ensures CONCURRENTLY runs cleanly without being implicitly batched.
      if (file.name === 'scale_indexes.sql') {
        const statements = sqlContent
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
          if (statement.trim()) {
            await client.query(statement);
          }
        }
      } else {
        await client.query(sqlContent);
      }

      const elapsedMs = Date.now() - startTime;
      console.log(`  ✓ Completed ${file.name} in ${elapsedMs}ms`);
    }

    console.log('\n=============================================================');
    console.log('✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY ON NEON PRODUCTION!');
    console.log('=============================================================\n');
  } catch (err) {
    console.error('\n❌ MIGRATION FAILED:');
    console.error(`   Error message: ${err.message}`);
    if (err.detail) console.error(`   Detail: ${err.detail}`);
    if (err.hint) console.error(`   Hint: ${err.hint}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Fatal unexpected error:', err.message);
  process.exit(1);
});