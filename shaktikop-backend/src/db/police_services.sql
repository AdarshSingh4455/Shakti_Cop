-- ============================================================
-- पुलिस सेवाएं — अब Super Admin ऐप से ही जोड़/हटा/बदल सकते हैं
--
-- पहले ये सेवाएं मोबाइल ऐप के कोड में लिखी हुई थीं (PoliceServicesScreen.js)।
-- इसका मतलब था कि कोई भी बदलाव — नया लिंक, बदला हुआ URL, या कोई सेवा हटाना —
-- सिर्फ़ नई APK बनाकर ही हो सकता था, और वह हर उपयोगकर्ता तक पहुँचने में हफ़्ते
-- लगते। सरकारी पोर्टल के URL बदलते रहते हैं, इसलिए यह व्यावहारिक नहीं था।
--
-- अब ये database में हैं: Super Admin बदलाव करता है और वह सबको तुरंत दिखता है।
--
-- चलाने के लिए:
--   psql "$DATABASE_URL" -f src/db/police_services.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS police_services (
  id            BIGSERIAL PRIMARY KEY,
  service_group TEXT NOT NULL,              -- जैसे 'शिकायत व FIR'
  tag           TEXT,                       -- छोटा लेबल, जैसे 'UPCOP पोर्टल'
  title         TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,                       -- Ionicons का नाम, जैसे 'document-text-outline'
  color_key     TEXT,                       -- theme के रंग का नाम (नीचे टिप्पणी देखें)
  url           TEXT,                       -- बाहरी लिंक
  internal_screen TEXT,                     -- या ऐप के भीतर की स्क्रीन (जैसे 'ComplaintForm')
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ⚠️ url और internal_screen में से ठीक एक ही होना चाहिए — दोनों खाली हों तो कार्ड
--    दबाने पर कुछ नहीं होता, और दोनों भरे हों तो कौन-सा चले यह अस्पष्ट रहता।
--    (यही जाँच backend में भी है; यहाँ database-स्तर पर भी पक्का कर देते हैं।)
ALTER TABLE police_services DROP CONSTRAINT IF EXISTS police_services_target_chk;
ALTER TABLE police_services ADD CONSTRAINT police_services_target_chk CHECK (
  (url IS NOT NULL AND TRIM(url) <> '' AND (internal_screen IS NULL OR TRIM(internal_screen) = ''))
  OR
  (internal_screen IS NOT NULL AND TRIM(internal_screen) <> '' AND (url IS NULL OR TRIM(url) = ''))
);

CREATE INDEX IF NOT EXISTS idx_police_services_order
  ON police_services (is_active, service_group, display_order, id);

DROP TRIGGER IF EXISTS trg_police_services_updated_at ON police_services;
CREATE TRIGGER trg_police_services_updated_at
BEFORE UPDATE ON police_services
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- मौजूदा सूची (जो अब तक कोड में थी) ----------
-- सिर्फ़ तभी भरते हैं जब तालिका खाली हो, ताकि दोबारा चलाने पर Super Admin के किए
-- बदलाव न मिटें।
INSERT INTO police_services (service_group, tag, title, description, icon, color_key, url, internal_screen, display_order)
SELECT * FROM (VALUES
  -- शिकायत व FIR
  ('शिकायत व FIR', 'इसी ऐप में', 'सुरक्षा शिकायत दर्ज करें', 'महिला सुरक्षा से जुड़ी शिकायत सीधे ShaktiCop में दर्ज करें — थाने तक तुरंत पहुँचेगी।', 'shield-checkmark-outline', 'shaktiMaroon', NULL, 'ComplaintForm', 1),
  ('शिकायत व FIR', 'इसी ऐप में', 'शिकायत ID से ट्रैक करें', 'अपनी शिकायत की स्थिति और अधिकारी की कार्यवाही देखें।', 'search-outline', 'inkNavyLight', NULL, 'TrackComplaint', 2),
  ('शिकायत व FIR', 'UPCOP पोर्टल', 'ई-प्राथमिकी (e-FIR) दर्ज करें', 'चोरी व अज्ञात के विरुद्ध ऑनलाइन FIR — UP पुलिस के आधिकारिक पोर्टल पर।', 'document-text-outline', 'inkNavy', 'https://uppolice.gov.in/', NULL, 3),
  ('शिकायत व FIR', 'UPCOP पोर्टल', 'FIR देखें / डाउनलोड करें', 'दर्ज FIR की प्रति ऑनलाइन देखें और डाउनलोड करें।', 'reader-outline', 'inkNavy', 'https://uppolice.gov.in/', NULL, 4),

  -- साइबर, मोबाइल व चालान
  ('साइबर, मोबाइल व चालान', 'भारत सरकार', 'साइबर अपराध की शिकायत', 'ऑनलाइन ठगी, अश्लील सामग्री या साइबर उत्पीड़न की शिकायत — cybercrime.gov.in पर।', 'globe-outline', 'inkNavy', 'https://cybercrime.gov.in/', NULL, 1),
  ('साइबर, मोबाइल व चालान', 'भारत सरकार', 'खोया/चोरी मोबाइल ब्लॉक करें', 'CEIR पोर्टल से अपना खोया हुआ फ़ोन ब्लॉक व ट्रैक कराएं।', 'phone-portrait-outline', 'inkNavy', 'https://www.ceir.gov.in/', NULL, 2)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM police_services LIMIT 1);
