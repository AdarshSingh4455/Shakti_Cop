-- ============================================================
-- उत्तर प्रदेश के सभी 75 ज़िले — हिंदी + अंग्रेज़ी नाम सहित
--
-- अब तक seed.sql में सिर्फ़ 10 ज़िले व 41 थाने थे (एक "starter" सूची), और वह भी
-- सिर्फ़ तभी चलती है जब police_stations तालिका बिल्कुल खाली हो। इसलिए पहले से चल
-- रहे database में बाक़ी 65 ज़िले कभी जुड़ते ही नहीं थे — नागरिक/अधिकारी के dropdown
-- में सिर्फ़ 10 ज़िले दिखते।
--
-- यह फ़ाइल उन्हीं ज़िलों को जोड़ती है जो अभी मौजूद नहीं हैं। पहले से मौजूद पंक्तियां
-- बिल्कुल नहीं छेड़ी जातीं (ON CONFLICT DO NOTHING) — इसलिए इसे दोबारा चलाना भी
-- पूरी तरह सुरक्षित है।
--
-- ⚠️ जिन 65 ज़िलों के असली थानों की सूची उपलब्ध नहीं थी, उनके लिए फ़िलहाल एक ही
--    थाना ("कोतवाली") रखा गया है ताकि ज़िला dropdown में तुरंत दिखे। असली पूरी
--    थाना-सूची Super Admin बाद में "ज़िला व थाना" स्क्रीन से bulk-upload कर सकते हैं
--    (फ़ॉर्मेट: ज़िला, थाना, District(English), Station(English))।
--
-- चलाने के लिए:
--   psql "$DATABASE_URL" -f src/db/all_up_districts.sql
-- ============================================================

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
      ('गौतम बुद्ध नगर', 'नोएडा सेक्टर-20', 'Gautam Buddha Nagar', 'Noida Sector-20'),
      ('गौतम बुद्ध नगर', 'नोएडा सेक्टर-39', 'Gautam Buddha Nagar', 'Noida Sector-39'),
      ('गौतम बुद्ध नगर', 'फेज़-3', 'Gautam Buddha Nagar', 'Phase-3'),
      ('गौतम बुद्ध नगर', 'बिसरख', 'Gautam Buddha Nagar', 'Bisrakh'),
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
      ('उन्नाव', 'कोतवाली', 'Unnao', 'Kotwali')
ON CONFLICT (district, station) DO NOTHING;

