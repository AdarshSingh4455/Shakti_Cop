-- ============================================================
-- ShaktiCop डेटाबेस स्कीमा (PostgreSQL) — v3
-- v3: 5 विशिष्ट शिकायत श्रेणियां (महिला हेल्प डेस्क, एंटी रोमियो, घरेलू हिंसा,
-- सुरक्षित यात्रा, वॉइस शिकायत), district/थाना, घटना स्थल, वॉइस रिकॉर्डिंग,
-- और श्रेणी-विशेष फ़ील्ड्स (जैसे वाहन नंबर) के लिए extra_details.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE complaint_status AS ENUM (
  'दर्ज',
  'अधिकारी नियुक्त',
  'कार्यवाही जारी',
  'निस्तारित',
  'अस्वीकृत'
);

-- नागरिक ऐप में दिखने वाले 5 कार्ड इसी क्रम में हैं।
CREATE TYPE complaint_category AS ENUM (
  'महिला हेल्प डेस्क',
  'एंटी रोमियो स्क्वॉड',
  'घरेलू हिंसा',
  'सुरक्षित यात्रा मोड',
  'वॉइस शिकायत'
);

-- ---------- नागरिक ----------
CREATE TABLE citizens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  father_name   TEXT,
  address       TEXT,
  mobile        TEXT NOT NULL UNIQUE,
  -- 🆕 वैकल्पिक ईमेल — भरा हो तो OTP मोबाइल के साथ-साथ यहाँ भी जाता है, ताकि
  -- SMS न पहुँचने पर भी नागरिक लॉगिन कर सके
  email         TEXT,
  password_hash TEXT NOT NULL,
  emergency_contacts JSONB NOT NULL DEFAULT '[]', -- Phase G: [{ name, phone }, ...] अधिकतम 3
  photo_url     TEXT, -- वैकल्पिक प्रोफ़ाइल फ़ोटो
  push_token    TEXT, -- शिकायत अपडेट की सूचना पाने के लिए
  district      TEXT, -- नागरिक का अपना ज़िला
  police_station TEXT, -- नागरिक का अपना थाना
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- अधिकारी ----------
CREATE TABLE officers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  badge_id      TEXT NOT NULL, -- UNIQUE नहीं — ट्रांसफ़र होने पर वही PNO पुरानी (निष्क्रिय) ID में रहता है; नीचे partial unique index सिर्फ़ सक्रिय ID पर लागू होता है
  mobile        TEXT,               -- Phase C/D: OTP लॉगिन के लिए
  email         TEXT,               -- Phase D: unified स्टाफ़ लॉगिन के लिए
  password_hash TEXT NOT NULL,
  station       TEXT,
  district      TEXT,
  duty_status   TEXT NOT NULL DEFAULT 'उपलब्ध', -- उपलब्ध | अवकाश पर | अन्य ड्यूटी पर | ज़िले से बाहर (Phase C)
  rank          TEXT NOT NULL DEFAULT 'SI', -- 'SI' (जांच अधिकारी) | 'SHO' (थाना प्रभारी — नियुक्ति कर सकता है)
  designation   TEXT, -- जैसे "उप निरीक्षक", "निरीक्षक" — रैंक से अलग, प्रदर्शन के लिए स्वतंत्र पदनाम
  created_by_id UUID, -- किसने यह ID बनाई (SHO/DSP/Super Admin) — जवाबदेही के लिए
  transferred_from_id UUID REFERENCES officers(id), -- ट्रांसफ़र वाली नई ID हो तो पुरानी (अब निष्क्रिय) ID का संदर्भ
  permissions   JSONB NOT NULL DEFAULT '{"canReject": true, "canTransfer": false}',
  notification_preferences JSONB NOT NULL DEFAULT '{"newComplaint": true, "sos": true, "overdue": true, "assigned": true}',
  push_token    TEXT,                      -- Expo push notification token (Phase C में अलर्ट हेतु)
  photo_url     TEXT, -- वैकल्पिक प्रोफ़ाइल फ़ोटो (base64 data URI — किसी अलग file-server की ज़रूरत नहीं)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- सिर्फ़ *सक्रिय* अधिकारियों में PNO/मोबाइल/ईमेल यूनिक होने चाहिए — ताकि ट्रांसफ़र पर पुरानी
