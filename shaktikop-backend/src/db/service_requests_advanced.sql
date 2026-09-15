-- ============================================================
-- सेवा अनुरोध — उन्नत (enterprise) सुविधाएं
--
-- पहले service_requests.sql चला लें, फिर यह फ़ाइल।
-- यह जोड़ता है: प्राथमिकता, उपस्थिति, सत्र का परिणाम, फ़ॉलो-अप,
-- पुनर्निर्धारण की गिनती, और हर बदलाव का ऑडिट इतिहास।
-- ============================================================

-- ---------- नए कॉलम ----------
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'सामान्य';
-- 'सामान्य' | 'उच्च' | 'अति-आवश्यक'

ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS attendance TEXT;
-- NULL (अभी तय नहीं) | 'उपस्थित' | 'अनुपस्थित'

ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS outcome TEXT;          -- सत्र का परिणाम
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS follow_up_needed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS session_duration_min INTEGER;
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cr_priority  ON counselling_requests (priority, status);
CREATE INDEX IF NOT EXISTS idx_cr_scheduled ON counselling_requests (scheduled_at);

-- ---------- हर बदलाव का ऑडिट इतिहास ----------
-- कौन, कब, क्या बदला — DSP स्तर की समीक्षा के लिए ज़रूरी
CREATE TABLE IF NOT EXISTS service_request_history (
  id           BIGSERIAL PRIMARY KEY,
  request_id   TEXT NOT NULL REFERENCES counselling_requests(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,   -- 'created' | 'scheduled' | 'rescheduled' | 'attendance' | 'closed' | 'priority' | 'cancelled'
  from_value   TEXT,
  to_value     TEXT,
  reason       TEXT,
  actor_role   TEXT,
  actor_name   TEXT,
  actor_id     UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srh_request ON service_request_history (request_id, created_at);

-- ---------- काउंसलर / प्रशिक्षक की सूची ----------
-- मुक्त टेक्स्ट में नाम लिखने से वर्तनी बदलती रहती है और रिपोर्ट बिगड़ती है।
-- अब Super Admin सूची रखता है और अधिकारी उसमें से चुनता है।
CREATE TABLE IF NOT EXISTS service_providers (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  father_name  TEXT,           -- पिता/पति का नाम
  designation  TEXT,
  service_type TEXT,            -- किस सेवा के लिए (NULL = सभी)
  district     TEXT,             -- जनपद
  police_station TEXT,          -- थाना
  mobile       TEXT,
  email        TEXT,
  venue        TEXT,            -- सामान्य स्थान
  other_details TEXT,           -- अन्य विवरण
  created_by_name TEXT,         -- किस अधिकारी ने यह ID बनाई (जवाबदेही)
  created_by_role TEXT,         -- 'SHO' | 'super_admin' आदि
  password_hash TEXT,           -- काउंसलर का अपना लॉगिन पासवर्ड (SHO/Super Admin शुरुआती पासवर्ड सेट करते हैं)
  push_token   TEXT,
  photo_url    TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sp_type ON service_providers (service_type, district, is_active);

-- पुराने अनुरोधों का इतिहास शुरू करें (जिनका पहले से कोई रिकॉर्ड नहीं)
INSERT INTO service_request_history (request_id, action, to_value, actor_role, actor_name, created_at)
SELECT id, 'created', type, 'citizen', name, created_at
FROM counselling_requests cr
WHERE NOT EXISTS (SELECT 1 FROM service_request_history h WHERE h.request_id = cr.id);
