// ============================================================
// नज़दीकी थाना/अस्पताल खोज — क्रम से आज़माए जाते हैं:
//
//   0. अपनी verified list (police_stations table, जिन थानों के lat/lng
//      Super Admin ने खुद सेट किए हों) — सबसे भरोसेमंद, कोई तीसरे-पक्ष पर
//      निर्भरता नहीं (सिर्फ़ police के लिए; अस्पताल इस table में नहीं होते)
//   1. LocationIQ  — key सेट हो तो (programmatic इस्तेमाल के लिए बना,
//                    सबसे भरोसेमंद; my.locationiq.com से मुफ़्त key)
//   2. Overpass    — OpenStreetMap का अपना मुफ़्त API, कोई key नहीं चाहिए।
//                    ⚠️ यह bulk-query के लिए बना है और Railway जैसे datacenter IPs
//                    को कभी-कभी block/धीमा कर देता है — इसीलिए इसे fallback रखा है,
//                    प्राथमिक नहीं। दो mirror आज़माए जाते हैं।
//
// दोनों बाहरी विफल हों तो भी SOS काम करता रहता है — क्योंकि अधिकारी को सूचना भेजने का
// मुख्य आधार शिकायत में चुना गया ज़िला/थाना है (नीचे complaintController में),
// जो किसी बाहरी सेवा पर निर्भर नहीं है।
// ============================================================

const db = require('../config/db');

const LOCATIONIQ_API_KEY = process.env.LOCATIONIQ_API_KEY;
const LOCATIONIQ_URL = 'https://us1.locationiq.com/v1/nearby';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// दो बिंदुओं के बीच की दूरी (किमी) — Haversine
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Number((2 * R * Math.asin(Math.sqrt(a))).toFixed(2));
}

