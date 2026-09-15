// ============================================================
// Rate-limit store — एक से ज़्यादा instance (load balancer) के लिए
//
// समस्या:
// express-rate-limit डिफ़ॉल्ट रूप से गिनती हर instance की अपनी मेमोरी में रखता
// है। load balancer के पीछे 3 instance चल रहे हों, तो "10 बार लॉगिन कोशिश" वाली
// सीमा असल में 30 हो जाती है — क्योंकि हर instance अपनी अलग गिनती रखता है, और
// हमलावर की कोशिशें अलग-अलग instance पर बंट जाती हैं। यानी brute-force सुरक्षा
// instance की संख्या के अनुपात में कमज़ोर हो जाती है।
//
// हल: सभी instance एक ही साझा गिनती (Redis) इस्तेमाल करें।
//
// ⚠️ यह पूरी तरह वैकल्पिक है — REDIS_URL सेट न हो तो पहले जैसा ही (in-memory)
//    व्यवहार रहता है। इसलिए अभी चल रही single-instance तैनाती में कुछ नहीं बदलता,
//    और एक से ज़्यादा instance पर जाते समय सिर्फ़ REDIS_URL सेट करना होता है।
// ============================================================

let cachedStore;
let cachedClient;

// 🆕 वही Redis कनेक्शन दूसरी जगहों (जैसे OTP असफल-कोशिश गिनती) को भी चाहिए —
// हर बार नया कनेक्शन खोलना फ़िज़ूल है, इसलिए यहीं एक साझा client रखा जाता है।
// REDIS_URL न हो तो null लौटता है और बुलाने वाला in-memory पर चलता रहता है।
function getRedisClient() {
  if (cachedClient !== undefined) return cachedClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    cachedClient = null;
    return cachedClient;
  }
  try {
    const Redis = require('ioredis');
    cachedClient = new Redis(url);
    cachedClient.on('error', (e) => console.error('Redis त्रुटि:', e.message));
  } catch (e) {
    console.error('⚠️ Redis कनेक्शन नहीं बना:', e.message);
    cachedClient = null;
  }
  return cachedClient;
}

function getRateLimitStore() {
  if (cachedStore !== undefined) return cachedStore;

  const url = process.env.REDIS_URL;
  if (!url) {
    cachedStore = undefined; // डिफ़ॉल्ट in-memory store
    return cachedStore;
  }

  try {
    const RedisStore = require('rate-limit-redis').default || require('rate-limit-redis');
    const client = getRedisClient();
    if (!client) throw new Error('Redis client उपलब्ध नहीं');
    cachedStore = new RedisStore({ sendCommand: (...args) => client.call(...args) });
    console.log('🔗 Rate-limit गिनती साझा (Redis) store में — multi-instance सुरक्षित');
  } catch (e) {
    // पैकेज उपलब्ध न हो या कनेक्शन न बने — चुपचाप in-memory पर वापस, ऐप न रुके
    console.error('⚠️ Redis rate-limit store नहीं बन सका, in-memory पर वापस:', e.message);
    cachedStore = undefined;
  }
  return cachedStore;
}

module.exports = { getRateLimitStore, getRedisClient };
