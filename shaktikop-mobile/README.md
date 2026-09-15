# ShaktiCop — मोबाइल एप

## इस राउंड में — District/Police Station अब पूरे app में सिर्फ़ Dropdown से चुनते हैं

### "District-Admin प्रबंधन" (DSP/SP/SSP/District-Admin बनाना)
पहले DSP के लिए "कॉमा से अलग करके थाने लिखें" (free-text) पूछा जाता था — इसी वजह से गलत entries
("Vin number", "Uffg" जैसी) बन रही थीं। अब: पहले ज़िला dropdown से चुनें, फिर उसी ज़िले के असली थानों
की सूची से multi-select chips से चुनें। ज़िला बदलने पर पुराने थाने अपने-आप साफ़ हो जाते हैं। SSP के
लिए ज़िला/थाना दोनों छुपे रहते हैं। इसी screen का पुराना असुरक्षित native Picker भी SafePicker से
बदला।

### OfficerFormScreen (अधिकारी जोड़ें/संपादित करें)
यह भी free-text था — अब पहले ज़िला, फिर उसी ज़िले के थाने dropdown से।

## चलाना
```
npx expo install
npx expo prebuild --platform android --clean
```

## ⚠️ पुरानी circle_stations वाली error — याद दिलाना
यह code की समस्या नहीं है — आपकी Railway database का schema पुराना है। हर नई zip के बाद ज़रूर चलाएं:
```
railway run psql $DATABASE_URL -f shaktikop-backend/src/db/schema.sql
```
