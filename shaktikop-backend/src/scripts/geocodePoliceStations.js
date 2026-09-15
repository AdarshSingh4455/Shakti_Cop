// ============================================================
// थानों के निर्देशांक (latitude/longitude) भरने वाली स्क्रिप्ट
//
// क्यों ज़रूरी है:
//   up_police_stations_ALL.sql सिर्फ़ ज़िला+थाने का नाम भरती है — निर्देशांक नहीं।
//   इसीलिए nearbyController का fetchInternalPoliceStations() हमेशा 0 rows लौटाता
//   है (उसकी query में "WHERE latitude IS NOT NULL" है), और ऐप को मजबूरन
//   OpenStreetMap पर निर्भर रहना पड़ता है — जिसमें UP के कई छोटे कस्बों के थाने
//   दर्ज ही नहीं हैं। नतीजा: SOS के समय "नज़दीकी थाना" अक्सर खाली रह जाता है।
//
//   यह स्क्रिप्ट LocationIQ की geocoding API से हर थाने के *असली* निर्देशांक
//   मंगाकर डेटाबेस में भरती है।
//
// ⚠️ सबसे ज़रूरी नियम — ग़लत निर्देशांक, खाली से भी बुरे हैं:
//   अगर किसी थाने का ग़लत स्थान भर गया, तो SOS के वक़्त सिस्टम पूरे विश्वास के साथ
//   ग़लत थाना बताएगा — और मदद ग़लत जगह जाएगी। इसलिए यह स्क्रिप्ट जान-बूझकर
//   "सावधान" है: जो नतीजा भरोसेमंद न लगे, उसे छोड़ देती है (NULL ही रहने देती है)।
//   हर बचाव नीचे verify() में समझाया गया है।
//
// चलाएं:
//   node src/scripts/geocodePoliceStations.js            (असली — DB में लिखेगी)
//   node src/scripts/geocodePoliceStations.js --dry-run  (सिर्फ़ दिखाएगी, लिखेगी नहीं)
//   node src/scripts/geocodePoliceStations.js --district="लखनऊ"   (सिर्फ़ एक ज़िला)
//
// बार-बार चलाना सुरक्षित है — जिनके निर्देशांक पहले से भरे हैं, उन्हें छूती भी नहीं।
// बीच में रुक जाए (Ctrl+C / नेटवर्क) तो दोबारा चलाने पर वहीं से आगे बढ़ती है।
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const API_KEY = process.env.LOCATIONIQ_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const districtArg = process.argv.find((a) => a.startsWith('--district='));
const ONLY_DISTRICT = districtArg ? districtArg.split('=').slice(1).join('=').replace(/^["']|["']$/g, '') : null;

// LocationIQ का free tier ~2 अनुरोध/सेकंड देता है। हम 1/सेकंड पर चलते हैं —
// थोड़ा धीमा, पर rate-limit से बैन होने का ख़तरा नहीं।
const DELAY_MS = 1100;

// उत्तर प्रदेश की भौगोलिक सीमा (थोड़ी ढील के साथ)।
// इससे बाहर का कोई भी नतीजा साफ़ तौर पर ग़लत है — जैसे किसी और राज्य/देश का
// वही नाम वाला स्थान। ऐसा होना आम है: "कोतवाली" नाम के थाने कई राज्यों में हैं।
const UP_BOUNDS = { minLat: 23.8, maxLat: 30.5, minLng: 77.0, maxLng: 84.7 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
// नतीजे की जांच — यहीं तय होता है कि निर्देशांक भरोसेमंद है या नहीं
// ------------------------------------------------------------
function verify(result, district) {
  if (!result || !result.lat || !result.lon) return { ok: false, why: 'कोई नतीजा नहीं' };

  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, why: 'निर्देशांक संख्या नहीं' };

  // बचाव 1 — UP की सीमा के भीतर होना चाहिए
  if (lat < UP_BOUNDS.minLat || lat > UP_BOUNDS.maxLat || lng < UP_BOUNDS.minLng || lng > UP_BOUNDS.maxLng) {
    return { ok: false, why: `UP की सीमा से बाहर (${lat.toFixed(3)}, ${lng.toFixed(3)})` };
  }

  // बचाव 2 — लौटे पते में वही ज़िला होना चाहिए।
  // यह सबसे अहम जांच है: "कोतवाली" जैसे नाम UP के 65 ज़िलों में हैं, इसलिए API
  // आसानी से किसी दूसरे ज़िले का कोतवाली लौटा सकती है। ज़िला मिलाए बिना यह
  // पकड़ में ही नहीं आता।
  const addr = String(result.display_name || '').toLowerCase();
  const distEn = String(result.address?.state_district || result.address?.county || '').toLowerCase();
  const d = String(district || '').toLowerCase();
  const districtMatches = addr.includes(d) || distEn.includes(d) || (d && addr.includes(d.split(' ')[0]));

  // बचाव 3 — नतीजा किस "प्रकार" का है।
  // पुलिस स्टेशन/इमारत मिले तो बहुत अच्छा; गाँव/कस्बा मिला तो वह सिर्फ़ इलाक़े का
  // केंद्र है, थाना नहीं — उसे "कम भरोसे" में डालते हैं।
  const cls = `${result.class || ''}/${result.type || ''}`.toLowerCase();
  const isPoliceLike = cls.includes('police') || cls.includes('building') || cls.includes('office');

  if (!districtMatches) return { ok: false, why: `ज़िला मेल नहीं खाया (मिला: ${distEn || addr.slice(0, 45)})` };

  return {
    ok: true,
    lat,
    lng,
    confidence: isPoliceLike ? 'high' : 'medium',
    matched: result.display_name,
  };
}

async function geocodeOne(station, district) {
  // सबसे विशिष्ट से सबसे सामान्य क्वेरी — पहला भरोसेमंद नतीजा ले लेते हैं
  const queries = [
    `${station} Police Station, ${district}, Uttar Pradesh, India`,
    `${station} Thana, ${district}, Uttar Pradesh, India`,
    `${station}, ${district}, Uttar Pradesh, India`,
  ];

  for (const q of queries) {
    const url =
      `https://us1.locationiq.com/v1/search?key=${API_KEY}` +
      `&q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=in&addressdetails=1`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 429) {
        console.log('   ⏳ rate-limit — 5 सेकंड रुककर दोबारा…');
        await sleep(5000);
        continue;
      }
      if (!res.ok) continue;

      const data = await res.json();
      const check = verify(Array.isArray(data) ? data[0] : data, district);
      if (check.ok) return check;
    } catch (e) {
      // इस क्वेरी में दिक़्क़त — अगली आज़माते हैं
    }
    await sleep(DELAY_MS);
  }
  return { ok: false, why: 'किसी भी क्वेरी से भरोसेमंद नतीजा नहीं मिला' };
}

