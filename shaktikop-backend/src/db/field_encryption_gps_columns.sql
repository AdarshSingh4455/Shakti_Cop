-- ============================================================
-- फ़ील्ड-लेवल एन्क्रिप्शन (राउंड 2) — victim_name, victim_mobile, और Live GPS
--
-- यह पैच दो काम करता है:
--   1. latitude/longitude/live_lat/live_lng (complaints) व
--      latitude/longitude (complaint_location_trail) को DOUBLE PRECISION से
--      TEXT में बदलता है — ताकि इनमें AES-256-GCM encrypted string सेव हो सके।
--   2. complaints में victim_mobile_hash कॉलम जोड़ता है — victim_mobile अब
--      encrypted होने के कारण, डुप्लीकेट-शिकायत मिलान के लिए एक deterministic
--      blind-index (HMAC hash) चाहिए (देखें utils/fieldCrypto.js)।
--
-- ⚠️ क्रम ज़रूरी है:
--   1. पहले यह SQL पैच चलाएं (कॉलम टाइप बदलना, मौजूदा संख्यात्मक मान अपने-आप
--      टेक्स्ट में बदल जाएंगे — अभी तक unencrypted, सिर्फ़ टाइप बदला है)।
--   2. फिर FIELD_ENCRYPTION_KEY .env में सेट करें (अगर पहले से न हो)।
--   3. फिर एक बार चलाएं: npm run db:encrypt-fields
--      (यह victim_name/victim_mobile/latitude/longitude/live_lat/live_lng/
--       location_trail — सबको encrypt करके victim_mobile_hash भी भर देगा)
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/field_encryption_gps_columns.sql
-- ============================================================

-- 🔒 Idempotent — अगर यह पैच पहले से लग चुका है (कॉलम पहले से TEXT है), तो हर
-- ALTER चुपचाप छोड़ दिया जाता है (कोई त्रुटि नहीं, कोई बेवजह भारी table-rewrite भी
-- नहीं) — इसलिए इसे दोबारा/ग़लती से चलाना भी पूरी तरह सुरक्षित है।
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'latitude') = 'double precision' THEN
    ALTER TABLE complaints ALTER COLUMN latitude TYPE TEXT USING latitude::TEXT;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'longitude') = 'double precision' THEN
    ALTER TABLE complaints ALTER COLUMN longitude TYPE TEXT USING longitude::TEXT;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'live_lat') = 'double precision' THEN
    ALTER TABLE complaints ALTER COLUMN live_lat TYPE TEXT USING live_lat::TEXT;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'live_lng') = 'double precision' THEN
    ALTER TABLE complaints ALTER COLUMN live_lng TYPE TEXT USING live_lng::TEXT;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'complaint_location_trail' AND column_name = 'latitude') = 'double precision' THEN
    ALTER TABLE complaint_location_trail ALTER COLUMN latitude TYPE TEXT USING latitude::TEXT;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'complaint_location_trail' AND column_name = 'longitude') = 'double precision' THEN
    ALTER TABLE complaint_location_trail ALTER COLUMN longitude TYPE TEXT USING longitude::TEXT;
  END IF;
END $$;

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS victim_mobile_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_complaints_victim_mobile_hash ON complaints (victim_mobile_hash);
