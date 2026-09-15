-- ============================================================
-- officers.designation कॉलम — यह इस पूरी परियोजना-समीक्षा का सबसे पहला बग था
-- ("column designation of relation officers does not exist")।
--
-- असली वजह: schema.sql में designation कॉलम जोड़ा गया था (नए/खाली डेटाबेस के
-- लिए), पर पहले से चल रहे (deployed) डेटाबेस के लिए कभी कोई अलग ALTER TABLE
-- पैच फ़ाइल नहीं बनाई गई थी — जबकि इस प्रोजेक्ट में हर नए कॉलम के लिए वैसी
-- फ़ाइल बनाने का चलन है (देखें: officer_admin_photo.sql जैसी अन्य फ़ाइलें)।
-- यही missing पैच अब यह फ़ाइल है।
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/officer_designation_column.sql
-- ============================================================

ALTER TABLE officers ADD COLUMN IF NOT EXISTS designation TEXT;
