-- ============================================================
-- नागरिक के लिए वैकल्पिक ईमेल
--
-- क्यों:
-- अब तक नागरिक सिर्फ़ मोबाइल से खाता बना सकता था, और OTP भी सिर्फ़ SMS से जाता।
-- जहाँ SMS न पहुँचे (नेटवर्क, gateway, या नंबर किसी और के नाम पर हो — घरेलू-हिंसा
-- के मामलों में यह आम है), वहाँ खाता बनाना ही असंभव हो जाता था।
--
-- अब ईमेल भरना वैकल्पिक है। भरा हो तो OTP दोनों जगह — मोबाइल और ईमेल — जाता है।
--
-- चलाने के लिए:
--   psql "$DATABASE_URL" -f src/db/citizen_email.sql
-- ============================================================

ALTER TABLE citizens ADD COLUMN IF NOT EXISTS email TEXT;

-- एक ही ईमेल दो सक्रिय खातों पर न हो (मोबाइल की तरह)। खाली ईमेल कई हो सकते हैं,
-- इसलिए partial index — यही तरीक़ा officers/admins में भी अपनाया गया है।
CREATE UNIQUE INDEX IF NOT EXISTS citizens_email_active_uidx
  ON citizens (LOWER(TRIM(email))) WHERE is_active = true AND email IS NOT NULL AND TRIM(email) <> '';