-- पहले से मौजूद पंक्तियों में अगर अंग्रेज़ी नाम खाली रह गया हो, तो उसे भी भर दें
-- (ON CONFLICT DO NOTHING उन्हें छूता नहीं, इसलिए यह अलग से ज़रूरी है)
UPDATE police_stations SET district_en = 'Amroha' WHERE district = 'अमरोहा' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Amethi' WHERE district = 'अमेठी' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Ambedkar Nagar' WHERE district = 'अम्बेडकर नगर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Ayodhya' WHERE district = 'अयोध्या' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Aligarh' WHERE district = 'अलीगढ़' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Agra' WHERE district = 'आगरा' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Azamgarh' WHERE district = 'आज़मगढ़' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Etawah' WHERE district = 'इटावा' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Unnao' WHERE district = 'उन्नाव' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Etah' WHERE district = 'एटा' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Auraiya' WHERE district = 'औरैया' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Kannauj' WHERE district = 'कन्नौज' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Kanpur Dehat' WHERE district = 'कानपुर देहात' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Kanpur Nagar' WHERE district = 'कानपुर नगर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Kasganj' WHERE district = 'कासगंज' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Kushinagar' WHERE district = 'कुशीनगर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Kaushambi' WHERE district = 'कौशाम्बी' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Ghaziabad' WHERE district = 'गाज़ियाबाद' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Ghazipur' WHERE district = 'गाज़ीपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Gonda' WHERE district = 'गोंडा' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Gorakhpur' WHERE district = 'गोरखपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Chandauli' WHERE district = 'चंदौली' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Chitrakoot' WHERE district = 'चित्रकूट' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Jalaun' WHERE district = 'जालौन' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Jaunpur' WHERE district = 'जौनपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Jhansi' WHERE district = 'झांसी' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Deoria' WHERE district = 'देवरिया' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Gautam Buddha Nagar' WHERE district = 'गौतम बुद्ध नगर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Pilibhit' WHERE district = 'पीलीभीत' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Pratapgarh' WHERE district = 'प्रतापगढ़' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Prayagraj' WHERE district = 'प्रयागराज' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Fatehpur' WHERE district = 'फतेहपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Farrukhabad' WHERE district = 'फर्रुखाबाद' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Firozabad' WHERE district = 'फिरोज़ाबाद' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Budaun' WHERE district = 'बदायूं' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Bareilly' WHERE district = 'बरेली' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Balrampur' WHERE district = 'बलरामपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Ballia' WHERE district = 'बलिया' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Basti' WHERE district = 'बस्ती' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Bahraich' WHERE district = 'बहराइच' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Banda' WHERE district = 'बांदा' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Baghpat' WHERE district = 'बागपत' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Barabanki' WHERE district = 'बाराबंकी' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Bijnor' WHERE district = 'बिजनौर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Bulandshahr' WHERE district = 'बुलंदशहर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Bhadohi' WHERE district = 'भदोही' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Mau' WHERE district = 'मऊ' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Mathura' WHERE district = 'मथुरा' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Maharajganj' WHERE district = 'महराजगंज' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Mahoba' WHERE district = 'महोबा' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Mirzapur' WHERE district = 'मिर्ज़ापुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Muzaffarnagar' WHERE district = 'मुज़फ़्फ़रनगर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Moradabad' WHERE district = 'मुरादाबाद' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Meerut' WHERE district = 'मेरठ' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Mainpuri' WHERE district = 'मैनपुरी' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Rampur' WHERE district = 'रामपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Raebareli' WHERE district = 'रायबरेली' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Lucknow' WHERE district = 'लखनऊ' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Lakhimpur Kheri' WHERE district = 'लखीमपुर खीरी' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Lalitpur' WHERE district = 'ललितपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Varanasi' WHERE district = 'वाराणसी' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Shamli' WHERE district = 'शामली' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Shahjahanpur' WHERE district = 'शाहजहांपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Shravasti' WHERE district = 'श्रावस्ती' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Sant Kabir Nagar' WHERE district = 'संत कबीर नगर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Sambhal' WHERE district = 'संभल' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Saharanpur' WHERE district = 'सहारनपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Siddharthnagar' WHERE district = 'सिद्धार्थनगर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Sitapur' WHERE district = 'सीतापुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Sultanpur' WHERE district = 'सुल्तानपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Sonbhadra' WHERE district = 'सोनभद्र' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Hamirpur' WHERE district = 'हमीरपुर' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Hardoi' WHERE district = 'हरदोई' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Hathras' WHERE district = 'हाथरस' AND district_en IS NULL;
UPDATE police_stations SET district_en = 'Hapur' WHERE district = 'हापुड़' AND district_en IS NULL;
UPDATE police_stations SET station_en = 'Alambagh' WHERE station = 'आलमबाग' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Indirapuram' WHERE station = 'इंदिरापुरम' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Colonelganj' WHERE station = 'कर्नलगंज' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Qila' WHERE station = 'किला' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Cantt' WHERE station = 'कैंट' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Kotwali' WHERE station = 'कोतवाली' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Gomti Nagar' WHERE station = 'गोमती नगर' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Govind Nagar' WHERE station = 'गोविंद नगर' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Chetganj' WHERE station = 'चेतगंज' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Chowk' WHERE station = 'चौक' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Thakurganj' WHERE station = 'ठाकुरगंज' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Tajganj' WHERE station = 'ताजगंज' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Dhoomanganj' WHERE station = 'धूमनगंज' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'New Agra' WHERE station = 'न्यू आगरा' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Baradari' WHERE station = 'बारादरी' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Bisrakh' WHERE station = 'बिसरख' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Brahmpuri' WHERE station = 'ब्रह्मपुरी' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Bhelupur' WHERE station = 'भेलूपुर' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Lisari Gate' WHERE station = 'लिसाड़ी गेट' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Sadar' WHERE station = 'सदर' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Sahibabad' WHERE station = 'साहिबाबाद' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Sigra' WHERE station = 'सिगरा' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Civil Lines' WHERE station = 'सिविल लाइंस' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Civil Line' WHERE station = 'सिविल लाइन' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Swaroop Nagar' WHERE station = 'स्वरूप नगर' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Hazratganj' WHERE station = 'हजरतगंज' AND station_en IS NULL;
UPDATE police_stations SET station_en = 'Hariparvat' WHERE station = 'हरीपर्वत' AND station_en IS NULL;
