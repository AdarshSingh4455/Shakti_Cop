-- ============================================================
-- डेमो/शुरुआती डेटा। ये असली bcrypt hash हैं (10 rounds), टेस्टिंग के लिए
-- तुरंत इस्तेमाल किए जा सकते हैं। सभी अधिकारियों का पासवर्ड: Officer@123
-- एडमिन का पासवर्ड: Admin@123 — production में डालते ही तुरंत बदल दें।
-- ============================================================

-- 🔒 Idempotent — हर INSERT अब DO-block गार्ड में है: सिर्फ़ तभी चलता है जब उस टेबल
-- में अभी कोई row न हो। मतलब यह फ़ाइल शुरुआत में एक बार, या ग़लती से/दोबारा भी
-- चलाई जाए — डेटा कभी duplicate नहीं होगा (पहली बार के बाद हर आगे का रन कुछ नहीं
-- करता, चुपचाप छोड़ देता है)।
-- Officers: पहले 3 SI (जांच अधिकारी), आख़िरी वाला SHO (थाना प्रभारी — नियुक्ति कर सकता है)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM officers LIMIT 1) THEN

    INSERT INTO officers (name, badge_id, mobile, email, password_hash, station, district, rank) VALUES
      ('उ.नि. प्रिया शर्मा',  'UP-4521', '9450000521', 'priya.sharma@uppolice.gov.in', '$2b$10$cDW0t4BvHy4htvB4o8KIfOJCAACLJAswRcmm.prmtlc/WzJrgqWme', 'हजरतगंज', 'लखनऊ', 'SI'),
      ('उ.नि. रवि वर्मा',    'UP-4522', '9450000522', 'ravi.verma@uppolice.gov.in', '$2b$10$cDW0t4BvHy4htvB4o8KIfOJCAACLJAswRcmm.prmtlc/WzJrgqWme', 'गोमती नगर', 'लखनऊ', 'SI'),
      ('उ.नि. अंजलि सिंह',   'UP-4523', '9450000523', 'anjali.singh@uppolice.gov.in', '$2b$10$cDW0t4BvHy4htvB4o8KIfOJCAACLJAswRcmm.prmtlc/WzJrgqWme', 'आलमबाग', 'लखनऊ', 'SI'),
      ('नि. विकास यादव',     'UP-4524', '9450000524', 'vikas.yadav@uppolice.gov.in', '$2b$10$cDW0t4BvHy4htvB4o8KIfOJCAACLJAswRcmm.prmtlc/WzJrgqWme', 'हजरतगंज', 'लखनऊ', 'SHO');

  END IF;
END $$;


-- Admin पदानुक्रम: Super Admin (पूरा नियंत्रण), फिर DSP/ASP/SSP (सिर्फ़ निगरानी — monitor)
-- डेमो के लिए सभी का पासवर्ड: Admin@123 (production में तुरंत बदलें)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins LIMIT 1) THEN

    INSERT INTO admins (name, username, mobile, email, password_hash, admin_role, district, rank, circle_stations) VALUES
      ('मुख्य प्रशासक (Super Admin)', 'admin', '9450000500', 'admin@uppolice.gov.in', '$2b$10$5k9vOt5U/qckeoHr0ZCaL.KIjPUh/EoFZINbGT8BRo.HNh69fTLxS', 'super_admin', NULL, NULL, '[]'),
      ('सर्किल अधिकारी (DSP)', 'dsp_lucknow', '9450000601', 'dsp.lucknow@uppolice.gov.in', '$2b$10$5k9vOt5U/qckeoHr0ZCaL.KIjPUh/EoFZINbGT8BRo.HNh69fTLxS', 'monitor', 'लखनऊ', 'DSP', '["हजरतगंज", "गोमती नगर"]'),
      ('सहायक पुलिस अधीक्षक (ASP)', 'asp_lucknow', '9450000602', 'asp.lucknow@uppolice.gov.in', '$2b$10$5k9vOt5U/qckeoHr0ZCaL.KIjPUh/EoFZINbGT8BRo.HNh69fTLxS', 'monitor', 'लखनऊ', 'ASP', '[]'),
      ('वरिष्ठ पुलिस अधीक्षक (SSP)', 'ssp_lucknow', '9450000603', 'ssp.lucknow@uppolice.gov.in', '$2b$10$5k9vOt5U/qckeoHr0ZCaL.KIjPUh/EoFZINbGT8BRo.HNh69fTLxS', 'monitor', NULL, 'SSP', '[]');

  END IF;
