-- ============================================================
-- डेमो/शुरुआती admin खाते
--
-- ⚠️ यह फ़ाइल सिर्फ़ पहली बार सेटअप या टेस्टिंग के लिए है। असली तैनाती में admin
--    खाते हमेशा ऐप के "एडमिन प्रबंधन" से बनाएं — तब backend की सारी जांचें
--    (ज़िला अनिवार्य, सर्किल-थाने उसी ज़िले के हों, पासवर्ड-नीति) लागू होती हैं।
--    यह SQL सीधे database में लिखती है, इसलिए वे जांचें नहीं चलतीं।
--
-- 🐛 पुरानी fix_admins.sql में दो ख़ामियां थीं, यहां दोनों ठीक हैं:
--
--    1. rank = 'SP' — यह रैंक अब मौजूद ही नहीं है, इसका नाम बदलकर 'ASP' हो चुका है
--       (देखें db/rename_sp_to_asp.sql)। 'SP' वाला खाता बनने पर वह किसी भी
--       रैंक-आधारित जांच में फ़िट नहीं होता।
--
--    2. SSP का district NULL था — यह गंभीर सुरक्षा-चूक है। SSP का पूरा दायरा
--       district पर ही टिका है; district न हो तो middleware में adminScope खाली
--       रह जाता है, जिसका मतलब backend के लिए "कोई सीमा नहीं" — यानी SSP को
--       चुपचाप super_admin जैसी पूरे राज्य की दृश्यता मिल जाती।
--
-- सभी डेमो पासवर्ड: Admin@123
-- ⛔ production में ये खाते बनाने के तुरंत बाद पासवर्ड बदलें (या इन्हें बनाएं ही नहीं)।
-- ============================================================

INSERT INTO admins (name, username, mobile, email, password_hash, admin_role, district, rank, circle_stations) VALUES
  ('मुख्य प्रशासक (Super Admin)', 'admin', '9450000500', 'admin@uppolice.gov.in',
   '$2b$10$5k9vOt5U/qckeoHr0ZCaL.KIjPUh/EoFZINbGT8BRo.HNh69fTLxS',
   'super_admin', NULL, NULL, '[]'),

  ('सर्किल अधिकारी (DSP)', 'dsp_lucknow', '9450000601', 'dsp.lucknow@uppolice.gov.in',
   '$2b$10$5k9vOt5U/qckeoHr0ZCaL.KIjPUh/EoFZINbGT8BRo.HNh69fTLxS',
   'monitor', 'लखनऊ', 'DSP', '["हजरतगंज", "गोमती नगर"]'),

  -- 🐛 'SP' → 'ASP' (रैंक का नाम बदल चुका है)
  ('अपर पुलिस अधीक्षक (ASP)', 'asp_lucknow', '9450000602', 'asp.lucknow@uppolice.gov.in',
   '$2b$10$5k9vOt5U/qckeoHr0ZCaL.KIjPUh/EoFZINbGT8BRo.HNh69fTLxS',
   'monitor', 'लखनऊ', 'ASP', '[]'),

  -- 🐛 SSP का district अब भरा हुआ है (पहले NULL था = पूरे राज्य की दृश्यता)
  ('वरिष्ठ पुलिस अधीक्षक (SSP)', 'ssp_lucknow', '9450000603', 'ssp.lucknow@uppolice.gov.in',
   '$2b$10$5k9vOt5U/qckeoHr0ZCaL.KIjPUh/EoFZINbGT8BRo.HNh69fTLxS',
   'monitor', 'लखनऊ', 'SSP', '[]')

ON CONFLICT DO NOTHING;

-- अगर पुरानी fix_admins.sql पहले चल चुकी है, तो उसकी दोनों ख़ामियां यहीं सुधर जाएं
UPDATE admins SET rank = 'ASP' WHERE rank = 'SP';
UPDATE admins SET district = 'लखनऊ'
 WHERE admin_role = 'monitor' AND rank IN ('DSP', 'ASP', 'SSP') AND district IS NULL;