-- (निष्क्रिय) ID के रहते हुए भी नए थाने के लिए नई ID बन सके, पर एक ही समय में एक ही PNO
-- की दो *सक्रिय* IDs कभी न बनें (जब तक पुरानी को निष्क्रिय न किया जाए)।
CREATE UNIQUE INDEX officers_badge_id_active_uidx ON officers (badge_id) WHERE is_active = true;
CREATE UNIQUE INDEX officers_mobile_active_uidx ON officers (mobile) WHERE is_active = true AND mobile IS NOT NULL;
CREATE UNIQUE INDEX officers_email_active_uidx ON officers (email) WHERE is_active = true AND email IS NOT NULL;

-- ---------- एडमिन ----------
CREATE TABLE admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  username      TEXT, -- ⚠️ वैकल्पिक — पुराने username/password login के लिए बचा है, असल OTP लॉगिन email/mobile से होता है
  mobile        TEXT,               -- Phase D: unified स्टाफ़ OTP लॉगिन के लिए
  email         TEXT,
  password_hash TEXT NOT NULL,
  push_token    TEXT,                      -- Phase E: SOS अलर्ट प्राप्त करने के लिए
  photo_url     TEXT, -- वैकल्पिक प्रोफ़ाइल फ़ोटो (base64 data URI)
  admin_role    TEXT NOT NULL DEFAULT 'super_admin', -- 'super_admin' | 'district_admin' | 'monitor'
  rank          TEXT, -- 'DSP' | 'ASP' | 'SSP' | 'DIG' | 'IG' — सिर्फ़ admin_role='monitor' के लिए (सिर्फ़ पदनाम/display के लिए)
  circle_stations JSONB NOT NULL DEFAULT '[]', -- DSP के लिए — Super Admin/SSP तय करते हैं कि कौन-कौन से थाने इस सर्किल में आते हैं
  -- 🆕 IG/DIG (Range/परिक्षेत्र स्तर) के लिए — एक साथ कई ज़िलों की निगरानी। SSP/DSP/ASP
  -- सिर्फ़ एक ज़िले (या ज़िले के अंदर के थानों) तक सीमित रहते हैं, IG/DIG इससे ऊपर, कई
  -- ज़िलों को एक साथ देख सकते हैं (जैसे "लखनऊ परिक्षेत्र" में लखनऊ+बाराबंकी+सीतापुर आदि)।
  -- सिर्फ़ Super Admin ही IG/DIG खाता बना सकता है (देखें middleware/auth.js, adminController.js)।
  range_districts JSONB NOT NULL DEFAULT '[]',
  -- साइड मेनू में कौन-कौन से आइटम दिखें — सिर्फ़ admin_role='monitor' (DSP/ASP/SSP) खातों पर लागू होता है।
  -- super_admin व district_admin को हमेशा पूरा मेनू दिखता है। जो key यहाँ true नहीं है, वह आइटम
  -- साइड मेनू में तब तक नहीं दिखेगा जब तक Super Admin permission न दे दे (permission देते ही दिखने लगेगा)।
  menu_permissions JSONB NOT NULL DEFAULT '{}',
  created_by_id UUID, -- किसने यह खाता बनाया (जवाबदेही के लिए)
  transferred_from_id UUID REFERENCES admins(id), -- ट्रांसफ़र वाला नया खाता हो तो पुराने (अब निष्क्रिय) खाते का संदर्भ
  district      TEXT,                      -- district_admin के लिए — सिर्फ़ इसी ज़िले का डेटा दिखेगा
  is_active     BOOLEAN NOT NULL DEFAULT true, -- ट्रांसफ़र पर पुराना खाता निष्क्रिय किया जाता है, नए ज़िले/सर्किल के लिए नया खाता बनता है
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- सिर्फ़ *सक्रिय* खातों में username/मोबाइल/ईमेल यूनिक होने चाहिए — officers जैसा ही तर्क,
-- ट्रांसफ़र पर पुराना खाता निष्क्रिय करके उसी मोबाइल/ईमेल से नया खाता नए ज़िले के लिए बन सके।
CREATE UNIQUE INDEX admins_username_active_uidx ON admins (username) WHERE is_active = true AND username IS NOT NULL;
CREATE UNIQUE INDEX admins_mobile_active_uidx ON admins (mobile) WHERE is_active = true AND mobile IS NOT NULL;
CREATE UNIQUE INDEX admins_email_active_uidx ON admins (email) WHERE is_active = true AND email IS NOT NULL;

