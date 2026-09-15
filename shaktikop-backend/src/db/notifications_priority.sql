-- ============================================================
-- notifications.priority कॉलम — Critical / High / Medium
--
-- पहले सभी notifications बराबर दिखती थीं (कोई priority नहीं थी) — SOS जैसी
-- जानलेवा-आपात सूचना और सामान्य "नया संदेश" एक जैसी दिखते थे, जिससे अधिकारी/
-- एडमिन के लिए यह पहचानना मुश्किल था कि पहले किसे देखना ज़रूरी है।
--
-- अब तीन स्तर:
--   critical → SOS ट्रिगर, Backup माँगना (जानलेवा/आपात)
--   high     → Escalation चेतावनी (समय सीमा पार होने वाली है/हो गई)
--   medium   → बाकी सब (नया मामला, स्थिति अपडेट, संदेश, broadcast आदि) — डिफ़ॉल्ट
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/notifications_priority.sql
-- ============================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
