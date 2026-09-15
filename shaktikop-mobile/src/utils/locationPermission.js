import * as Location from 'expo-location';

// ============================================================
// पूरे app में हर जगह सीधे Location.requestForegroundPermissionsAsync()
// बुलाने की बजाय यह इस्तेमाल करें।
//
// 🐛 बग फ़िक्स: पहले हर जगह (SOS, शिकायत फ़ॉर्म, नज़दीकी सहायता) एक ही function
// इस्तेमाल होता था जो ज़रूरत पड़ने पर हमेशा popup दिखा देता — अगर उपयोगकर्ता ने
// शुरुआत में अनुमति नहीं दी (बिना "फिर मत पूछो" चुने), तो हर बार किसी भी feature
// इस्तेमाल करने पर फिर से popup आ जाता ("बार-बार पूछा जा रहा है" वाली शिकायत)।
//
// अब दो अलग functions हैं:
// - requestLocationPermissionOnce() — सिर्फ़ app खुलते ही एक बार इस्तेमाल होता है,
//   यही असली popup दिखा सकता है
// - ensureLocationPermission() — बाक़ी हर जगह इस्तेमाल होता है, सिर्फ़ मौजूदा
//   स्थिति चुपचाप जांचता है, कभी दोबारा popup नहीं दिखाता
//
// ⚠️ अगर उपयोगकर्ता ने Android के "Only this time" (सिर्फ़ इस बार) विकल्प
// चुना है, तो Android खुद अनुमति वापस ले लेता है — ऐसे में अगली बार app खोलने पर
// फिर से पूछा जाना सामान्य व्यवहार है, यह app का bug नहीं। "While using the app"
// चुनने पर यह दोबारा नहीं पूछेगा।
// ============================================================

// सिर्फ़ app शुरू होते ही (AppContext.js की startup useEffect में) इस्तेमाल करें
export async function requestLocationPermissionOnce() {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return current;
  return Location.requestForegroundPermissionsAsync();
}

// यही असली function है जो बाक़ी पूरे app (SOS, शिकायत फ़ॉर्म, नज़दीकी सहायता आदि) में
// इस्तेमाल होना चाहिए — कभी popup नहीं दिखाता, सिर्फ़ मौजूदा स्थिति लौटाता है
export async function ensureLocationPermission() {
  return Location.getForegroundPermissionsAsync();
}

// ============================================================
// 🆕 समय-सीमा वाला लोकेशन-fix (सुरक्षा-गंभीर)
//
// 🐛 समस्या: expo-location के getCurrentPositionAsync() में कोई timeout विकल्प है
// ही नहीं — GPS fix न मिलने पर यह देर तक, कभी-कभी अनिश्चित काल तक अटका रह सकता है।
// और यह ठीक उन्हीं हालात में सबसे ज़्यादा होता है जो असली आपात स्थिति में सबसे आम
// हैं: इमारत के अंदर, तहख़ाने में, या कमज़ोर सिग्नल में। पूरे ऐप में 9 जगह यह बिना
// किसी समय-सीमा के await किया जा रहा था — यानी SOS भेजने वाली लाइन तब तक चलती ही
// नहीं जब तक GPS जवाब न दे। सबसे ज़रूरी पल में SOS अटक जाता।
//
// ✅ हल: तय समय तक ही इंतज़ार करें। उतने में fix न मिले तो फ़ोन के पास पहले से मौजूद
// (cached) आख़िरी लोकेशन ले लें — वह तुरंत मिलती है। वह भी न मिले तो null लौटा दें,
// ताकि बुलाने वाला बिना निर्देशांक के भी आगे बढ़ सके (SOS कभी न रुके)।
// ============================================================
export async function getPositionWithTimeout({ timeoutMs = 5000, accuracy = Location.Accuracy.Highest } = {}) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy }),
      timeout,
    ]);
    if (pos) return pos;
  } catch (e) {
    // नीचे cached लोकेशन आज़माएंगे
  }
  try {
    // समय-सीमा पार — फ़ोन के पास पहले से मौजूद लोकेशन (तुरंत मिलती है)।
    // यहां maxAge/requiredAccuracy नहीं लगाते: आपात स्थिति में थोड़ी पुरानी या कम
    // सटीक लोकेशन भी, बिलकुल कोई लोकेशन न होने से कहीं बेहतर है।
    return await Location.getLastKnownPositionAsync();
  } catch (e) {
    return null;
  }
}
