# अभी क्या-क्या करना बाक़ी है

बातचीत के दौरान कई काम जमा हो गए हैं। यहाँ सब एक जगह, **क्रम में**।

---

## 🔴 अभी (सुरक्षा — टालें नहीं)

### 1. उजागर हो चुके credentials बदलें
इस बातचीत में **तीन** credentials साझा हो चुके हैं:

| क्या | कहाँ बदलें |
|---|---|
| डेटाबेस पासवर्ड (दो बार आया) | Railway → Postgres → Variables |
| `.env` के सारे secrets | Railway → Variables |
| Gmail app-password | myaccount.google.com/apppasswords → पुराना Delete |

**⚠️ JWT_SECRET बदलने का क्रम ज़रूरी है:**
```cmd
REM 1. पहले — वरना पूरा पुराना audit-log असत्यापित हो जाएगा
railway variables --set AUDIT_HMAC_KEY=<JWT_SECRET का मौजूदा मान>

REM 2. अब JWT_SECRET बदलें
railway variables --set JWT_SECRET=<नया>
```
> JWT_SECRET बदलते ही सभी उपयोगकर्ता लॉगआउट हो जाएंगे — कम-ट्रैफ़िक समय में करें।

---

## 🟠 माइग्रेशन (एक बार, live पर सुरक्षित)

```cmd
set PGURL=postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:<DB_PORT>/<DB_NAME>

REM प्रदर्शन — शिकायत-सूची तेज़ करता है (CONCURRENTLY, ऐप नहीं रुकेगा)
psql "%PGURL%" -f src/db/scale_indexes.sql

REM DSP/ASP/SSP को analytics मेन्यू (कोड का नया डिफ़ॉल्ट सिर्फ़ *नए* खातों पर लगता है)
psql "%PGURL%" -f src/db/monitor_analytics_menu.sql
```

बाक़ी माइग्रेशन (`citizen_email`, `otp_hashing`, `audit_tamper_evidence`,
`field_visit_gps_encryption`, `complaint_resolved_at`, `all_up_districts`,
`up_police_stations_ALL`) आप पहले ही चला चुके हैं। दोबारा चलाना भी सुरक्षित है।

**जाँच:**
```cmd
psql "%PGURL%" -c "SELECT count(*) FROM pg_indexes WHERE indexname LIKE 'idx_complaints_%%';"
psql "%PGURL%" -c "SELECT rank, count(*) FILTER (WHERE menu_permissions->>'analytics'='true') AS analytics FROM admins WHERE admin_role='monitor' GROUP BY rank;"
```

---

## 🟡 ईमेल — असली नागरिकों तक पहुँचाने के लिए

अभी Resend सिर्फ़ **आपके अपने खाते वाले ईमेल** पर भेजता है। असली उपयोगकर्ताओं तक
पहुँचाने के लिए डोमेन सत्यापित करना होगा:

1. **resend.com → Domains → Add Domain** (जैसे `shaktikop.up.gov.in`)
2. Resend जो DNS records दे, वे UP Police की IT टीम से जुड़वाएँ
3. सत्यापित होने पर:
```cmd
railway variables --set RESEND_FROM=ShaktiCop <noreply@shaktikop.up.gov.in>
```

**फ़ायदा दो हैं:** किसी भी ईमेल पर भेज सकेंगे, **और** spam-folder की समस्या भी हल
होगी (व्यक्तिगत Gmail से आने वाले OTP अक्सर spam में जाते हैं — सरकारी ऐप के लिए
वह वैसे भी ठीक नहीं था)।

---

## 🟡 SMS — DLT (आज ही शुरू करें, हफ़्ते लगते हैं)

क्रम: **PE पंजीकरण → हेडर → कंटेंट टेम्पलेट**। तीनों इसी क्रम में।

हेडर व टेम्पलेट का पूरा ब्योरा `DLT-HEADER-TEMPLATE.md` में है।
सबसे लंबा चरण PE-पंजीकरण है — UP Police का PAN/TAN व अधिकृत-हस्ताक्षरकर्ता के
दस्तावेज़ चाहिए। **यह विभाग से आने में समय लेता है, DLT पोर्टल में नहीं।**

स्वीकृत होने पर:
```cmd
railway variables --set MSG91_AUTH_KEY=<key>
railway variables --set MSG91_SENDER_ID=UPPOLC
railway variables --set MSG91_TEMPLATE_ID=<ID>
```

---

## 🟡 थानों के निर्देशांक (SOS इसी पर निर्भर)

```cmd
node src/scripts/geocodePoliceStations.js --dry-run   REM पहले जाँच लें
node src/scripts/geocodePoliceStations.js
```
~60% भर जाएँगे; बाक़ी SHO ऐप से "मेरी लोकेशन इस्तेमाल करें" से भरें।

**बिना इसके SOS में "नज़दीकी थाना" नहीं निकलता।**

---

## ⚪ लॉन्च के दिन — परीक्षण-कॉन्फ़िग हटाएँ

```cmd
railway variables --unset DEV_OTP_SIGNUP_ONLY
railway variables --unset DEMO_ACCOUNTS
railway variables --unset OTP_DEV_MODE
railway variables --set SENTRY_DSN=<आपका DSN>
```

startup लॉग में इनकी स्थिति छपती है (`🎭` और `🧪`) — इसीलिए, ताकि यह भूल न हो।

---

## ⚪ लॉन्च से पहले — कोड के बाहर

| काम | क्यों |
|---|---|
| **CERT-In empanelled VAPT** | सरकारी तैनाती में आम तौर पर अनिवार्य। कोड-समीक्षा उसका विकल्प नहीं |
| **DPDP अनुपालन** | गोपनीयता नीति की क़ानूनी समीक्षा, डेटा-संरक्षण अधिकारी |
| **24×7 SOS प्रतिक्रिया की SOP** | ऐप अलर्ट भेज देगा — *उसके बाद कौन, कितनी देर में, क्या करेगा* |
| **1561 SHO खातों की योजना** | कौन बनाएगा, PNO सूची कहाँ से, तबादले पर कौन अपडेट करेगा |
| **चरणबद्ध रोलआउट** | 2-3 ज़िलों का पायलट → मंडल-वार → पूरा राज्य |

---

## नया इस दौर में

- **SOS प्रतिक्रिया-समय** का विश्लेषण (avg / median / p90 + थाना-वार)
- **बार-बार शिकायत करने वाली पीड़िताएं** (पहचान कभी नहीं दिखती)
- **DSP/ASP/SSP को analytics** — अपने circle/ज़िले तक सीमित, बदलाव की अनुमति नहीं
- `officer_viewed_at` अब हर अधिकृत अधिकारी के पहले view पर दर्ज होता है
  (पहले सिर्फ़ नियुक्त अधिकारी पर — जिससे SOS का आंकड़ा ग़लत आता)
