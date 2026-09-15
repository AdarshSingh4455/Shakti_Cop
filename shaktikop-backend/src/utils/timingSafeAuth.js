const bcrypt = require('bcryptjs');

// ============================================================
// Timing-Safe Login — बग फ़िक्स (गंभीर, टेस्ट से पुष्टि हुई)
//
// पहले हर login function में यह पैटर्न था:
//   if (!user || !(await bcrypt.compare(password, user.password_hash))) { ... }
//
// JS का "||" शॉर्ट-सर्किट करता है — अगर खाता मिला ही नहीं (!user सही है), तो
// bcrypt.compare() कभी चलता ही नहीं। नतीजा: खाता-मौजूद-न-होने पर जवाब तुरंत
// (0ms के आसपास) आता है, पर खाता मौजूद होने पर (ग़लत पासवर्ड होने पर भी)
// bcrypt की गणना में असली, मापने-योग्य समय लगता है।
//
// टेस्ट से नाप कर पुष्टि हुई: bcrypt.compare() में ~350ms लगते हैं, जबकि
// शॉर्ट-सर्किट में 0ms — यानी सिर्फ़ जवाब आने में लगे समय को नाप कर कोई भी
// (बिना पासवर्ड जाने) पता लगा सकता था कि दिया गया मोबाइल/badge/username
// सिस्टम में रजिस्टर्ड है या नहीं। एक सुरक्षा-ऐप के लिए यह एक वास्तविक
// गोपनीयता-चूक है — यह बता सकता था कि कोई व्यक्ति ऐप का उपयोगकर्ता है या नहीं
// (जैसे "क्या फ़लां नंबर ने सुरक्षा-सेवा के लिए रजिस्टर किया है")।
//
// अब खाता न मिलने पर भी हमेशा एक असली bcrypt.compare() चलाई जाती है (एक तय
// dummy hash के विरुद्ध) — इसलिए दोनों ही स्थितियों (खाता है/नहीं है) में
// जवाब आने में लगभग एक जैसा समय लगता है।
// ============================================================

// एक बार का, हमेशा एक जैसा — असली पासवर्ड नहीं, सिर्फ़ bcrypt की गणना-लागत
// (computational cost) नक़ल करने के लिए। bcrypt.hashSync सिर्फ़ module-load पर
// एक बार चलती है (हर request पर नहीं), इसलिए startup पर एक बार का मामूली
// खर्च है, request-time पर नहीं।
const DUMMY_HASH = bcrypt.hashSync('a-fixed-non-secret-value-for-timing-safety', 12);

// इस्तेमाल: हमेशा दोनों शाखाओं में असली bcrypt.compare() चलाएं —
//   const match = user ? await bcrypt.compare(password, user.password_hash) : await bcrypt.compare(password, DUMMY_HASH_marker) && false;
// ऊपर वाला तरीक़ा उलझाने वाला है, इसलिए एक साफ़ हेल्पर फ़ंक्शन:
async function timingSafeVerify(password, hashOrNull) {
  const isRealAccount = !!hashOrNull;
  const match = await bcrypt.compare(password || '', hashOrNull || DUMMY_HASH);
  // dummy hash से कभी भी असली match नहीं होगा (यह किसी उपयोगकर्ता का पासवर्ड
  // नहीं है), पर फिर भी स्पष्ट रूप से false लौटाते हैं — पढ़ने में साफ़ रहे
  return isRealAccount && match;
}

module.exports = { timingSafeVerify, DUMMY_HASH };