END $$;


-- डेमो नागरिक खाता (टेस्टिंग के लिए) — पासवर्ड: Citizen@123
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM citizens LIMIT 1) THEN

    INSERT INTO citizens (name, father_name, address, mobile, password_hash) VALUES
      ('सीमा देवी', 'राम प्रसाद', 'हजरतगंज, लखनऊ', '9415000021', '$2a$10$PMlCU/K1nDDU6B6T7rCeFOF6Et8jtF.FYEC2Kzr6KWzccBE0ExG6q');

  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM home_banners LIMIT 1) THEN

    INSERT INTO home_banners (title, subtitle, color_start, color_end, icon, display_order) VALUES
      ('Your Safety. Your Rights. Your Shakti', 'Mission Shakti 5.0 — Government of Uttar Pradesh', '#7A1836', '#9B2647', 'shield-checkmark', 1),
      ('महिलाओं के लिए, महिलाओं के साथ', 'हर शिकायत पर तुरंत कार्रवाई', '#0F2A44', '#1B4A73', 'people', 2),
      ('24x7 आपकी सुरक्षा के लिए तैयार', 'एक टैप में मदद', '#9B2647', '#C98A2B', 'heart', 3),
      ('सशक्त नारी, सशक्त उत्तर प्रदेश', 'Mission Shakti 5.0', '#1B4A73', '#2E7D5B', 'ribbon', 4);

  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM helpline_items LIMIT 1) THEN

    INSERT INTO helpline_items (label, number, icon, color, display_order) VALUES
      ('महिला हेल्पलाइन (UP)', '1090', 'woman', '#D6336C', 1),
      ('पुलिस आपातकाल', '112', 'shield-checkmark', '#0F2A44', 2),
      ('महिला हेल्पलाइन (राष्ट्रीय)', '181', 'call', '#9B2647', 3),
      ('साइबर क्राइम', '1930', 'lock-closed', '#1B4A73', 4),
      ('चाइल्ड हेल्पलाइन', '1098', 'happy', '#C98A2B', 5),
      ('एम्बुलेंस', '108', 'medkit', '#2E7D5B', 6),
      ('फायर ब्रिगेड', '101', 'flame', '#B23A2E', 7),
      ('CM हेल्पलाइन (UP)', '1076', 'megaphone', '#6B4E9B', 8);

  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM welfare_items LIMIT 1) THEN

    INSERT INTO welfare_items (section, icon_emoji, tag, title, description, url, display_order) VALUES
      ('welfare', '👶', 'Financial Aid', 'कन्या सुमंगला योजना', 'बेटी की शिक्षा व स्वास्थ्य हेतु सीधा वित्तीय लाभ।', 'https://mksy.up.gov.in', 1),
      ('welfare', '💍', 'Marriage Grant', 'शादी अनुदान योजना', 'ग़रीब परिवारों की बेटियों के विवाह हेतु आर्थिक सहायता।', 'https://shadianudan.upsdc.gov.in', 2),
      ('welfare', '👵', 'Widow Pension', 'विधवा पेंशन योजना', 'निराश्रित विधवा महिलाओं हेतु सामाजिक सुरक्षा व पेंशन।', 'https://sspy-up.gov.in', 3),
      ('welfare', '🏅', 'Financial Help', 'रानी लक्ष्मीबाई महिला एवं बाल सम्मान कोष', 'संकटग्रस्त महिलाओं व बच्चों हेतु आर्थिक सहायता।', 'https://msk.upsdc.gov.in', 4),
      ('welfare', '🎓', 'Education Aid', 'UP छात्रवृत्ति योजना', 'सभी वर्गों के छात्रों हेतु प्री व पोस्ट मैट्रिक छात्रवृत्ति।', 'https://scholarship.up.gov.in', 5),
      ('support', '💬', 'Confidential', 'काउंसलिंग सहायता', 'लाइसेंस-प्राप्त मनोवैज्ञानिक विशेषज्ञों से मुफ़्त काउंसलिंग।', 'https://msk.upsdc.gov.in', 1),
      ('support', '⚖️', 'Free Assistance', 'कानूनी सहायता (Legal Aid)', 'घरेलू हिंसा व सुरक्षा नियमों पर मुफ़्त वकील रेफ़रल।', 'https://msk.upsdc.gov.in', 2),
      ('support', '🏫', 'Vocational Training', 'जन शिक्षण संस्थान', 'महिलाओं हेतु मुफ़्त कौशल प्रशिक्षण व प्रमाणपत्र।', 'https://msk.upsdc.gov.in', 3),
      ('support', '🥋', 'Workshops', 'आत्मरक्षा प्रशिक्षण', 'मुफ़्त सुरक्षा कार्यशालाएं व आत्मरक्षा प्रमाणीकरण।', 'https://msk.upsdc.gov.in', 4);

  END IF;
