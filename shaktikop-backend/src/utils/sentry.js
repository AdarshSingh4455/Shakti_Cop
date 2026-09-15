// ============================================================
// Crash/Error Reporting (Sentry) — बैकएंड
//
// 🐛 बग फ़िक्स: अब तक production में कोई भी केंद्रीकृत error-tracking नहीं था —
// सभी त्रुटियां सिर्फ़ console.error होती थीं, जो सर्वर पर ही रहकर खो जाती हैं।
// किसी हमले, टूटे हुए API, या SOS भेजने में विफलता जैसी गंभीर त्रुटि होने पर भी
// टीम को कभी तुरंत पता नहीं चलता था। मोबाइल ऐप में यह पहले से सही तरीक़े से बना
// हुआ था (देखें mobile/src/utils/sentry.js) — बैकएंड में यह पूरी तरह छूट गया था।
//
// चालू करने के लिए: sentry.io पर account बनाएं, एक Node.js project जोड़ें, मिला
// DSN यहां env variable SENTRY_DSN के रूप में सेट करें। DSN सेट न हो तो सब कुछ
// चुपचाप no-op रहता है — सर्वर बिना किसी बदलाव के सामान्य रूप से चलता रहता है।
// ============================================================

const DSN = process.env.SENTRY_DSN;
let Sentry = null;

function getSentry() {
  if (Sentry !== null) return Sentry;
  try {
    Sentry = require('@sentry/node');
  } catch (e) {
    Sentry = false; // पैकेज उपलब्ध न हो (जैसे अभी तक npm install न हुआ हो) — चुपचाप no-op
  }
  return Sentry;
}

function initSentry() {
  if (!DSN) return; // जान-बूझकर चुपचाप — dev/testing में यही सामान्य स्थिति होगी
  const S = getSentry();
  if (!S) return;
  try {
    S.init({
      dsn: DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1, // 10% requests का performance-trace — पूरा 100% अनावश्यक लागत बढ़ाता
      beforeSend(event) {
        // 🔒 सुरक्षा: गलती से request body में victim name/mobile/address जैसा
        // संवेदनशील डेटा हो, तो भी वह Sentry को कभी न भेजा जाए
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) delete event.request.headers.authorization;
        }
        return event;
      },
    });
  } catch (e) {
    // Sentry init खुद विफल हो तो भी सर्वर शुरू होना नहीं रुकना चाहिए
  }
}

function captureException(error, extra) {
  if (!DSN) return;
  const S = getSentry();
  if (!S) return;
  try {
    S.captureException(error, extra ? { extra } : undefined);
  } catch (e) {
    // ignore — रिपोर्टिंग खुद कभी असली अनुरोध को न रोके
  }
}

module.exports = { initSentry, captureException };