-- ---------- OTP अनुरोध ----------
-- नोट: 'mobile' कॉलम को staff email OTP के लिए भी (पहचानकर्ता के रूप में) इस्तेमाल किया जाता है।
CREATE TABLE otp_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile        TEXT NOT NULL,
  otp_code      TEXT NOT NULL,
  purpose       TEXT NOT NULL DEFAULT 'signup', -- 'signup' | 'reset_password' | 'officer_login' | 'staff_login'
  expires_at    TIMESTAMPTZ NOT NULL,
  verified      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_mobile ON otp_requests (mobile, purpose, created_at DESC);

-- 🆕 Refresh Tokens — पहले सिर्फ़ एक 7-दिन वाला access token (JWT) होता था, कोई
-- refresh token नहीं था। अब access token छोटी अवधि का है (देखें JWT_EXPIRES_IN),
-- और यह टेबल लंबी अवधि के, अलग से revoke किए जा सकने वाले refresh tokens रखती है।
-- असली token कभी DB में plaintext सेव नहीं होता — सिर्फ़ उसका SHA-256 hash
-- (पासवर्ड की तरह — अगर DB लीक हो भी जाए, तो कोई उससे असली token नहीं बना सकता)।
CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL,     -- citizens/officers/admins/service_providers में से किसी एक की id
  role        TEXT NOT NULL,     -- 'citizen' | 'officer' | 'admin' | 'counsellor'
  -- 🆕 "किन-किन डिवाइस में लॉगिन है" दिखाने के लिए — मोबाइल ऐप लॉगिन के समय अपना
  -- डिवाइस-नाम भेजता है (जैसे "Redmi Note 12, Android 14")। rotation पर भी यह नाम
  -- आगे बढ़ता रहता है (देखें utils/refreshToken.js) — असली "session" वही रहता है।
  device_name TEXT,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,       -- logout पर, या rotate होने पर भरता है
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id, role);

