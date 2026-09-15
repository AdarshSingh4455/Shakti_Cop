-- ============================================================
-- ज़िला/थाना — अंग्रेज़ी नाम अब डेटा का हिस्सा (कोड का hardcoded dictionary नहीं)
--
-- पहले सिर्फ़ mobile app के कोड में एक hardcoded translation-dictionary थी, और
-- वह भी सिर्फ़ "प्रमुख ज़िलों के थानों" के लिए — बाक़ी लगभग सभी (UP में 1500+)
-- थाने अंग्रेज़ी मोड में भी हिंदी में ही दिखते रहते, और कोई भी नया थाना जुड़ते
-- ही फिर से अधूरा हो जाता। अब यह ज़िम्मेदारी डेटा की है — जब भी कोई थाना जोड़ा/
-- बदला जाए, दोनों नाम साथ सेव होते हैं।
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/police_station_english_names.sql
-- ============================================================

ALTER TABLE police_stations ADD COLUMN IF NOT EXISTS district_en TEXT;
ALTER TABLE police_stations ADD COLUMN IF NOT EXISTS station_en TEXT;
