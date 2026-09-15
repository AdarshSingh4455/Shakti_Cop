-- ============================================================
-- सेवा अनुरोध — काउंसलिंग सहायता, कानूनी सहायता,
-- आत्मरक्षा प्रशिक्षण, जन शिक्षण / सशक्तिकरण कार्यक्रम
--
-- यह अकेली फ़ाइल पूरा काम करती है — अलग से counselling.sql चलाने की
-- ज़रूरत नहीं। अगर वह पहले चल चुकी है तो भी यह सुरक्षित है:
-- IF NOT EXISTS की वजह से कुछ दोहराया नहीं जाएगा और पहले से दर्ज
-- अनुरोध ज्यों के त्यों बने रहेंगे।
--
-- ⚠️ तालिका का नाम counselling_requests ही रखा गया है ताकि पुराने
--    काउंसलिंग अनुरोध सुरक्षित रहें। अब इसमें चारों सेवाएं आती हैं,
--    जिन्हें type कॉलम अलग करता है।
-- ============================================================

CREATE TABLE IF NOT EXISTS counselling_requests (
  id             TEXT PRIMARY KEY,
  citizen_id     UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,

  -- कौन सी सेवा: 'counselling' | 'legal_aid' | 'self_defence' | 'empowerment'
  type           TEXT NOT NULL DEFAULT 'counselling',

  -- अनुरोध के समय की प्रोफ़ाइल जानकारी
  -- (बाद में नागरिक प्रोफ़ाइल बदले तो भी यह रिकॉर्ड वैसा ही रहे)
  name           TEXT NOT NULL,
  father_name    TEXT,
  mobile         TEXT NOT NULL,
  district       TEXT,
  police_station TEXT,

  -- सेवा-विशेष अतिरिक्त जानकारी (जो लागू न हो वह खाली रहती है)
  age            SMALLINT,
  gender         TEXT,
  address        TEXT,
  education      TEXT,

  reason_key     TEXT,          -- ड्रॉपडाउन से चुना गया कारण / रुचि
  reason_detail  TEXT,          -- नागरिक द्वारा लिखा विस्तृत विवरण

  status         TEXT NOT NULL DEFAULT 'अनुरोध प्राप्त',
  -- 'अनुरोध प्राप्त' | 'सत्र निर्धारित' | 'पूर्ण' | 'रद्द'

  -- अधिकारी (DSP व ऊपर) द्वारा तय किया गया सत्र
  scheduled_at    TIMESTAMPTZ,
  venue           TEXT,
  counsellor_name TEXT,
  counsellor_id   BIGINT, -- असली ID से मिलान (service_providers.id) — FK बाद में migration में जोड़ा जाता है, ताकि execution order पर निर्भर न रहे
  officer_note    TEXT,
  scheduled_by    TEXT,         -- किस अधिकारी ने तय किया (जवाबदेही)
  scheduled_by_id UUID,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- पुरानी तालिका को नए कॉलम मिलें ----------
-- (अगर पहले सिर्फ़ काउंसलिंग वाली तालिका बनी थी, तो ये कॉलम तब नहीं थे)
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS type      TEXT NOT NULL DEFAULT 'counselling';
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS age       SMALLINT;
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS gender    TEXT;
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS address   TEXT;
ALTER TABLE counselling_requests ADD COLUMN IF NOT EXISTS education TEXT;

-- पहले से दर्ज सारे अनुरोध काउंसलिंग के ही थे
UPDATE counselling_requests SET type = 'counselling' WHERE type IS NULL OR type = '';

-- ---------- इंडेक्स ----------
CREATE INDEX IF NOT EXISTS idx_counselling_citizen  ON counselling_requests (citizen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_counselling_status   ON counselling_requests (status);
CREATE INDEX IF NOT EXISTS idx_counselling_district ON counselling_requests (district);
CREATE INDEX IF NOT EXISTS idx_counselling_type     ON counselling_requests (type, status, created_at DESC);

-- ---------- updated_at अपने-आप बदलता रहे ----------
-- set_updated_at() फ़ंक्शन schema.sql में पहले से बना हुआ है
DROP TRIGGER IF EXISTS trg_counselling_updated_at ON counselling_requests;
CREATE TRIGGER trg_counselling_updated_at
BEFORE UPDATE ON counselling_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
