-- ============================================================
-- 1) थाना/अस्पताल geo-tagging — अपनी verified list में lat/lng जोड़ना, ताकि
--    "नज़दीकी थाना" खोज बाहरी OSM/LocationIQ डेटा पर निर्भर न रहे (जो छोटे
--    क़स्बों के लिए अक्सर अधूरा/ग़लत होता है) — पहले अपनी list में देखेंगे,
--    सिर्फ़ वहां न मिले तो बाहरी स्रोत का सहारा लेंगे।
-- 2) अधिकारी की notification preferences — कौन सी सूचनाएं चाहिए, कौन सी नहीं।
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql $DATABASE_URL -f src/db/advanced_settings.sql
-- ============================================================

ALTER TABLE police_stations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE police_stations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE police_stations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE officers ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT
  '{"newComplaint": true, "sos": true, "overdue": true, "assigned": true}';
