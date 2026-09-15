-- ============================================================
-- काउंसलर/प्रशिक्षक प्रोफ़ाइल में नए फ़ील्ड — पिता का नाम, थाना, ईमेल, अन्य विवरण।
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql $DATABASE_URL -f src/db/service_providers_extra_fields.sql
-- ============================================================

ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS police_station TEXT;
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS other_details TEXT;
-- कौन (कौन से अधिकारी) ने यह ID बनाई — जवाबदेही के लिए
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS created_by_role TEXT;
