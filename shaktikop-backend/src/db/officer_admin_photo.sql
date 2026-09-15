-- ============================================================
-- अधिकारी/एडमिन प्रोफ़ाइल फ़ोटो — पहले सिर्फ़ नागरिक (citizens) के पास यह सुविधा थी।
-- पहले से चल रहे (deployed) database पर लगाने के लिए — schema.sql में column पहले
-- से ही जोड़ दिया गया है, नए database पर यह अपने-आप आ जाएगा। पुराने/मौजूदा
-- database पर यह फ़ाइल एक बार मैन्युअल रूप से चला दें:
--   psql $DATABASE_URL -f src/db/officer_admin_photo.sql
-- ============================================================

ALTER TABLE officers ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS photo_url TEXT;