END $$;


-- ज़िला/थाना starter सूची (Super Admin बाद में असली पूरी सूची अपलोड करके इसे बदल सकते हैं)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM police_stations LIMIT 1) THEN

    INSERT INTO police_stations (district, station, district_en, station_en) VALUES
      ('लखनऊ', 'हजरतगंज', 'Lucknow', 'Hazratganj'),
      ('लखनऊ', 'गोमती नगर', 'Lucknow', 'Gomti Nagar'),
      ('लखनऊ', 'आलमबाग', 'Lucknow', 'Alambagh'),
      ('लखनऊ', 'चौक', 'Lucknow', 'Chowk'),
      ('लखनऊ', 'ठाकुरगंज', 'Lucknow', 'Thakurganj'),
      ('कानपुर नगर', 'कोतवाली', 'Kanpur Nagar', 'Kotwali'),
      ('कानपुर नगर', 'स्वरूप नगर', 'Kanpur Nagar', 'Swaroop Nagar'),
      ('कानपुर नगर', 'गोविंद नगर', 'Kanpur Nagar', 'Govind Nagar'),
      ('कानपुर नगर', 'नजीराबाद', 'Kanpur Nagar', NULL),
      ('वाराणसी', 'कोतवाली', 'Varanasi', 'Kotwali'),
      ('वाराणसी', 'भेलूपुर', 'Varanasi', 'Bhelupur'),
      ('वाराणसी', 'चेतगंज', 'Varanasi', 'Chetganj'),
      ('वाराणसी', 'सिगरा', 'Varanasi', 'Sigra'),
      ('आगरा', 'हरीपर्वत', 'Agra', 'Hariparvat'),
      ('आगरा', 'सदर', 'Agra', 'Sadar'),
      ('आगरा', 'ताजगंज', 'Agra', 'Tajganj'),
      ('आगरा', 'न्यू आगरा', 'Agra', 'New Agra'),
      ('प्रयागराज', 'कोतवाली', 'Prayagraj', 'Kotwali'),
      ('प्रयागराज', 'सिविल लाइंस', 'Prayagraj', 'Civil Lines'),
      ('प्रयागराज', 'कर्नलगंज', 'Prayagraj', 'Colonelganj'),
      ('प्रयागराज', 'धूमनगंज', 'Prayagraj', 'Dhoomanganj'),
      ('गोरखपुर', 'कोतवाली', 'Gorakhpur', 'Kotwali'),
      ('गोरखपुर', 'कैंट', 'Gorakhpur', 'Cantt'),
      ('गोरखपुर', 'राजघाट', 'Gorakhpur', NULL),
      ('गोरखपुर', 'गोरखनाथ', 'Gorakhpur', NULL),
      ('मेरठ', 'कोतवाली', 'Meerut', 'Kotwali'),
      ('मेरठ', 'सिविल लाइन', 'Meerut', 'Civil Line'),
      ('मेरठ', 'ब्रह्मपुरी', 'Meerut', 'Brahmpuri'),
      ('मेरठ', 'लिसाड़ी गेट', 'Meerut', 'Lisari Gate'),
      ('गाज़ियाबाद', 'कोतवाली', 'Ghaziabad', 'Kotwali'),
      ('गाज़ियाबाद', 'इंदिरापुरम', 'Ghaziabad', 'Indirapuram'),
      ('गाज़ियाबाद', 'साहिबाबाद', 'Ghaziabad', 'Sahibabad'),
      ('गाज़ियाबाद', 'विजयनगर', 'Ghaziabad', NULL),
      ('नोएडा (गौतम बुद्ध नगर)', 'सेक्टर 20', 'Noida (Gautam Buddha Nagar)', NULL),
      ('नोएडा (गौतम बुद्ध नगर)', 'सेक्टर 39', 'Noida (Gautam Buddha Nagar)', NULL),
      ('नोएडा (गौतम बुद्ध नगर)', 'फेज़ 3', 'Noida (Gautam Buddha Nagar)', NULL),
      ('नोएडा (गौतम बुद्ध नगर)', 'बिसरख', 'Noida (Gautam Buddha Nagar)', 'Bisrakh'),
      ('बरेली', 'कोतवाली', 'Bareilly', 'Kotwali'),
      ('बरेली', 'बारादरी', 'Bareilly', 'Baradari'),
      ('बरेली', 'प्रेमनगर', 'Bareilly', NULL),
      ('बरेली', 'किला', 'Bareilly', 'Qila'),
      ('अलीगढ़', 'कोतवाली', 'Aligarh', 'Kotwali'),
      ('अम्बेडकर नगर', 'कोतवाली', 'Ambedkar Nagar', 'Kotwali'),
      ('अमेठी', 'कोतवाली', 'Amethi', 'Kotwali'),
      ('अमरोहा', 'कोतवाली', 'Amroha', 'Kotwali'),
      ('औरैया', 'कोतवाली', 'Auraiya', 'Kotwali'),
      ('अयोध्या', 'कोतवाली', 'Ayodhya', 'Kotwali'),
      ('आज़मगढ़', 'कोतवाली', 'Azamgarh', 'Kotwali'),
      ('बागपत', 'कोतवाली', 'Baghpat', 'Kotwali'),
      ('बहराइच', 'कोतवाली', 'Bahraich', 'Kotwali'),
      ('बलिया', 'कोतवाली', 'Ballia', 'Kotwali'),
      ('बलरामपुर', 'कोतवाली', 'Balrampur', 'Kotwali'),
      ('बांदा', 'कोतवाली', 'Banda', 'Kotwali'),
      ('बाराबंकी', 'कोतवाली', 'Barabanki', 'Kotwali'),
      ('बस्ती', 'कोतवाली', 'Basti', 'Kotwali'),
      ('भदोही', 'कोतवाली', 'Bhadohi', 'Kotwali'),
      ('बिजनौर', 'कोतवाली', 'Bijnor', 'Kotwali'),
      ('बदायूं', 'कोतवाली', 'Budaun', 'Kotwali'),
      ('बुलंदशहर', 'कोतवाली', 'Bulandshahr', 'Kotwali'),
      ('चंदौली', 'कोतवाली', 'Chandauli', 'Kotwali'),
      ('चित्रकूट', 'कोतवाली', 'Chitrakoot', 'Kotwali'),
      ('देवरिया', 'कोतवाली', 'Deoria', 'Kotwali'),
      ('एटा', 'कोतवाली', 'Etah', 'Kotwali'),
      ('इटावा', 'कोतवाली', 'Etawah', 'Kotwali'),
      ('फर्रुखाबाद', 'कोतवाली', 'Farrukhabad', 'Kotwali'),
      ('फतेहपुर', 'कोतवाली', 'Fatehpur', 'Kotwali'),
      ('फिरोज़ाबाद', 'कोतवाली', 'Firozabad', 'Kotwali'),
      ('गाज़ीपुर', 'कोतवाली', 'Ghazipur', 'Kotwali'),
      ('गोंडा', 'कोतवाली', 'Gonda', 'Kotwali'),
      ('हमीरपुर', 'कोतवाली', 'Hamirpur', 'Kotwali'),
      ('हापुड़', 'कोतवाली', 'Hapur', 'Kotwali'),
      ('हरदोई', 'कोतवाली', 'Hardoi', 'Kotwali'),
      ('हाथरस', 'कोतवाली', 'Hathras', 'Kotwali'),
      ('जालौन', 'कोतवाली', 'Jalaun', 'Kotwali'),
      ('जौनपुर', 'कोतवाली', 'Jaunpur', 'Kotwali'),
      ('झांसी', 'कोतवाली', 'Jhansi', 'Kotwali'),
      ('कन्नौज', 'कोतवाली', 'Kannauj', 'Kotwali'),
      ('कानपुर देहात', 'कोतवाली', 'Kanpur Dehat', 'Kotwali'),
      ('कासगंज', 'कोतवाली', 'Kasganj', 'Kotwali'),
      ('कौशाम्बी', 'कोतवाली', 'Kaushambi', 'Kotwali'),
      ('कुशीनगर', 'कोतवाली', 'Kushinagar', 'Kotwali'),
      ('लखीमपुर खीरी', 'कोतवाली', 'Lakhimpur Kheri', 'Kotwali'),
      ('ललितपुर', 'कोतवाली', 'Lalitpur', 'Kotwali'),
      ('महराजगंज', 'कोतवाली', 'Maharajganj', 'Kotwali'),
      ('महोबा', 'कोतवाली', 'Mahoba', 'Kotwali'),
      ('मैनपुरी', 'कोतवाली', 'Mainpuri', 'Kotwali'),
      ('मथुरा', 'कोतवाली', 'Mathura', 'Kotwali'),
      ('मऊ', 'कोतवाली', 'Mau', 'Kotwali'),
      ('मिर्ज़ापुर', 'कोतवाली', 'Mirzapur', 'Kotwali'),
      ('मुरादाबाद', 'कोतवाली', 'Moradabad', 'Kotwali'),
      ('मुज़फ़्फ़रनगर', 'कोतवाली', 'Muzaffarnagar', 'Kotwali'),
      ('पीलीभीत', 'कोतवाली', 'Pilibhit', 'Kotwali'),
      ('प्रतापगढ़', 'कोतवाली', 'Pratapgarh', 'Kotwali'),
      ('रायबरेली', 'कोतवाली', 'Raebareli', 'Kotwali'),
      ('रामपुर', 'कोतवाली', 'Rampur', 'Kotwali'),
      ('सहारनपुर', 'कोतवाली', 'Saharanpur', 'Kotwali'),
      ('संभल', 'कोतवाली', 'Sambhal', 'Kotwali'),
      ('संत कबीर नगर', 'कोतवाली', 'Sant Kabir Nagar', 'Kotwali'),
      ('शाहजहांपुर', 'कोतवाली', 'Shahjahanpur', 'Kotwali'),
      ('शामली', 'कोतवाली', 'Shamli', 'Kotwali'),
      ('श्रावस्ती', 'कोतवाली', 'Shravasti', 'Kotwali'),
      ('सिद्धार्थनगर', 'कोतवाली', 'Siddharthnagar', 'Kotwali'),
      ('सीतापुर', 'कोतवाली', 'Sitapur', 'Kotwali'),
      ('सोनभद्र', 'कोतवाली', 'Sonbhadra', 'Kotwali'),
      ('सुल्तानपुर', 'कोतवाली', 'Sultanpur', 'Kotwali'),
      ('उन्नाव', 'कोतवाली', 'Unnao', 'Kotwali');

  END IF;