-- ---------- शिकायतें ----------
CREATE TABLE complaints (
  id                  TEXT PRIMARY KEY,
  category            complaint_category NOT NULL,
  description         TEXT,                 -- सुरक्षित यात्रा में ज़रूरी नहीं
  district            TEXT,
  police_station      TEXT,
  location            TEXT,                  -- पूरा पता (वैकल्पिक — Phase D से, लाइव GPS मुख्य स्रोत है)
  incident_location   TEXT,                  -- घटना स्थल (जहाँ घटना हुई, पते से अलग हो सकता है)
  -- 🔒 फ़ील्ड-लेवल एन्क्रिप्शन: latitude/longitude/live_lat/live_lng अब TEXT हैं (पहले
  -- DOUBLE PRECISION थे) — असली मान AES-256-GCM से encrypted स्ट्रिंग के रूप में सेव
  -- होता है, ऐप में पढ़ते समय decrypt होकर वापस संख्या बनता है (देखें utils/fieldCrypto.js)।
  latitude            TEXT,                  -- शिकायत दर्ज करते समय की एक बार वाली लोकेशन (snapshot) — encrypted
  longitude           TEXT,                  -- encrypted
  live_share_active   BOOLEAN NOT NULL DEFAULT false, -- नागरिक ने लगातार लाइव लोकेशन शेयर करना चालू किया है या नहीं (सहमति ज़रूरी)
  live_lat            TEXT,                  -- सबसे नई लाइव लोकेशन (नागरिक की सहमति से बार-बार अपडेट होती है) — encrypted
  live_lng            TEXT,                  -- encrypted
  live_accuracy       REAL,                  -- GPS सटीकता, मीटर में — जितना कम उतना सटीक
  live_updated_at     TIMESTAMPTZ,
  escalated_at        TIMESTAMPTZ, -- रात्रि/ऑफ़-आवर escalation पिछली बार कब भेजा गया
  checkin_escalated_at TIMESTAMPTZ, -- सुरक्षित यात्रा मोड — सुरक्षा-जांच का बैकअप escalation पिछली बार कब भेजा गया
  photo_url           TEXT,
  voice_note_url      TEXT,                  -- रिकॉर्ड की गई आवाज़ (महिला हेल्प डेस्क / वॉइस शिकायत)
  extra_details       JSONB,                 -- श्रेणी-विशेष फ़ील्ड्स, जैसे सुरक्षित यात्रा का वाहन विवरण:
                                              -- { vehicleNumber, fromLocation, toLocation, avgDistanceKm }
  status              complaint_status NOT NULL DEFAULT 'दर्ज',
  officer_viewed_at   TIMESTAMPTZ, -- अधिकारी ने पहली बार कब खोली (जवाबदेही के लिए)
  duplicate_of        TEXT REFERENCES complaints(id), -- अगर यह किसी दूसरी शिकायत की डुप्लीकेट के रूप में चिह्नित हो
  priority            TEXT NOT NULL DEFAULT 'सामान्य', -- 'सामान्य' | 'उच्च' | 'अति-आवश्यक'
  admin_verified      BOOLEAN NOT NULL DEFAULT false, -- निस्तारण की एडमिन द्वारा पुष्टि (पेशेवर sign-off)
  admin_verified_at   TIMESTAMPTZ,
  admin_verified_by   TEXT,
  checklist           JSONB NOT NULL DEFAULT '[]', -- जांच checklist: [{ key, label, done, doneAt }]

  -- 🆕 Soft Delete — पहले "हटाना" हमेशा स्थायी (permanent, DELETE FROM) होता था, कोई
  -- वापसी का रास्ता नहीं था। एक शिकायत तो एक कानूनी/साक्ष्य दस्तावेज़ है — गलती से या
  -- दुर्भावना से हटने पर उसे वापस पाने का कोई तरीक़ा ही नहीं था। अब "हटाना" सिर्फ़
  -- deleted_at भरता है (असली डेटा बना रहता है) — सामान्य सूचियों/खोज से गायब हो जाती
  -- है, पर Super Admin चाहें तो 30 दिन के अंदर वापस ला सकते हैं (देखें restoreComplaint)।
  deleted_at          TIMESTAMPTZ,
  deleted_by_id       TEXT,
  deleted_by_name     TEXT,

  citizen_id          UUID NOT NULL REFERENCES citizens(id) ON DELETE RESTRICT,
  officer_id          UUID REFERENCES officers(id) ON DELETE SET NULL,

  victim_name         TEXT NOT NULL,
  victim_father_name  TEXT,
  victim_address      TEXT,
  victim_mobile       TEXT,
  -- 🔒 victim_mobile अब encrypted है (हर बार अलग ciphertext), इसलिए बराबरी-मिलान
  -- (जैसे डुप्लीकेट शिकायत ढूंढना) सीधे उस कॉलम पर संभव नहीं। यह deterministic
  -- HMAC hash (blindIndex, देखें utils/fieldCrypto.js) उसी काम के लिए है — असली
  -- नंबर इससे वापस नहीं निकाला जा सकता, पर बराबर नंबरों का hash हमेशा बराबर रहता है।
  victim_mobile_hash  TEXT,
  is_self             BOOLEAN NOT NULL DEFAULT true,
  -- 🆕 आरोपी-सम्बंधित जानकारी (वैकल्पिक — नागरिक को देना ज़रूरी नहीं) — दोहराए
  -- गए/एक ही व्यक्ति के ख़िलाफ़ अलग-अलग पीड़िताओं की शिकायतों का पैटर्न पहचानने के
  -- लिए। victim_mobile जैसा ही encrypted+blind-index पैटर्न — एक ही आरोपी की अलग
  -- शिकायतों में accused_mobile का ciphertext अलग-अलग होगा, इसलिए accused_mobile_hash
  -- (deterministic) से मिलान होता है, असली मोबाइल कभी hash से वापस नहीं निकाला जा सकता।
  accused_name        TEXT,
  accused_mobile      TEXT,
  accused_mobile_hash TEXT,

  -- Phase E: सुरक्षित यात्रा मोड — SOS व सुरक्षित पहुँच ट्रैकिंग
  sos_triggered              BOOLEAN NOT NULL DEFAULT false,
  sos_triggered_at           TIMESTAMPTZ,
  safe_arrival_confirmed     BOOLEAN NOT NULL DEFAULT false,
  safe_arrival_confirmed_at  TIMESTAMPTZ,

  -- Phase E: शिकायतकर्ता फ़ीडबैक (निस्तारण के बाद)
  feedback_rating       SMALLINT CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_note          TEXT,
  feedback_submitted_at TIMESTAMPTZ,
  -- 🆕 निस्तारण का असली समय। जान-बूझकर updated_at से अलग रखा गया है: updated_at
  -- हर बदलाव पर आगे बढ़ता है (trigger), और नागरिक की रेटिंग हमेशा मामला बंद होने
  -- के *बाद* आती है — इसलिए updated_at से समय निकालने पर अधिकारी का "निस्तारण-समय"
  -- झूठा बढ़ जाता था (देखें db/complaint_resolved_at.sql)।
  resolved_at   TIMESTAMPTZ,

  -- Phase G: गुमनाम शिकायत — true होने पर अधिकारी/एडमिन को पीड़ित का नाम/मोबाइल/पता नहीं दिखता
  is_anonymous BOOLEAN NOT NULL DEFAULT false,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_complaints_citizen  ON complaints (citizen_id);
CREATE INDEX idx_complaints_officer ON complaints (officer_id);
CREATE INDEX idx_complaints_status  ON complaints (status);
CREATE INDEX idx_complaints_category ON complaints (category);
CREATE INDEX idx_complaints_district ON complaints (district);
CREATE INDEX idx_complaints_victim_mobile_hash ON complaints (victim_mobile_hash);
CREATE INDEX idx_complaints_accused_mobile_hash ON complaints (accused_mobile_hash);

-- ---------- Home स्क्रीन बैनर (admin बदल सकता है) ----------
CREATE TABLE home_banners (
  id             BIGSERIAL PRIMARY KEY,
  title          TEXT,
  subtitle       TEXT,
  color_start    TEXT NOT NULL DEFAULT '#7A1836',
  color_end      TEXT NOT NULL DEFAULT '#9B2647',
  icon           TEXT NOT NULL DEFAULT 'shield-checkmark',
  image_url      TEXT, -- वैकल्पिक — दिया हो तो gradient की जगह इस्तेमाल होगी
  display_order  INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- सूचनाएं (in-app bell आइकन के लिए) ----------
CREATE TABLE notifications (
  id             BIGSERIAL PRIMARY KEY,
  recipient_role TEXT NOT NULL,   -- 'citizen' | 'officer' | 'admin'
  recipient_id   UUID NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT,
  data           JSONB,           -- जैसे { complaintId: '...' } — टैप करने पर सीधे वहाँ जाने के लिए
  priority       TEXT NOT NULL DEFAULT 'medium',  -- 'critical' | 'high' | 'medium'
  is_read        BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient ON notifications (recipient_role, recipient_id, created_at DESC);

-- ---------- शिकायत Draft (multi-device sync — एक डिवाइस पर लिखा, दूसरे पर भी दिखे) ----------
CREATE TABLE complaint_drafts (
  id           BIGSERIAL PRIMARY KEY,
  citizen_id   UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  draft_data   JSONB NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (citizen_id, category)
);

-- ---------- ज़िला/थाना मास्टर सूची (Super Admin अपलोड/प्रबंधित करता है) ----------
CREATE TABLE police_stations (
  id         BIGSERIAL PRIMARY KEY,
  district   TEXT NOT NULL,
  station    TEXT NOT NULL,
  district_en TEXT, -- ज़िले का अंग्रेज़ी नाम — डेटा का हिस्सा है, कोड का नहीं (देखें नीचे टिप्पणी)
  station_en TEXT,  -- 🆕 थाने का अंग्रेज़ी नाम। पहले सिर्फ़ code में एक hardcoded dictionary थी
                     -- जिसमें "सिर्फ़ प्रमुख ज़िलों के थाने" थे — यह कभी भी पूरे राज्य के
                     -- 1500+ थानों को कवर नहीं कर सकती थी, और नया थाना जुड़ते ही फिर अधूरी
                     -- हो जाती। अब अंग्रेज़ी नाम इसी तालिका का हिस्सा है — जब भी कोई थाना
                     -- जोड़ा/बदला जाए, दोनों नाम साथ ही सेव होते हैं, स्वतः पूरा कवरेज मिलता है।
  circle     TEXT, -- वैकल्पिक — DSP के सर्किल से जोड़ने के लिए भविष्य में उपयोगी
  latitude   DOUBLE PRECISION,  -- geo-tagging — सेट होने पर "नज़दीकी थाना" खोज में सबसे पहले भरोसा किया जाता है
  longitude  DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (district, station)
);
CREATE INDEX idx_police_stations_district ON police_stations (district);

-- ---------- भाषाएं और अनुवाद — Super Admin नई भाषा (जैसे भोजपुरी, अवधी) जोड़ सकते हैं ----------
CREATE TABLE app_locales (
  code          TEXT PRIMARY KEY, -- जैसे 'hi', 'en', 'bho'
  label         TEXT NOT NULL,    -- जैसे 'हिंदी', 'English', 'भोजपुरी'
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE translations (
  id              BIGSERIAL PRIMARY KEY,
  locale_code     TEXT NOT NULL REFERENCES app_locales(code) ON DELETE CASCADE,
  source_text     TEXT NOT NULL, -- हिंदी मूल पाठ (code में यही key इस्तेमाल होता है)
  translated_text TEXT NOT NULL,
  UNIQUE (locale_code, source_text)
);
CREATE INDEX idx_translations_locale ON translations (locale_code);

-- ---------- App Settings — साझा key-value store (Super Admin प्रबंधित करता है) ----------
-- Feature flags, maintenance mode, न्यूनतम app version, डिफ़ॉल्ट SLA घंटे, theme रंग — सब यहीं
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- ---------- FAQ / मदद Content — Super Admin प्रबंधित करता है ----------
CREATE TABLE faq_items (
  id            BIGSERIAL PRIMARY KEY,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  category      TEXT DEFAULT 'सामान्य', -- जैसे 'शिकायत दर्ज करना', 'SOS', 'खाता', आदि
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- शिकायत श्रेणियां — अब database-driven (Super Admin जोड़/हटा/बदल सकता है) ----------
CREATE TABLE complaint_categories (
  id            BIGSERIAL PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE, -- शिकायत में यही store होता है (मौजूदा डेटा से मेल खाना चाहिए)
  label         TEXT NOT NULL,
  description   TEXT,
  icon          TEXT NOT NULL DEFAULT 'document-text-outline', -- Ionicons नाम
  color         TEXT NOT NULL DEFAULT '#8E2A46',
  sla_hours     INTEGER NOT NULL DEFAULT 48, -- इस श्रेणी के लिए SLA (Overdue चेतावनी) समय
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  requires_vehicle_number BOOLEAN NOT NULL DEFAULT false, -- 'सुरक्षित यात्रा मोड' जैसी श्रेणी के लिए
  fields        JSONB, -- Dynamic Form Builder — फॉर्म में कौन से फ़ील्ड्स दिखेंगे (null = कोड का डिफ़ॉल्ट सेट)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Broadcast / Announcement (एडमिन → सभी officers/citizens) ----------
CREATE TABLE broadcasts (
  id             BIGSERIAL PRIMARY KEY,
  sender_admin_id UUID NOT NULL REFERENCES admins(id),
  sender_name    TEXT,
  audience       TEXT NOT NULL,   -- 'officers' | 'citizens' | 'all'
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  district       TEXT,            -- वैकल्पिक — सिर्फ़ किसी एक ज़िले को भेजना हो तो
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- अधिकारी ड्यूटी रोस्टर ----------
CREATE TABLE duty_roster (
  id           BIGSERIAL PRIMARY KEY,
  officer_id   UUID NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  duty_date    DATE NOT NULL,
  shift        TEXT NOT NULL DEFAULT 'सामान्य', -- सामान्य | प्रातःकालीन | रात्रिकालीन
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (officer_id, duty_date)
);

-- ---------- Welfare Schemes व Support Services (admin से edit होने वाला Home content) ----------
CREATE TABLE welfare_items (
  id            BIGSERIAL PRIMARY KEY,
  section       TEXT NOT NULL,    -- 'welfare' | 'support'
  icon_emoji    TEXT,
  tag           TEXT,
  title         TEXT NOT NULL,
  description   TEXT,
  url           TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Helpline नंबर (admin से edit होने वाले) ----------
CREATE TABLE helpline_items (
  id            BIGSERIAL PRIMARY KEY,
  label         TEXT NOT NULL,
  number        TEXT NOT NULL,
  icon          TEXT NOT NULL DEFAULT 'call',
  color         TEXT NOT NULL DEFAULT '#7A1836',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true
);

-- ---------- Scheduled Reports (auto-email कॉन्फ़िगरेशन) ----------
CREATE TABLE report_schedules (
  id             BIGSERIAL PRIMARY KEY,
  created_by     UUID NOT NULL REFERENCES admins(id),
  frequency      TEXT NOT NULL DEFAULT 'weekly', -- 'weekly' | 'monthly'
  recipient_email TEXT NOT NULL,
  district       TEXT,            -- वैकल्पिक scope
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_sent_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- गतिविधि लॉग (Phase F — सुरक्षा स्तर की ऑडिट लॉगिंग) ----------
-- हर लॉगिन और हर महत्वपूर्ण कार्रवाई यहाँ दर्ज होती है — किसने, कब, क्या किया।
CREATE TABLE activity_logs (
  id            BIGSERIAL PRIMARY KEY,
  actor_role    TEXT NOT NULL,   -- 'citizen' | 'officer' | 'admin'
  actor_id      UUID,
  actor_name    TEXT,
  action        TEXT NOT NULL,   -- जैसे 'login', 'complaint_created', 'officer_created'
  details       TEXT,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 🔒 इस पंक्ति की अपनी integrity-मुहर (HMAC) — बाद में पंक्ति बदली जाए तो पकड़ी जाए।
  -- देखें utils/activityLog.js और scripts/verifyAuditLog.js
  entry_hash    TEXT
);
CREATE INDEX idx_activity_logs_actor  ON activity_logs (actor_role, actor_id);
CREATE INDEX idx_activity_logs_action ON activity_logs (action);
CREATE INDEX idx_activity_logs_created ON activity_logs (created_at DESC);

-- ---------- शिकायत हिस्ट्री / टाइमलाइन ----------
CREATE TABLE complaint_history (
  id            BIGSERIAL PRIMARY KEY,
  complaint_id  TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  status        complaint_status NOT NULL,
  note          TEXT,
  actor_role    TEXT NOT NULL,
  actor_name    TEXT,
  attachment_url  TEXT,    -- Phase E: अधिकारी मामला बंद करते समय वैकल्पिक फ़ोटो/दस्तावेज़
  voice_note_url  TEXT,    -- Phase E: अधिकारी की आवाज़ में टिप्पणी (वैकल्पिक)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_complaint ON complaint_history (complaint_id, created_at);

-- ---------- लाइव लोकेशन का पूरा ट्रैक (breadcrumb trail) ----------
-- पहले complaints.live_lat/live_lng सिर्फ़ आख़िरी बिंदु रखते थे — पूरा रास्ता कहीं सेव नहीं होता था।
-- अब हर अपडेट यहां भी जुड़ता है, ताकि अधिकारी नागरिक का पूरा चला हुआ रास्ता नक़्शे पर देख सकें।
CREATE TABLE complaint_location_trail (
  id           BIGSERIAL PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  latitude     TEXT NOT NULL,   -- 🔒 encrypted (देखें utils/fieldCrypto.js)
  longitude    TEXT NOT NULL,   -- 🔒 encrypted
  accuracy     REAL,                          -- मीटर में — जितना कम, उतना सटीक
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trail_complaint ON complaint_location_trail (complaint_id, recorded_at);

-- ---------- Phase H: अधिकारी की निजी टिप्पणियां (नागरिक को नहीं दिखतीं) ----------
CREATE TABLE officer_private_notes (
  id            BIGSERIAL PRIMARY KEY,
  complaint_id  TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  officer_id    UUID NOT NULL REFERENCES officers(id),
  officer_name  TEXT,
  note          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_private_notes_complaint ON officer_private_notes (complaint_id);

-- ---------- Phase H: फील्ड विज़िट GPS चेक-इन (जवाबदेही के लिए) ----------
CREATE TABLE field_visits (
  id            BIGSERIAL PRIMARY KEY,
  complaint_id  TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  officer_id    UUID NOT NULL REFERENCES officers(id),
  officer_name  TEXT,
  -- 🔒 encrypted (देखें utils/fieldCrypto.js) — बाक़ी हर GPS की तरह।
  -- फील्ड विज़िट के निर्देशांक असल में पीड़िता के ठिकाने के होते हैं, इसलिए इन्हें
  -- सादे रूप में रखना उतना ही जोखिम भरा है जितना उसका पता सादा रखना।
  latitude      TEXT,
  longitude     TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_field_visits_complaint ON field_visits (complaint_id);

-- ---------- Phase H: संदेश (अधिकारी ↔ एडमिन / अधिकारी ↔ अधिकारी) ----------
CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  sender_role     TEXT NOT NULL,
  sender_id       UUID NOT NULL,
  sender_name     TEXT,
  recipient_role  TEXT NOT NULL,
  recipient_id    UUID NOT NULL,
  body            TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_recipient ON messages (recipient_role, recipient_id, created_at DESC);
CREATE INDEX idx_messages_conversation ON messages (sender_id, recipient_id);

-- ---------- updated_at ट्रिगर ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_complaints_updated_at
BEFORE UPDATE ON complaints
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_citizens_updated_at
BEFORE UPDATE ON citizens
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_officers_updated_at
BEFORE UPDATE ON officers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 🆕 Account Deletion Requests — DPDP Act 2023 (Digital Personal Data
-- Protection Act) के तहत "मिटाने का अधिकार" (right to erasure)। सीधा
-- self-service delete नहीं — शिकायतें कानूनी/साक्ष्य दस्तावेज़ हैं, इसलिए हर
-- अनुरोध Super Admin के review के बाद ही असर करता है। Approve होने पर profile
-- की व्यक्तिगत जानकारी अज्ञात (anonymize) कर दी जाती है, शिकायत-रिकॉर्ड कानूनी
-- ज़रूरत के लिए बने रहते हैं (सिर्फ़ पीड़िता/नागरिक का नाम पहले से ही encrypted है)।
-- ============================================================
CREATE TABLE account_deletion_requests (
  id            BIGSERIAL PRIMARY KEY,
  citizen_id    UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  reason        TEXT,
  reviewed_by   TEXT,
  reviewed_by_name TEXT,
  review_note   TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ
);
CREATE INDEX idx_deletion_requests_status ON account_deletion_requests (status);
-- एक समय में एक नागरिक का सिर्फ़ एक pending अनुरोध हो सकता है
CREATE UNIQUE INDEX idx_deletion_requests_one_pending ON account_deletion_requests (citizen_id) WHERE status = 'pending';

-- ============================================================
-- 🆕 Complaint Chat — नागरिक और नियुक्त अधिकारी के बीच सीधी बातचीत, हमेशा किसी
-- एक शिकायत के दायरे में (case-scoped)। जान-बूझकर सामान्य person-to-person
-- messaging नहीं है — नागरिक सिर्फ़ अपनी शिकायत पर नियुक्त अधिकारी से बात कर
-- सकता है, किसी और अधिकारी को खोजकर मनमाना संदेश नहीं भेज सकता (निजता/सुरक्षा)।
-- ============================================================
CREATE TABLE complaint_messages (
  id            BIGSERIAL PRIMARY KEY,
  complaint_id  TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  sender_role   TEXT NOT NULL, -- 'citizen' | 'officer'
  sender_id     TEXT NOT NULL,
  sender_name   TEXT NOT NULL,
  body          TEXT NOT NULL,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_complaint_messages_complaint ON complaint_messages (complaint_id, created_at);
