require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DB_DIR = path.resolve(__dirname, "src/db");

const migrations = [
    "schema.sql",
    "service_requests.sql",
    "service_requests_advanced.sql",
    "service_providers_extra_fields.sql",
    "service_providers_login.sql",
    "police_services.sql",
    "complaint_views.sql",
    "account_deletion_requests.sql",
    "complaint_messages.sql",
    "session_device_tracking.sql",
    "safe_travel_checkin_safety_net.sql",
    "advanced_settings.sql",
    "complaints_soft_delete.sql",
    "accused_linking.sql",
    "complaint_resolved_at.sql",
    "citizen_email.sql",
    "rename_sp_to_asp.sql",
    "ig_dig_range_support.sql",
    "officer_transfer_support.sql",
    "officer_designation_column.sql",
    "officer_admin_photo.sql",
    "notifications_priority.sql",
    "live_tracking_upgrade.sql",
    "field_visit_gps_encryption.sql",
    "audit_tamper_evidence.sql",
    "otp_hashing.sql",
    "all_up_districts.sql",
    "up_police_stations_ALL.sql",
    "police_station_english_names.sql",
    "backfill_station_english_names.sql",
    "station_english_names_remaining.sql",
    "fix_duplicates.sql",
    "fix_admins.sql",
    "monitor_analytics_menu.sql"
];

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    await client.connect();

    console.log("\n=============================================================");
    console.log("       ShaktiCop — SAFE MIGRATION DRY TEST");
    console.log("       NO CHANGES WILL BE COMMITTED");
    console.log("=============================================================\n");

    for (const migration of migrations) {
        const filePath = path.join(DB_DIR, migration);

        if (!fs.existsSync(filePath)) {
            console.log(`❌ ${migration} — FILE MISSING`);
            continue;
        }

        const sql = fs.readFileSync(filePath, "utf8");

        process.stdout.write(`Testing ${migration} ... `);

        try {
            await client.query("BEGIN");

            await client.query(sql);

            await client.query("ROLLBACK");

            console.log("✓ WOULD RUN SUCCESSFULLY");
        } catch (err) {
            try {
                await client.query("ROLLBACK");
            } catch (_) { }

            console.log("⚠ CONFLICT / ERROR");
            console.log(`   ${err.message}`);

            if (err.detail) {
                console.log(`   Detail: ${err.detail}`);
            }

            if (err.hint) {
                console.log(`   Hint: ${err.hint}`);
            }
        }
    }

    console.log("\n=============================================================");
    console.log("DRY TEST COMPLETE");
    console.log("NO MIGRATION WAS COMMITTED");
    console.log("=============================================================\n");

    await client.end();
}

main().catch(err => {
    console.error("\nFATAL ERROR:", err.message);
    process.exit(1);
});