END $$;


-- शिकायत श्रेणियां (मौजूदा hardcoded categories से migrate — keys बिल्कुल मेल खाने चाहिए)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM complaint_categories LIMIT 1) THEN

    INSERT INTO complaint_categories (key, label, description, icon, color, sla_hours, display_order, requires_vehicle_number) VALUES
      ('महिला हेल्प डेस्क', 'महिला हेल्प डेस्क', 'महिला सुरक्षा से जुड़ी किसी भी समस्या की शिकायत यहाँ दर्ज करें।', 'woman-outline', '#7A1836', 48, 1, false),
      ('एंटी रोमियो स्क्वॉड', 'एंटी रोमियो स्क्वॉड', 'छेड़छाड़ या असामाजिक व्यवहार की शिकायत — तुरंत कार्रवाई के लिए।', 'shield-outline', '#0F2A44', 24, 2, false),
      ('घरेलू हिंसा', 'घरेलू हिंसा', 'घर के अंदर हो रही हिंसा या उत्पीड़न की गोपनीय शिकायत।', 'home-outline', '#9B2647', 48, 3, false),
      ('सुरक्षित यात्रा मोड', 'सुरक्षित यात्रा मोड', 'यात्रा के दौरान असुरक्षित महसूस हो तो वाहन विवरण के साथ सूचित करें।', 'car-outline', '#2E7D5B', 12, 4, true),
      ('वॉइस शिकायत', 'वॉइस शिकायत', 'सिर्फ़ नाम, मोबाइल नंबर दें और अपनी शिकायत बोलकर रिकॉर्ड कर दें — बस इतना ही काफ़ी है।', 'mic-outline', '#C98A2B', 48, 5, false);

  END IF;
