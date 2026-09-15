-- ============================================================
-- लाइव लोकेशन — सटीक ट्रैकिंग अपग्रेड
--   1. accuracy (GPS कितना सटीक है, मीटर में) — अब सेव होता है
--   2. पूरा movement trail (breadcrumb path) — पहले सिर्फ़ आख़िरी बिंदु सेव होता था
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql $DATABASE_URL -f src/db/live_tracking_upgrade.sql
-- ============================================================

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS live_accuracy REAL; -- मीटर में — जितना कम, उतना सटीक

CREATE TABLE IF NOT EXISTS complaint_location_trail (
  id           BIGSERIAL PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  accuracy     REAL,                          -- मीटर में
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trail_complaint ON complaint_location_trail (complaint_id, recorded_at);
