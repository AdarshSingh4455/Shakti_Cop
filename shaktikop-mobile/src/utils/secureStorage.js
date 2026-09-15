import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';

// ============================================================
// 🔒 सुरक्षा सुधार — "envelope encryption" पैटर्न
//
// AsyncStorage (Android पर सादी SQLite फ़ाइल) में अभी तक ऑफ़लाइन-कतार (offline
// queue — इंटरनेट न होने पर डिवाइस पर रुकी हुई शिकायतें, जिनमें पीड़िता का नाम,
// विवरण, आवाज़-रिकॉर्डिंग तक हो सकती है) पूरी तरह बिना-एन्क्रिप्शन के रहती थी।
//
// SecureStore सुरक्षित तो है, पर बड़ी मात्रा के डेटा (कई शिकायतें, base64 आवाज़
// सहित) के लिए नहीं बना — इसलिए सीधे वहां रखना व्यावहारिक नहीं। इसकी जगह:
//   1. एक छोटी, यादृच्छिक (random) encryption key बनती है और SecureStore में
//      रहती है (जो हार्डवेयर-सुरक्षित Keychain/Keystore से एन्क्रिप्टेड है)
//   2. असली (potentially बड़ा) डेटा उसी key से AES एन्क्रिप्ट होकर AsyncStorage
//      में जाता है — यानी डिस्क पर सिर्फ़ अपठनीय (encrypted) टेक्स्ट दिखता है
//
// यहां crypto-js इस्तेमाल किया गया है (शुद्ध JavaScript — किसी native build/
// compilation की ज़रूरत नहीं, Expo Go में भी चलता है)।
// ============================================================

const ENCRYPTION_KEY_STORE_NAME = 'shaktikop_local_enc_key';
let cachedKey = null;

async function getOrCreateEncryptionKey() {
  if (cachedKey) return cachedKey;
  try {
    let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE_NAME);
    if (!key) {
      // 🐛 बग फ़िक्स (गंभीर): पहले यहाँ expo-crypto (native module) से random bytes
      // बनते थे — कुछ Android डिवाइस/इमुलेटर पर native crypto provider में गड़बड़
      // होने पर यह "Native crypto module could not be used to get secure random
      // number" त्रुटि के साथ विफल हो जाता, और चूंकि यह हर login के बाद session
      // सेव करते समय चलता है (देखें AppContext.js), पूरा login ही टूटा हुआ दिखता —
      // "लॉगिन असफल" जबकि असल में लॉगिन सफल हो चुका था। crypto-js अपने-आप में एक
      // शुद्ध JavaScript (pure-JS) random generator देता है — किसी native module
      // पर निर्भर नहीं, इसलिए यह विफलता अब हो ही नहीं सकती।
      key = CryptoJS.lib.WordArray.random(32).toString(); // 256-बिट key (hex स्ट्रिंग)
      await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE_NAME, key);
    }
    cachedKey = key;
    return key;
  } catch (e) {
    // अत्यंत दुर्लभ स्थिति — SecureStore उपलब्ध न हो। null लौटाकर caller
    // को सादे (unencrypted) तरीक़े पर वापस जाने देते हैं, ताकि ऐप पूरी तरह न रुके।
    return null;
  }
}

// किसी भी JS value (object/array/string) को एन्क्रिप्ट करके AsyncStorage में सेव करना
//
// 🔒 allowPlaintextFallback: डिफ़ॉल्ट true — encryption न हो पाए तो भी डेटा सेव हो
//    जाता है (बिना encryption)। session-cache जैसे मामलों में यही सही है, क्योंकि
//    वहाँ विकल्प यह है कि लॉगिन ही टूट जाए।
//
//    पर कुछ जगह यह ठीक नहीं: offline शिकायत-कतार में पीड़िता का नाम, मोबाइल, पता
//    और GPS होता है। घरेलू-हिंसा के मामलों में वही फ़ोन अक्सर आरोपी की पहुँच में
//    होता है — ऐसा डेटा चुपचाप बिना encryption के डिस्क पर लिख देना, सेव न होने से
//    ज़्यादा नुक़सानदेह है। इसलिए ऐसे caller यह false भेजकर मना कर सकते हैं।
export async function secureSetItem(key, value, { allowPlaintextFallback = true } = {}) {
  const encKey = await getOrCreateEncryptionKey();
  const json = JSON.stringify(value);
  if (!encKey) {
    if (!allowPlaintextFallback) {
      throw new Error('डिवाइस पर सुरक्षित भंडारण उपलब्ध नहीं — संवेदनशील डेटा बिना encryption के सेव नहीं किया गया');
    }
    // fallback — कम-से-कम डेटा तो सुरक्षित रहे, चाहे unencrypted
    await AsyncStorage.setItem(key, json);
    return;
  }
  // 🐛 बग फ़िक्स (गंभीर): पहले यहाँ कोई try/catch नहीं था — अगर किसी डिवाइस पर
  // native crypto module में कोई गड़बड़ हो (जैसे "Native crypto module could not
  // be used to get secure random number" — कुछ Android डिवाइस/इमुलेटर पर होता है),
  // तो यह त्रुटि login के पूरे flow को तोड़ देती और सीधे "लॉगिन असफल" Alert के रूप
  // में दिख जाती — जबकि असल में लॉगिन खुद सफल था, सिर्फ़ local session-cache सेव
  // करना विफल हुआ था। अब encryption विफल होने पर भी login रुकता नहीं — बस उस डिवाइस
  // पर session-data बिना encryption के सेव हो जाता है (unencrypted होना भी login
  // पूरी तरह टूटने से बेहतर है)।
  try {
    const encrypted = CryptoJS.AES.encrypt(json, encKey).toString();
    await AsyncStorage.setItem(key, encrypted);
  } catch (e) {
    if (!allowPlaintextFallback) throw e;
    await AsyncStorage.setItem(key, json);
  }
}

// एन्क्रिप्ट किया हुआ डेटा वापस पढ़ना और डिक्रिप्ट करना
export async function secureGetItem(key) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const encKey = await getOrCreateEncryptionKey();
  if (!encKey) {
    // हो सकता है यह पुराना unencrypted डेटा हो, या encryption उपलब्ध न हो
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  try {
    const bytes = CryptoJS.AES.decrypt(raw, encKey);
    const json = bytes.toString(CryptoJS.enc.Utf8);
    if (!json) throw new Error('empty');
    return JSON.parse(json);
  } catch (e) {
    // 🔄 पुराने ऐप-वर्ज़न से बचा हुआ unencrypted डेटा हो सकता है — एक बार सादे रूप
    // में पढ़ने की कोशिश करें ताकि माइग्रेशन के दौरान मौजूदा ऑफ़लाइन-कतार खो न जाए
    try {
      return JSON.parse(raw);
    } catch (e2) {
      return null;
    }
  }
}

export async function secureRemoveItem(key) {
  await AsyncStorage.removeItem(key);
}
