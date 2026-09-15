-- ============================================================
-- field_visits का GPS भी encrypt हो (बाक़ी सब की तरह)
--
-- समस्या:
-- ऐप में हर दूसरी जगह GPS encrypted TEXT के रूप में रखा जाता है —
--   complaints.latitude / longitude
--   complaints.live_lat / live_lng
--   complaint_location_trail.latitude / longitude
-- पर field_visits में वह सादे DOUBLE PRECISION में पड़ा था।
--
-- यह चूक मामूली नहीं: फील्ड विज़िट का मतलब ही है कि अधिकारी पीड़िता के पास
-- पहुँचा — यानी ये निर्देशांक असल में पीड़िता के घर/ठिकाने के हैं। घरेलू-हिंसा
-- के मामलों में यही वह जानकारी है जिसे सबसे ज़्यादा छिपाकर रखना होता है।
-- database तक किसी की पहुँच हो जाए (डंप, backup, या read-only access), तो बाक़ी
-- सारा GPS encrypted मिलता, पर यह सीधे पढ़ा जा सकता था।
--
-- ⚠️ यह फ़ाइल कॉलम का प्रकार बदलती है, इसलिए पहले पुराने मानों को TEXT में लाकर
--    सुरक्षित रखा जाता है — फिर npm run db:encrypt-fields उन्हें encrypt करता है।
--
-- चलाने के लिए (क्रम ज़रूरी है):
--   psql "$DATABASE_URL" -f src/db/field_visit_gps_encryption.sql
--   npm run db:encrypt-fields
-- ============================================================

-- 1️⃣ प्रकार बदलें: DOUBLE PRECISION → TEXT (मौजूदा संख्याएं ज्यों की त्यों text बन जाती हैं)
ALTER TABLE field_visits
  ALTER COLUMN latitude  TYPE TEXT USING latitude::text,
  ALTER COLUMN longitude TYPE TEXT USING longitude::text;

-- 2️⃣ NOT NULL हटाएं — encryption के बाद मान TEXT रहते हैं, पर किसी पुरानी पंक्ति में
--    अगर कुछ गड़बड़ हो तो migration बीच में न अटके
ALTER TABLE field_visits ALTER COLUMN latitude  DROP NOT NULL;
ALTER TABLE field_visits ALTER COLUMN longitude DROP NOT NULL;

-- 3️⃣ अब "npm run db:encrypt-fields" चलाएं — वह इन कॉलमों को encrypt कर देगा।
--    (उस script में field_visits पहले से जोड़ दिया गया है।)
