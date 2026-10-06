require("dotenv").config();
const fs = require("fs");
const path = require("path");

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
    "monitor_analytics_menu.sql",
    "scale_indexes.sql"
];

const patterns = [
    { name: "CREATE TABLE", regex: /\bCREATE\s+(?:OR\s+REPLACE\s+)?TABLE\b/gi },
    { name: "ALTER TABLE", regex: /\bALTER\s+TABLE\b/gi },
    { name: "CREATE INDEX", regex: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/gi },
    { name: "CREATE TYPE", regex: /\bCREATE\s+TYPE\b/gi },
    { name: "CREATE FUNCTION", regex: /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/gi },
    { name: "CREATE TRIGGER", regex: /\bCREATE\s+TRIGGER\b/gi },
    { name: "INSERT", regex: /\bINSERT\s+INTO\b/gi },
    { name: "UPDATE", regex: /\bUPDATE\b/gi },
    { name: "DELETE", regex: /\bDELETE\s+FROM\b/gi }
];

console.log("\n=============================================================");
console.log("       ShaktiCop — MIGRATION SQL AUDIT");
console.log("=============================================================\n");

for (const migration of migrations) {
    const filePath = path.join(DB_DIR, migration);

    if (!fs.existsSync(filePath)) {
        console.log(`❌ FILE MISSING: ${migration}`);
        continue;
    }

    const sql = fs.readFileSync(filePath, "utf8");

    console.log(`\n### ${migration}`);

    let found = false;

    for (const pattern of patterns) {
        const matches = sql.match(pattern.regex);

        if (matches && matches.length > 0) {
            console.log(`   ${pattern.name}: ${matches.length}`);
            found = true;
        }
    }

    if (!found) {
        console.log("   No major SQL operation detected");
    }
}

console.log("\n=============================================================");
console.log("AUDIT COMPLETE — NO DATABASE CHANGES MADE");
console.log("=============================================================\n");