END $$;


-- FAQ / मदद (शुरुआती सूची — Admin बाद में बदल/जोड़ सकते हैं)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM faq_items LIMIT 1) THEN

    INSERT INTO faq_items (question, answer, category, display_order) VALUES
      ('शिकायत दर्ज करने के बाद क्या होता है?', 'आपकी शिकायत सीधे संबंधित थाने में जाती है और एक अधिकारी नियुक्त किया जाता है। आप कभी भी status track कर सकते हैं।', 'शिकायत दर्ज करना', 1),
      ('क्या मेरी शिकायत गोपनीय रहेगी?', 'हाँ, आपकी पहचान सिर्फ़ नियुक्त अधिकारी और एडमिन को दिखती है। आप चाहें तो गुमनाम रहकर भी शिकायत दर्ज कर सकते हैं।', 'शिकायत दर्ज करना', 2),
      ('SOS बटन दबाने पर क्या होता है?', 'आपकी लाइव लोकेशन तुरंत नज़दीकी थाने और एडमिन को भेज दी जाती है, साथ ही आपके इमरजेंसी संपर्कों को SMS भी जाता है।', 'SOS', 3),
      ('मैं अपना पासवर्ड कैसे बदलूं?', 'प्रोफ़ाइल स्क्रीन में जाकर "पासवर्ड बदलें" चुनें।', 'खाता', 4);

  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_locales LIMIT 1) THEN

    INSERT INTO app_locales (code, label, display_order) VALUES
      ('hi', 'हिंदी', 1),
      ('en', 'English', 2);

  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM translations LIMIT 1) THEN

    INSERT INTO translations (locale_code, source_text, translated_text) VALUES
      ('en', 'ShaktiCop', 'ShaktiCop'),
      ('en', 'उत्तर प्रदेश पुलिस', 'Uttar Pradesh Police'),
      ('en', 'महिला सुरक्षा एवं सशक्तिकरण केन्द्र', 'Women''s Safety & Empowerment Centre'),
      ('en', 'Your Safety. Your Rights. Your Shakti', 'Your Safety. Your Rights. Your Shakti'),
      ('en', 'Mission Shakti 5.0 — Government of Uttar Pradesh', 'Mission Shakti 5.0 — Government of Uttar Pradesh'),
      ('en', 'आपातकालीन हेल्पलाइन', 'Emergency Helplines'),
      ('en', 'शिकायत दर्ज करें', 'Submit Complaint'),
      ('en', 'शिकायत दर्ज करें →', 'File a Complaint →'),
      ('en', 'सहायता एवं कानूनी सेवाएं', 'Support & Legal Services'),
      ('en', 'कल्याणकारी योजनाएं', 'Welfare Schemes'),
      ('en', 'आगे बढ़ें', 'Proceed'),
      ('en', 'पोर्टल खोलें', 'Open Portal'),
      ('en', 'नज़दीकी थाना व अस्पताल', 'Nearby Police Station & Hospital'),
      ('en', 'नक्शे पर देखें, तुरंत दिशा-निर्देश पाएं', 'View on map, get directions instantly'),
      ('en', 'नागरिक', 'Citizen'),
      ('en', 'स्टाफ़ (अधिकारी/एडमिन)', 'Staff (Officer/Admin)'),
      ('en', 'नागरिक लॉगिन', 'Citizen Login'),
      ('en', 'स्टाफ़ लॉगिन', 'Staff Login'),
      ('en', 'मोबाइल नंबर', 'Mobile Number'),
      ('en', 'पासवर्ड', 'Password'),
      ('en', 'लॉगिन करें', 'Login'),
      ('en', 'पासवर्ड भूल गए?', 'Forgot Password?'),
      ('en', 'नया खाता बनाएं (साइनअप)', 'Create New Account (Signup)'),
      ('en', 'मोबाइल नंबर या ईमेल', 'Mobile Number or Email'),
      ('en', 'OTP भेजें', 'Send OTP'),
      ('en', 'OTP दर्ज करें', 'Enter OTP'),
      ('en', 'लॉगिन हो रहा है…', 'Logging in…'),
      ('en', 'नंबर/ईमेल बदलें', 'Change Number/Email'),
      ('en', 'वापस', 'Back'),
      ('en', 'लॉगआउट', 'Logout'),
      ('en', 'डैशबोर्ड', 'Dashboard'),
      ('en', 'नागरिक खाता बनाएं', 'Create Citizen Account'),
      ('en', 'पूरा नाम', 'Full Name'),
      ('en', 'पिता/पति का नाम', 'Father''s/Husband''s Name'),
      ('en', 'पता', 'Address'),
      ('en', 'पासवर्ड दोबारा डालें', 'Re-enter Password'),
      ('en', 'खाता बनाएं', 'Create Account'),
      ('en', 'जानकारी बदलें', 'Edit Details'),
      ('en', 'OTP नहीं मिला? दोबारा भेजें', 'Didn''t get OTP? Resend'),
      ('en', 'पासवर्ड भूल गए?\nअपना रजिस्टर्ड मोबाइल नंबर दें, हम OTP भेजेंगे।', 'Forgot Password?\nEnter your registered mobile number, we will send an OTP.'),
      ('en', 'नया पासवर्ड', 'New Password'),
      ('en', 'नया पासवर्ड दोबारा', 'Re-enter New Password'),
      ('en', 'पासवर्ड बदलें', 'Change Password'),
      ('en', 'वापस लॉगिन पर जाएं', 'Back to Login'),
      ('en', 'मेरी प्रोफ़ाइल', 'My Profile'),
      ('en', 'बदलाव सुरक्षित करें', 'Save Changes'),
      ('en', 'इमरजेंसी संपर्क', 'Emergency Contacts'),
      ('en', 'एक और संपर्क जोड़ें', 'Add Another Contact'),
      ('en', 'इमरजेंसी संपर्क सुरक्षित करें', 'Save Emergency Contacts'),
      ('en', 'कुल शिकायतें', 'Total Complaints'),
      ('en', 'लंबित', 'Pending'),
      ('en', 'अस्वीकृत', 'Rejected'),
      ('en', 'निस्तारित', 'Resolved'),
      ('en', 'नई शिकायत', 'New Complaint'),
      ('en', 'सभी', 'All'),
      ('en', 'नई शिकायत — श्रेणी चुनें', 'New Complaint — Choose Category'),
      ('en', 'सबसे नई पहले', 'Newest First'),
      ('en', 'सबसे पुरानी पहले', 'Oldest First'),
      ('en', 'फ़िल्टर', 'Filter'),
      ('en', 'फ़िल्टर हटाएं', 'Clear Filters'),
      ('en', 'अपने लिए', 'For Myself'),
      ('en', 'किसी और के लिए', 'For Someone Else'),
      ('en', 'व्यक्तिगत विवरण', 'Personal Details'),
      ('en', 'नाम', 'Name'),
      ('en', 'पिता/पति का नाम (वैकल्पिक)', 'Father''s/Husband''s Name (optional)'),
      ('en', 'घटनास्थल का जिला व थाना चयन करें', 'Select the district & police station of the incident location'),
      ('en', 'ज़िला', 'District'),
      ('en', 'थाना', 'Police Station'),
      ('en', 'पूरा पता (वैकल्पिक)', 'Full Address (optional)'),
      ('en', 'आरोपी से संबंध', 'Relationship with Accused'),
      ('en', 'शिकायत का विवरण', 'Complaint Details'),
      ('en', 'बोलने की भाषा:', 'Speaking Language:'),
      ('en', 'हिंदी', 'Hindi'),
      ('en', 'English', 'English'),
      ('en', 'घटना स्थल (वैकल्पिक)', 'Incident Location (optional)'),
      ('en', 'वाहन विवरण', 'Vehicle Details'),
      ('en', 'वाहन नंबर', 'Vehicle Number'),
      ('en', 'कहाँ से (From)', 'From'),
      ('en', 'कहाँ तक (To)', 'To'),
      ('en', 'अनुमानित दूरी (किमी)', 'Estimated Distance (km)'),
      ('en', 'अपनी शिकायत बोलकर दर्ज करें', 'Record Your Complaint by Speaking'),
      ('en', 'लाइव लोकेशन', 'Live Location'),
      ('en', 'प्रमाण संलग्न करें (वैकल्पिक)', 'Attach Evidence (optional)'),
      ('en', 'दर्ज हो रही है…', 'Submitting…'),
      ('en', 'पीड़ित का विवरण', 'Victim''s Details'),
      ('en', 'शिकायत की स्थिति', 'Complaint Status'),
      ('en', 'पूरा कार्यवाही लॉग', 'Full Action Log'),
      ('en', 'निजी टिप्पणियां (नागरिक को नहीं दिखतीं)', 'Private Notes (not visible to citizen)'),
      ('en', 'फील्ड विज़िट GPS चेक-इन', 'Field Visit GPS Check-in'),
      ('en', 'कार्यवाही अपडेट करें', 'Update Action'),
      ('en', 'मामला स्थानांतरित करें', 'Transfer Case'),
      ('en', 'सुरक्षा नियंत्रण', 'Safety Controls'),
      ('en', 'प्रतिक्रिया / रेटिंग', 'Feedback / Rating'),
      ('en', 'प्रतिक्रिया भेजें', 'Send Feedback'),
      ('en', 'प्रिंट करें', 'Print'),
      ('en', 'शेयर करें', 'Share'),
      ('en', 'नियुक्त अधिकारी', 'Assigned Officer'),
      ('en', 'दर्ज करने वाला', 'Filed By'),
      ('en', 'शिकायतकर्ता', 'Complainant'),
      ('en', 'मोबाइल', 'Mobile'),
      ('en', 'स्थान', 'Location'),
      ('en', 'स्थिति', 'Status'),
      ('en', 'श्रेणी', 'Category'),
      ('en', 'तिथि', 'Date'),
      ('en', 'नियुक्त करें', 'Assign'),
      ('en', 'सुरक्षित करें', 'Save'),
      ('en', 'रद्द करें', 'Cancel'),
      ('en', 'अपडेट सुरक्षित करें', 'Save Update'),
      ('en', 'सुरक्षित हो रहा है…', 'Saving…'),
      ('en', 'मेरे मामले', 'My Cases'),
      ('en', 'प्रदर्शन', 'Performance'),
      ('en', 'संदेश', 'Messages'),
      ('en', 'ड्यूटी स्थिति', 'Duty Status'),
      ('en', 'उपलब्ध', 'Available'),
      ('en', 'अवकाश पर', 'On Leave'),
      ('en', 'अन्य ड्यूटी पर', 'On Other Duty'),
      ('en', 'ज़िले से बाहर', 'Out of District'),
      ('en', 'मेरा प्रदर्शन', 'My Performance'),
      ('en', 'कुल नियुक्त', 'Total Assigned'),
      ('en', 'सक्रिय', 'Active'),
      ('en', 'निस्तारण दर (Resolution Rate)', 'Resolution Rate'),
      ('en', 'औसत निस्तारण समय', 'Average Resolution Time'),
      ('en', 'औसत नागरिक रेटिंग', 'Average Citizen Rating'),
      ('en', 'नया संदेश', 'New Message'),
      ('en', 'किससे बात करें?', 'Talk to whom?'),
      ('en', 'एडमिन', 'Admin'),
      ('en', 'अधिकारी', 'Officer'),
      ('en', 'एडमिन डैशबोर्ड', 'Admin Dashboard'),
      ('en', 'सभी शिकायतें', 'All Complaints'),
      ('en', 'अधिकारी प्रबंधन', 'Officer Management'),
      ('en', 'गतिविधि लॉग', 'Activity Logs'),
      ('en', 'सेटिंग्स', 'Settings'),
      ('en', 'सुरक्षित यात्रा (SOS)', 'Safe Travel (SOS)'),
      ('en', 'निर्यात', 'Export'),
      ('en', 'खोजें', 'Search'),
      ('en', 'नया अधिकारी', 'New Officer'),
      ('en', 'नाम, PNO और पासवर्ड आवश्यक हैं', 'Name, PNO and password are required'),
      ('en', 'महिला हेल्प डेस्क', 'Women Help Desk'),
      ('en', 'एंटी रोमियो स्क्वॉड', 'Anti-Romeo Squad'),
      ('en', 'घरेलू हिंसा', 'Domestic Violence'),
      ('en', 'सुरक्षित यात्रा मोड', 'Safe Travel Mode'),
      ('en', 'वॉइस शिकायत', 'Voice Complaint'),
      ('en', 'अधिकारी नियुक्त', 'Officer Assigned'),
      ('en', 'कार्यवाही जारी', 'In Progress'),
      ('en', 'दर्ज', 'Filed'),
      ('en', 'नमस्ते,', 'Hello,'),
      ('en', 'नई पहले', 'Newest first'),
      ('en', 'पुरानी पहले', 'Oldest first'),
      ('en', 'इस फ़िल्टर में कोई शिकायत नहीं', 'No complaints in this filter'),
      ('en', 'नीचे "नई शिकायत" टैब से दर्ज करें।', 'File one from the "New Complaint" tab below.'),
      ('en', 'भेजी जा रही हैं…', 'Sending…'),
      ('en', 'पीड़ित', 'Victim');

  END IF;
END $$;