async function run() {
  if (!API_KEY) {
    console.error('🔴 LOCATIONIQ_API_KEY .env में सेट नहीं है।');
    console.error('   मुफ़्त key यहाँ से लें: https://locationiq.com/register');
    process.exit(1);
  }

  const params = [];
  let where = 'WHERE (latitude IS NULL OR longitude IS NULL)';
  if (ONLY_DISTRICT) {
    params.push(ONLY_DISTRICT);
    where += ` AND TRIM(LOWER(district)) = TRIM(LOWER($${params.length}))`;
  }

  const rows = (await db.query(`SELECT id, district, station FROM police_stations ${where} ORDER BY district, station`, params)).rows;
  const done = (await db.query('SELECT count(*) AS c FROM police_stations WHERE latitude IS NOT NULL')).rows[0].c;

  console.log('─'.repeat(62));
  console.log(`  पहले से भरे हुए : ${done}`);
  console.log(`  अब भरने हैं     : ${rows.length}`);
  console.log(`  अनुमानित समय    : ~${Math.ceil((rows.length * DELAY_MS * 1.6) / 60000)} मिनट`);
  if (DRY_RUN) console.log('  ⚠️  DRY-RUN — डेटाबेस में कुछ नहीं लिखा जाएगा');
  console.log('─'.repeat(62));
  if (rows.length === 0) return console.log('कुछ करने को नहीं है।');

  let high = 0, medium = 0, failed = 0;
  const report = [['district', 'station', 'status', 'lat', 'lng', 'confidence', 'note']];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const prefix = `[${String(i + 1).padStart(4)}/${rows.length}] ${r.district} / ${r.station}`;
    const out = await geocodeOne(r.station, r.district);

    if (out.ok) {
      if (!DRY_RUN) {
        await db.query('UPDATE police_stations SET latitude = $1, longitude = $2 WHERE id = $3', [out.lat, out.lng, r.id]);
      }
      out.confidence === 'high' ? high++ : medium++;
      console.log(`${prefix} → ✅ ${out.lat.toFixed(5)}, ${out.lng.toFixed(5)} (${out.confidence})`);
      report.push([r.district, r.station, 'मिला', out.lat, out.lng, out.confidence, out.matched]);
    } else {
      failed++;
      console.log(`${prefix} → ⏭️  छोड़ा (${out.why})`);
      report.push([r.district, r.station, 'नहीं मिला', '', '', '', out.why]);
    }
    await sleep(DELAY_MS);
  }

  const csv = report.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const file = path.join(process.cwd(), `geocode-report-${Date.now()}.csv`);
  fs.writeFileSync(file, '\uFEFF' + csv, 'utf8'); // BOM — ताकि Excel में हिंदी सही दिखे

  console.log('─'.repeat(62));
  console.log(`  ✅ पक्के (थाना/इमारत मिली) : ${high}`);
  console.log(`  🟡 अनुमानित (इलाक़े का केंद्र): ${medium}`);
  console.log(`  ⏭️  छोड़े गए (NULL ही रहे)   : ${failed}`);
  console.log(`  📄 रिपोर्ट: ${file}`);
  console.log('─'.repeat(62));
  console.log('  जो छूट गए, उन्हें उन थानों के SHO ऐप से भर सकते हैं:');
  console.log('  "ज़िला व थाना" स्क्रीन → "मेरी लोकेशन इस्तेमाल करें"');
  console.log('  (थाने में खड़े होकर — यही सबसे सटीक तरीक़ा है)');
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('स्क्रिप्ट विफल:', e.message);
    process.exit(1);
  });
