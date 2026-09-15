-- ============================================================
-- ट्रांसफ़र सपोर्ट — जब किसी अधिकारी/एडमिन (SI/SHO/DSP/ASP/SSP) का ट्रांसफ़र
-- किसी दूसरे ज़िले/थाने में हो, तो पुरानी ID निष्क्रिय (deactivate) की जाती है और
-- नए ज़िले/थाने के लिए बिल्कुल नई ID बनाई जाती है। इससे पहले PNO/मोबाइल/ईमेल पर
-- पूरी तरह से UNIQUE constraint होने के कारण — पुरानी ID निष्क्रिय करने के बाद भी
-- वही PNO/मोबाइल/ईमेल दोबारा इस्तेमाल नहीं हो पाता था।
--
-- अब यह constraint सिर्फ़ *सक्रिय* (is_active = true) रिकॉर्ड्स पर लागू होगा —
-- यानी एक समय में एक ही PNO/मोबाइल/ईमेल से सिर्फ़ एक सक्रिय ID बन सकेगी, लेकिन
-- पुरानी ID निष्क्रिय करने के बाद उसी PNO/मोबाइल/ईमेल से नई सक्रिय ID बनाई जा सकेगी।
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql $DATABASE_URL -f src/db/officer_transfer_support.sql
-- ============================================================

-- ---------- अधिकारी (officers) ----------
ALTER TABLE officers DROP CONSTRAINT IF EXISTS officers_badge_id_key;
ALTER TABLE officers DROP CONSTRAINT IF EXISTS officers_mobile_key;
ALTER TABLE officers DROP CONSTRAINT IF EXISTS officers_email_key;

DROP INDEX IF EXISTS officers_badge_id_active_uidx;
DROP INDEX IF EXISTS officers_mobile_active_uidx;
DROP INDEX IF EXISTS officers_email_active_uidx;

CREATE UNIQUE INDEX officers_badge_id_active_uidx ON officers (badge_id) WHERE is_active = true;
CREATE UNIQUE INDEX officers_mobile_active_uidx ON officers (mobile) WHERE is_active = true AND mobile IS NOT NULL;
CREATE UNIQUE INDEX officers_email_active_uidx ON officers (email) WHERE is_active = true AND email IS NOT NULL;

ALTER TABLE officers ADD COLUMN IF NOT EXISTS transferred_from_id UUID REFERENCES officers(id);

-- ---------- एडमिन (admins: SP/SSP/DSP/ASP भी इसी टेबल में, admin_role='monitor') ----------
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_username_key;
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_mobile_key;
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_email_key;

ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE admins ADD COLUMN IF NOT EXISTS transferred_from_id UUID REFERENCES admins(id);

DROP INDEX IF EXISTS admins_username_active_uidx;
DROP INDEX IF EXISTS admins_mobile_active_uidx;
DROP INDEX IF EXISTS admins_email_active_uidx;

CREATE UNIQUE INDEX admins_username_active_uidx ON admins (username) WHERE is_active = true AND username IS NOT NULL;
CREATE UNIQUE INDEX admins_mobile_active_uidx ON admins (mobile) WHERE is_active = true AND mobile IS NOT NULL;
CREATE UNIQUE INDEX admins_email_active_uidx ON admins (email) WHERE is_active = true AND email IS NOT NULL;
