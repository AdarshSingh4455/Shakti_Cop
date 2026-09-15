// ============================================================
// Crash Reporting (Sentry)
//
// पहले production में कोई भी crash/error monitoring नहीं था — कोई त्रुटि किसी
// उपयोगकर्ता के फ़ोन पर आए, तो हमें कभी पता ही न चलता जब तक वह खुद रिपोर्ट न करे।
//
// 🔒 दो तरह से सुरक्षित रखा गया है:
//   1. अगर SENTRY_DSN सेट नहीं है, init() चुपचाप कुछ नहीं करता।
//   2. @sentry/react-native एक native module है — Expo Go (जो custom native
//      module सपोर्ट नहीं करता) में इसे साधारण "import" से लोड करने की कोशिश
//      करने पर पूरा ऐप ही क्रैश हो सकता था। इसलिए यहां static import की बजाय
//      require() अंदर try/catch में इस्तेमाल किया गया है — सिर्फ़ यही तरीक़ा है
//      जिससे "module resolve नहीं हुआ" जैसी त्रुटि को पकड़ा जा सकता है (static
//      import को try/catch में पकड़ना संभव ही नहीं, वह कोड चलने से पहले ही होता है)।
//
// चालू करने के लिए:
//   1. sentry.io पर मुफ़्त account बनाएं, एक React Native project जोड़ें
//   2. मिला हुआ DSN यहां env variable के रूप में सेट करें: EXPO_PUBLIC_SENTRY_DSN
//   3. custom dev client / EAS build बनाएं (Expo Go में crash-reporting काम नहीं
//      करेगी — native module है, पर ऐप बाक़ी सब सामान्य रूप से चलती रहेगी)
// ============================================================

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let Sentry = null;
function getSentry() {
  if (Sentry !== null) return Sentry;
  try {
    Sentry = require('@sentry/react-native');
  } catch (e) {
    Sentry = false; // module उपलब्ध नहीं (जैसे Expo Go) — आगे सब चुपचाप no-op रहेगा
  }
  return Sentry;
}

export function initSentry() {
  if (!DSN) {
    // DSN सेट नहीं है — जान-बूझकर चुपचाप कुछ नहीं करते (dev/testing में यही होगा)
    return;
  }
  const S = getSentry();
  if (!S) return;
  try {
    S.init({
      dsn: DSN,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0.2, // 20% requests का performance-trace — पूरा 100% अनावश्यक डेटा/लागत बढ़ाता
      beforeSend(event) {
        // 🔒 सुरक्षा: कहीं भी गलती से request body/params में संवेदनशील डेटा
        // (जैसे victim name/mobile) चला जाए तो भी उसे रिपोर्ट से हटा दें
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
        }
        return event;
      },
    });
  } catch (e) {
    // Sentry init खुद भी विफल हो सकता है — यह कभी भी असली ऐप को रोकना नहीं चाहिए
  }
}

// त्रुटि को मैन्युअल रूप से रिपोर्ट करना (जैसे ErrorBoundary से)
export function reportError(error, extra) {
  if (!DSN) return;
  const S = getSentry();
  if (!S) return;
  try {
    S.captureException(error, extra ? { extra } : undefined);
  } catch (e) {
    // ignore
  }
}
