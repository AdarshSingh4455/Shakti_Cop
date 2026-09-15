// ============================================================
// आम फ़ील्ड validation — पूरे ऐप में नाम/मोबाइल/ईमेल फ़ील्ड के लिए एक ही जगह से।
//
// इस्तेमाल:
//   import { validateName, validateMobile, validateEmail } from '../utils/validators';
//   const err = validateMobile(mobile);
//   if (err) { Alert.alert('अमान्य मोबाइल नंबर', err); return; }
//
// हर फ़ॉर्म के submit से पहले संबंधित फ़ील्ड की जाँच कर लें — ग़लत data
// (जैसे नाम में नंबर, या 10 अंकों से ज़्यादा/कम का मोबाइल) आगे backend तक
// जाने से पहले ही रुक जाएगा और साफ़ चेतावनी दिखेगी।
// ============================================================

// नाम — सिर्फ़ अक्षर (हिंदी/अंग्रेज़ी), स्पेस, डॉट, अपोस्ट्रॉफ़ी, हाइफ़न — कोई अंक नहीं
export const NAME_REGEX = /^[A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F.'\- ]{1,79}$/;
// मोबाइल — भारतीय नंबर, ठीक 10 अंक, 6-9 से शुरू
export const MOBILE_REGEX = /^[6-9]\d{9}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// नाम — खाली/अंकों वाला/बहुत छोटा नाम रोकने के लिए। लौटाता है error string या null (ठीक होने पर)।
export function validateName(name, { required = true } = {}) {
  const v = (name || '').trim();
  if (!v) return required ? 'नाम आवश्यक है' : null;
  if (/\d/.test(v)) return 'नाम में अंक (नंबर) नहीं हो सकते';
  if (v.length < 2) return 'नाम बहुत छोटा है';
  if (!NAME_REGEX.test(v)) return 'कृपया एक मान्य नाम दर्ज करें (सिर्फ़ अक्षर व स्पेस)';
  return null;
}

// मोबाइल — ठीक 10 अंक, सिर्फ़ अंक, वैध भारतीय नंबर। लौटाता है error string या null।
export function validateMobile(mobile, { required = true } = {}) {
  const v = (mobile || '').trim();
  if (!v) return required ? 'मोबाइल नंबर आवश्यक है' : null;
  if (!/^\d+$/.test(v)) return 'मोबाइल नंबर में सिर्फ़ अंक होने चाहिए';
  if (v.length !== 10) return 'मोबाइल नंबर ठीक 10 अंकों का होना चाहिए';
  if (!MOBILE_REGEX.test(v)) return 'कृपया एक मान्य मोबाइल नंबर दर्ज करें (6-9 से शुरू)';
  return null;
}

// ईमेल — मान्य फ़ॉर्मैट। लौटाता है error string या null।
export function validateEmail(email, { required = true } = {}) {
  const v = (email || '').trim();
  if (!v) return required ? 'ईमेल आईडी आवश्यक है' : null;
  if (!EMAIL_REGEX.test(v)) return 'कृपया एक मान्य ईमेल आईडी दर्ज करें';
  return null;
}

// टाइप करते समय ही रोकना हो (जैसे नाम फ़ील्ड में अंक न टाइप होने दें):
// onChangeText={(t) => setName(sanitizeNameInput(t))}
export function sanitizeNameInput(text) {
  return (text || '').replace(/[0-9]/g, '');
}

// मोबाइल फ़ील्ड में सिर्फ़ अंक और ज़्यादा से ज़्यादा 10 अंक टाइप होने दें:
// onChangeText={(t) => setMobile(sanitizeMobileInput(t))}
export function sanitizeMobileInput(text) {
  return (text || '').replace(/[^0-9]/g, '').slice(0, 10);
}

// एक साथ कई फ़ील्ड चेक करनी हों तो — पहली मिली त्रुटि लौटा देता है, वरना null।
// validateFields([[value1, validateName, 'नाम'], [value2, validateMobile, 'मोबाइल']])
export function firstValidationError(checks) {
  for (const [value, validator, opts] of checks) {
    const err = validator(value, opts);
    if (err) return err;
  }
  return null;
}
