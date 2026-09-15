-- ============================================================
-- साइड मेनू permissions — DSP/ASP/SSP (monitor) खातों के लिए।
-- पहले से चल रहे (deployed) database पर लगाने के लिए — schema.sql में column
-- पहले से ही जोड़ दिया गया है, नए database पर यह अपने-आप आ जाएगा। पुराने/मौजूदा
-- database पर यह फ़ाइल एक बार मैन्युअल रूप से चला दें:
--   psql $DATABASE_URL -f src/db/menu_permissions.sql
-- ============================================================

ALTER TABLE admins ADD COLUMN IF NOT EXISTS menu_permissions JSONB NOT NULL DEFAULT '{}';
