-- ============================================================
-- काउंसलर/प्रशिक्षक अब अपने खाते से लॉगिन कर सकते हैं — अपना डैशबोर्ड,
-- अपनी अपॉइंटमेंट्स, उपस्थिति मार्क करना, अपनी प्रोफ़ाइल एडिट करना।
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql $DATABASE_URL -f src/db/service_providers_login.sql
-- ============================================================

ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- ⚠️ पहले counsellor_name सिर्फ़ एक टेक्स्ट स्ट्रिंग था (नाम मैच करके पता चलता था
-- किसकी अपॉइंटमेंट है) — यह अविश्वसनीय है (दो काउंसलर का नाम मिलता-जुलता हो तो
-- ग़लत मिलान हो सकता है)। अब असली ID से जोड़ते हैं, नाम सिर्फ़ दिखाने के लिए रहता है।
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS counsellor_id BIGINT REFERENCES service_providers(id);

CREATE INDEX IF NOT EXISTS idx_counselling_requests_counsellor ON counselling_requests (counsellor_id);
