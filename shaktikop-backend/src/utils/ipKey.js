// ============================================================
// rate-limit की key के लिए IP को सामान्य (normalize) करना
//
// क्यों ज़रूरी है:
// IPv6 में एक ही उपयोगकर्ता को आम तौर पर पूरा /64 ब्लॉक मिलता है — यानी वह हर
// कोशिश पर अलग IPv6 पता इस्तेमाल करके लॉगिन/OTP की सीमा पूरी तरह बायपास कर सकता
// है। इसलिए पूरे /64 को एक ही key मानना ज़रूरी है।
//
// 🐛 बग फ़िक्स: पहले यह काम express-rate-limit के ipKeyGenerator से लिया जा रहा था,
//    पर वह export उस library के नए संस्करणों (v7.5+) में ही आया है। project में
//    ^7.2.0 लगी है, इसलिए production में वह undefined निकला और हर लॉगिन/OTP अनुरोध
//    "TypeError: ipKeyGenerator is not a function" के साथ 500 देने लगा — यानी कोई
//    लॉगिन ही नहीं कर पा रहा था। अब यह काम यहीं होता है, किसी library-संस्करण पर
//    निर्भर हुए बिना।
// ============================================================

function normalizeIpForRateLimit(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return 'unknown';

  // "::ffff:1.2.3.4" जैसे IPv4-mapped पतों से असली IPv4 निकाल लें
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];

  // IPv4 — जस का तस
  if (/^\d+\.\d+\.\d+\.\d+$/.test(raw)) return raw;

  // IPv6 — सिर्फ़ पहले 4 समूह (यानी /64) रखें, ताकि एक ही ब्लॉक के सारे पते
  // एक ही key बनें
  if (raw.includes(':')) {
    const clean = raw.split('%')[0].toLowerCase(); // zone-id (जैसे %eth0) हटाएं
    if (clean.includes('::')) {
      // संक्षिप्त रूप — पूरा फैलाकर पहले 4 समूह लें
      const [head, tail] = clean.split('::');
      const h = head ? head.split(':') : [];
      const t = tail ? tail.split(':') : [];
      const fill = new Array(Math.max(0, 8 - h.length - t.length)).fill('0');
      return [...h, ...fill, ...t].slice(0, 4).join(':');
    }
    return clean.split(':').slice(0, 4).join(':');
  }

  return raw;
}

module.exports = { normalizeIpForRateLimit };
