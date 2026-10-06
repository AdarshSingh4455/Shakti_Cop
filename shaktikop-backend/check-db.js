require("dotenv").config();
const { Client } = require("pg");

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function main() {
    try {
        await client.connect();

        console.log("\n=== MIGRATION TABLE STRUCTURE ===\n");

        const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
      ORDER BY ordinal_position
    `);

        console.table(columns.rows);

        console.log("\n=== APPLIED MIGRATIONS ===\n");

        const migrations = await client.query(`
      SELECT *
      FROM schema_migrations
      ORDER BY 1
    `);

        console.table(migrations.rows);

        console.log("\n=== TOTAL APPLIED:", migrations.rows.length, "===\n");

    } catch (error) {
        console.error("\nDATABASE ERROR:", error.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main();