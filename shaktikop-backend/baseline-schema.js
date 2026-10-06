require("dotenv").config();
const { Client } = require("pg");

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await c.connect();

  await c.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_ms INTEGER
    )
  `);

  await c.query(
    `INSERT INTO schema_migrations
     (name, applied_at, duration_ms)
     VALUES ($1, now(), 0)
     ON CONFLICT (name) DO NOTHING`,
    ["schema.sql"]
  );

  console.log("✓ schema.sql marked as baseline");

  await c.end();
})().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});