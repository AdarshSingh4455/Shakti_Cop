-- ============================================================
-- 🆕 आरोपी-सम्बंधित जानकारी — दोहराए गए आरोपियों की पहचान (Repeat-Offender Linking)
--
-- अब तक "आरोपी" (accused) के बारे में कोई structured जानकारी सेव ही नहीं होती
-- थी — सिर्फ़ एक checklist-लेबल था। नतीजा: अगर एक ही व्यक्ति के ख़िलाफ़ अलग-अलग
-- पीड़िताओं ने अलग-अलग समय पर शिकायतें दर्ज कीं, तो किसी भी अधिकारी को यह पैटर्न
-- कभी नज़र ही नहीं आता — जबकि यही पैटर्न-पहचान इस तरह के मामलों में सबसे ज़रूरी
-- होती है।
--
-- victim_mobile जैसा ही डिज़ाइन — encrypted + deterministic blind-index hash,
-- ताकि मिलान हो सके पर असली मोबाइल नंबर कभी hash से वापस न निकाला जा सके।
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/accused_linking.sql
-- ============================================================

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS accused_name TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS accused_mobile TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS accused_mobile_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_complaints_accused_mobile_hash ON complaints (accused_mobile_hash);
