-- ============================================================
-- डुप्लिकेट साफ़ करें — योजनाएं, हेल्पलाइन, बैनर, FAQ, श्रेणियां
--
-- कारण: seed.sql एक से ज़्यादा बार चल गई थी और इन तालिकाओं पर कोई
-- UNIQUE नियम नहीं था, इसलिए हर बार वही पंक्तियां दोबारा जुड़ती रहीं।
-- ऐप में यही "काउंसलिंग सहायता" दो बार, "1090" दो बार दिखने का कारण है।
--
-- यह फ़ाइल दो काम करती है:
--   1. हर सूची में सबसे पुरानी पंक्ति रखकर बाकी नक़लें हटा देती है
--   2. UNIQUE नियम जोड़ती है ताकि आगे seed दोबारा चले तो भी डुप्लिकेट न बनें
-- ============================================================

-- ---------- 1. योजनाएं व सहायता सेवाएं ----------
DELETE FROM welfare_items a
USING welfare_items b
WHERE a.id > b.id AND a.section = b.section AND a.title = b.title;

-- ---------- 2. हेल्पलाइन नंबर ----------
DELETE FROM helpline_items a
USING helpline_items b
WHERE a.id > b.id AND a.number = b.number;

-- ---------- 3. होम बैनर ----------
DELETE FROM home_banners a
USING home_banners b
WHERE a.id > b.id AND COALESCE(a.title,'') = COALESCE(b.title,'')
  AND COALESCE(a.subtitle,'') = COALESCE(b.subtitle,'');

-- ---------- 4. FAQ ----------
DELETE FROM faq_items a
USING faq_items b
WHERE a.id > b.id AND a.question = b.question;

-- ---------- 5. भाषा अनुवाद ----------
DELETE FROM translations a
USING translations b
WHERE a.id > b.id AND a.locale_code = b.locale_code AND a.source_text = b.source_text;

-- ---------- 6. आगे डुप्लिकेट न बनें ----------
-- (पहले से मौजूद हों तो त्रुटि न आए, इसलिए नाम देकर सशर्त जोड़ते हैं)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_welfare_section_title') THEN
    ALTER TABLE welfare_items ADD CONSTRAINT uq_welfare_section_title UNIQUE (section, title);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_helpline_number') THEN
    ALTER TABLE helpline_items ADD CONSTRAINT uq_helpline_number UNIQUE (number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_faq_question') THEN
    ALTER TABLE faq_items ADD CONSTRAINT uq_faq_question UNIQUE (question);
  END IF;
  -- 🐛 बग फ़िक्स: translations के लिए यह constraint यहां जोड़ना छूट गया था — schema.sql
  -- में तो नए database के लिए मौजूद है, पर पुराने (deployed) database पर, जिन पर यह
  -- फ़ाइल चलाई जाती है, यह गायब रह जाता। localeController.js का bulkUploadTranslations
  -- फ़ंक्शन ON CONFLICT (locale_code, source_text) इस्तेमाल करता है — बिना इस constraint
  -- के वह हर बार डेटाबेस-त्रुटि देता ("no unique or exclusion constraint")।
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'translations_locale_code_source_text_key') THEN
    ALTER TABLE translations ADD CONSTRAINT translations_locale_code_source_text_key UNIQUE (locale_code, source_text);
  END IF;
END $$;

-- ---------- जाँच ----------
SELECT 'welfare_items' AS tabel, count(*) FROM welfare_items
UNION ALL SELECT 'helpline_items', count(*) FROM helpline_items
UNION ALL SELECT 'home_banners', count(*) FROM home_banners
UNION ALL SELECT 'faq_items', count(*) FROM faq_items;
-- अपेक्षित: welfare_items 9 · helpline_items 8 · home_banners 4 · faq_items 4