// 🆕 अपनी geo-tagged verified list में से नज़दीकी थाने खोजें — Super Admin ने
// जिन थानों के coordinates खुद सेट किए हों, सिर्फ़ वही यहां मिलेंगे।
async function fetchInternalPoliceStations(lat, lng, radiusKm) {
  try {
    const result = await db.query(
      `SELECT district, station, latitude, longitude FROM police_stations
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
    );
    return result.rows
      .map((r) => ({
        name: r.station,
        address: r.district,
        latitude: r.latitude,
        longitude: r.longitude,
        rating: null,
        openNow: null,
        verified: true, // अपनी list से — भरोसेमंद
        distanceKm: distanceKm(lat, lng, r.latitude, r.longitude),
      }))
      .filter((p) => p.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 20);
  } catch (e) {
    console.error('अपनी list से थाना खोजने में त्रुटि:', e.message);
    return [];
  }
}

// ---- Overpass से खोज (कोई key नहीं चाहिए) ----
async function fetchFromOverpass(lat, lng, amenity, radius) {
  const r = Math.min(Number(radius) || 5000, 30000);
  // node + way दोनों — कई थाने OSM में इमारत (way) के रूप में दर्ज हैं
  const query = `[out:json][timeout:12];
(
  node["amenity"="${amenity}"](around:${r},${lat},${lng});
  way["amenity"="${amenity}"](around:${r},${lat},${lng});
);
out center tags;`;

  let lastErr = null;
  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Overpass की नीति — पहचान देना ज़रूरी है, वरना ब्लॉक की आशंका बढ़ती है
          'User-Agent': 'ShaktiCop/1.0 (UP Police Mission Shakti)',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Overpass → HTTP ${res.status}`);
      const data = await res.json();

      return (data.elements || [])
        .map((el) => {
          const la = el.lat ?? el.center?.lat;
          const lo = el.lon ?? el.center?.lon;
          if (la == null || lo == null) return null;
          const t = el.tags || {};
          const addr = [t['addr:housenumber'], t['addr:street'], t['addr:city'] || t['addr:suburb']]
            .filter(Boolean)
            .join(', ');
          return {
            name: t.name || t['name:en'] || t['name:hi'] || (amenity === 'hospital' ? 'अस्पताल' : 'थाना'),
            address: addr || t['addr:full'] || 'पता उपलब्ध नहीं',
            latitude: Number(la),
            longitude: Number(lo),
            rating: null,
            openNow: null,
            distanceKm: distanceKm(Number(lat), Number(lng), Number(la), Number(lo)),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 20);
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      // अगला mirror आज़माएं
    }
  }
  throw lastErr || new Error('Overpass से जवाब नहीं मिला');
}

// साझा फ़ंक्शन — HTTP endpoint और SOS दोनों इस्तेमाल करते हैं
async function fetchExternalNearbyPlaces(lat, lng, amenity, radius) {
  // key न हो तो सीधे Overpass — पहले यह त्रुटि फेंक देता था और सुविधा बंद हो जाती थी
  if (!LOCATIONIQ_API_KEY) return fetchFromOverpass(lat, lng, amenity, radius);
  const r = Math.min(Number(radius) || 5000, 30000);
  const url = `${LOCATIONIQ_URL}?key=${LOCATIONIQ_API_KEY}&lat=${lat}&lon=${lng}&tag=amenity:${amenity}&radius=${r}&format=json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeoutId);

  if (!response.ok) {
    if (response.status === 404) return [];
    // LocationIQ की सीमा ख़त्म या key ग़लत — Overpass से कोशिश करें
    console.error(`LocationIQ → HTTP ${response.status}, Overpass से कोशिश कर रहे हैं`);
    return fetchFromOverpass(lat, lng, amenity, radius);
  }
  const data = await response.json();
  const list = Array.isArray(data) ? data : [];

  return list
    .map((place) => {
      const addr = place.address || {};
      const addressParts = [addr.house_number, addr.road, addr.city || addr.suburb || addr.town].filter(Boolean);
      return {
        name: place.name || addr.name || (amenity === 'hospital' ? 'अस्पताल' : 'थाना'),
        address: addressParts.length ? addressParts.join(', ') : (place.display_name || 'पता उपलब्ध नहीं'),
        latitude: Number(place.lat),
        longitude: Number(place.lon),
        rating: null,
        openNow: null,
        distanceKm: place.distance != null ? Number((place.distance / 1000).toFixed(2)) : null,
      };
    })
    .filter((p) => !Number.isNaN(p.latitude) && !Number.isNaN(p.longitude))
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
    .slice(0, 20);
}

// 🆕 सबसे ऊपर वाला लेयर — police के लिए पहले अपनी verified geo-tagged list देखते हैं,
// सिर्फ़ वहां कुछ न मिले (उस radius में कोई थाना geo-tag न हुआ हो) तो बाहरी स्रोत।
// अस्पताल के लिए हमारे पास अपनी list नहीं है, इसलिए हमेशा बाहरी स्रोत से।
async function fetchNearbyPlaces(lat, lng, amenity, radius) {
  if (amenity === 'police') {
    const radiusKm = Math.min(Number(radius) || 5000, 30000) / 1000;
    const internal = await fetchInternalPoliceStations(lat, lng, radiusKm);
    if (internal.length > 0) return internal;
  }
  return fetchExternalNearbyPlaces(lat, lng, amenity, radius);
}

// SOS के लिए — सिर्फ़ सबसे नज़दीकी थाना (अगर कुछ न मिले तो null)
async function findNearestPoliceStation(lat, lng) {
  try {
    const results = await fetchNearbyPlaces(lat, lng, 'police', 10000);
    return results[0] || null;
  } catch (e) {
    console.error('findNearestPoliceStation error:', e.message);
    return null;
  }
}

// GET /nearby?lat=&lng=&type=police|hospital&radius=5000   (कोई लॉगिन आवश्यक नहीं)
async function getNearby(req, res) {
  const { lat, lng, type, radius } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat और lng आवश्यक हैं' });
  }
  // 🔒 सुरक्षा: यह endpoint बिना लॉगिन के कोई भी बुला सकता है, और lat/lng/radius
  // पहले सिर्फ़ "मौजूद हैं या नहीं" जांचे जाते थे — फिर सीधे Overpass query string
  // और LocationIQ URL में जोड़ दिए जाते थे। कोई भी अजनबी टेक्स्ट (सिर्फ़ अंक नहीं) भेजकर
  // Overpass की query में मनमाना syntax इंजेक्ट कर सकता था — इससे हमारे सर्वर के ज़रिए
  // Overpass पर दुरुपयोग/भारी queries भेजी जा सकती थीं (ShaktiCop की पहचान पर बैन का ख़तरा),
  // और LocationIQ को भेजे जाने वाले URL में भी मनमाना डेटा जुड़ सकता था। अब lat/lng/radius
  // को पहले असली, सीमा के भीतर की संख्या के रूप में सत्यापित करते हैं।
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    return res.status(400).json({ error: 'lat अमान्य है' });
  }
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
    return res.status(400).json({ error: 'lng अमान्य है' });
  }
  let radiusNum = Number(radius);
  if (!Number.isFinite(radiusNum) || radiusNum <= 0) radiusNum = 5000;
  radiusNum = Math.min(radiusNum, 30000);

  const amenity = type === 'hospital' ? 'hospital' : 'police';

  try {
    const results = await fetchNearbyPlaces(latNum, lngNum, amenity, radiusNum);
    res.json({ type: amenity, results });
  } catch (err) {
    console.error('LocationIQ error:', err.message);
    res.status(502).json({ error: 'नज़दीकी स्थान लोड नहीं हो सके — कृपया थोड़ी देर बाद कोशिश करें।' });
  }
}

module.exports = { getNearby, findNearestPoliceStation, distanceKm };
