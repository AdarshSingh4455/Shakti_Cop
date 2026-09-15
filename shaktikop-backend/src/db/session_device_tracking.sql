-- ============================================================
-- 🆕 "किन-किन डिवाइस में लॉगिन है" — सक्रिय सत्रों (sessions) की जानकारी
--
-- पहले तक refresh_tokens तालिका सिर्फ़ token-hash और expiry रखती थी — कोई
-- यूज़र यह नहीं देख सकता था कि उसका खाता किन-किन डिवाइस पर लॉगिन है। अब हर
-- session का डिवाइस-नाम व आख़िरी सक्रियता-समय भी सेव होता है।
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/session_device_tracking.sql
-- ============================================================

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_name TEXT;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NOT NULL DEFAULT now();
