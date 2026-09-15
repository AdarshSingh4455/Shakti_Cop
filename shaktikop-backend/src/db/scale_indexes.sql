-- ============================================================
-- राज्य-स्तर पर चलाने के लिए ज़रूरी indexes
--
-- क्यों:
--   अभी complaints पर district/status/category जैसे अलग-अलग कॉलम के index हैं,
--   पर सूची-query असल में इस पैटर्न से चलती है:
--
--     WHERE deleted_at IS NULL [AND district = …] ORDER BY created_at DESC LIMIT 200
--
--   created_at पर कोई index ही नहीं है। कुछ हज़ार शिकायतों तक यह दिखता नहीं, पर
--   पूरे प्रदेश में (सालाना लाखों शिकायतें) PostgreSQL को हर बार पूरे छँटे हुए
--   सेट को sort करना पड़ेगा — यानी हर बार डिस्क पर भारी sort। यही वह जगह है जहाँ
--   ऐप अचानक धीमा पड़ता है, और डेटा बढ़ने के साथ बदतर होता जाता है।
--
--   नीचे के index उसी असली पैटर्न से मेल खाते हैं, इसलिए PostgreSQL सीधे पहले
--   200 rows पढ़कर रुक जाता है — पूरा डेटा छूता ही नहीं।
--
-- ⚠️ CONCURRENTLY जान-बूझकर इस्तेमाल किया गया है: बिना इसके index बनाते समय
--    तालिका पर lock लग जाता है और तब तक कोई शिकायत दर्ज नहीं हो सकती। लाइव
--    सिस्टम पर वह बंदी स्वीकार्य नहीं।
--
-- ⚠️ CONCURRENTLY transaction के अंदर नहीं चल सकता — इसलिए इस फ़ाइल को psql से
--    सीधे चलाएं (जैसे बाक़ी migrations), किसी transaction में लपेटकर नहीं।
--
-- चलाएं:
--   psql "$DATABASE_URL" -f src/db/scale_indexes.sql
--
-- बार-बार चलाना सुरक्षित है (IF NOT EXISTS)।
-- ============================================================

-- 1. सबसे अहम — हर सूची-query का मुख्य पैटर्न (नई शिकायतें सबसे ऊपर)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_active_recent
  ON complaints (created_at DESC)
  WHERE deleted_at IS NULL;

-- 2. ज़िला-स्तर के admin/SP के लिए — ज़िले की शिकायतें, नई पहले
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_district_recent
  ON complaints (district, created_at DESC)
  WHERE deleted_at IS NULL;

-- 3. थाना-स्तर (SHO डैशबोर्ड व DSP के circle) के लिए
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_station_recent
  ON complaints (police_station, created_at DESC)
  WHERE deleted_at IS NULL;

-- 4. अधिकारी का अपना डैशबोर्ड — "मेरे मामले", नए पहले
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_officer_recent
  ON complaints (officer_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 5. नागरिक का डैशबोर्ड — "मेरी शिकायतें"
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_citizen_recent
  ON complaints (citizen_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 6. SOS स्क्रीन — सक्रिय SOS पूरे राज्य में गिने-चुने ही होते हैं, इसलिए यह
--    छोटा-सा partial index उन्हें तुरंत निकाल देता है (पूरी तालिका छुए बिना)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_sos_active
  ON complaints (created_at DESC)
  WHERE sos_triggered = true AND deleted_at IS NULL;

-- 7. SLA/overdue रिपोर्ट — अभी भी खुली शिकायतें, सबसे पुरानी पहले
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_open_oldest
  ON complaints (created_at ASC)
  WHERE deleted_at IS NULL AND status NOT IN ('निस्तारित', 'अस्वीकृत');

-- 8. लाइव-लोकेशन का इतिहास — सबसे तेज़ बढ़ने वाली तालिका। सफ़ाई वाली job
--    (locationTrailRetention) recorded_at से पुरानी entries हटाती है।
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trail_recorded_at
  ON complaint_location_trail (recorded_at);

-- 9. सूचनाएं — हर उपयोगकर्ता की अपनी, नई पहले
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_recipient_recent
  ON notifications (recipient_role, recipient_id, created_at DESC);

-- 10. गतिविधि-लॉग (audit) — समय के हिसाब से देखा जाता है, और सफ़ाई भी इसी से होती है
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_created
  ON activity_logs (created_at DESC);
