// ============================================================
// OTP सत्यापन (verification) की सुरक्षा
//
// अभी क्या था:
//   verify endpoints पर loginLimiter (IP+पहचान, 10/15मिनट) और accountLockLimiter
//   (सिर्फ़ पहचान, 20/30मिनट) लगे हैं — यानी दर-सीमा पहले से थी।
//
// क्या नहीं था:
//   1. purpose अलग नहीं होता — "लॉगिन" की असफल कोशिशें "पासवर्ड रीसेट" का कोटा भी
//      खा जाती थीं। एक ही पीड़िता, जो लॉगिन में उलझने के बाद पासवर्ड रीसेट करना
//      चाहे, उसे पहले ही ब्लॉक मिल सकता था।
//   2. असफल कोशिशों की कोई गिनती नहीं थी — सिर्फ़ "सीमा पार हुई या नहीं"। इसलिए
//      "3 बार ग़लत" और "19 बार ग़लत" में कोई फ़र्क़ ही नहीं था।
//   3. सफल सत्यापन पर गिनती रीसेट नहीं होती थी — असली उपयोगकर्ता जो 2 बार ग़लत
//      टाइप करके तीसरी बार सही डाले, उसके नाम 2 असफल कोशिशें अगले 30 मिनट तक
//      जुड़ी रहतीं।
//   4. बार-बार असफलता पर कोई audit घटना दर्ज नहीं होती थी — यानी किसी खाते पर हमला
//      हो रहा हो तो वह लॉग में कहीं दिखता ही नहीं।
//
// यह फ़ाइल वही चार कमियाँ पूरी करती है। मौजूदा limiters हटाए नहीं गए हैं — यह उनके
// ऊपर एक और परत है (defence in depth)।
//
// 🆕 भंडारण: REDIS_URL सेट हो तो गिनती Redis में (सभी instance के बीच साझा), वरना
//    in-memory। पहले यह सिर्फ़ in-memory थी — यानी 3 instance पर असल सीमा 3-गुना
//    ढीली हो जाती, क्योंकि हमलावर की कोशिशें अलग-अलग instance पर बंट जातीं और हर
//    instance अपनी अलग गिनती रखता। राज्य-स्तर पर कई instance चलाना ज़रूरी है, इसलिए
//    अब यह परत भी साझा है (वही Redis कनेक्शन जो rate-limit पहले से इस्तेमाल करता है)।
// ============================================================

const { logActivity, maskIdentity } = require('./activityLog');
const { getRedisClient } = require('./rateLimitStore');

const WINDOW_MS = 30 * 60 * 1000; // गिनती इतनी देर याद रखी जाती है
const MAX_FAILED = 5; // इतनी असफल कोशिशों के बाद अस्थायी रोक
const ALERT_AT = 3; // इतनी असफलताओं पर audit-चेतावनी दर्ज होती है

// key → { failed, firstFailedAt, lockedUntil, alerted }
const attempts = new Map(); // Redis न हो तो यही इस्तेमाल होता है

const REDIS_PREFIX = 'otpattempt:';

async function readRec(key) {
  const client = getRedisClient();
  if (!client) return attempts.get(key) || null;
  try {
    const raw = await client.get(REDIS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    // Redis गड़बड़ हो तो in-memory पर वापस — सुरक्षा-परत पूरी तरह न टूटे
    return attempts.get(key) || null;
  }
}

async function writeRec(key, rec) {
  attempts.set(key, rec); // हमेशा — Redis गिरने पर भी कुछ तो बचे
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.set(REDIS_PREFIX + key, JSON.stringify(rec), 'PX', WINDOW_MS);
  } catch (e) {
    // चुपचाप छोड़ें — ऊपर in-memory में लिख चुके हैं
  }
}

async function deleteRec(key) {
  attempts.delete(key);
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.del(REDIS_PREFIX + key);
  } catch (e) {
    // चुपचाप छोड़ें
  }
}

// पुरानी entries अपने-आप हटती रहें, वरना यह Map धीरे-धीरे बढ़ता ही जाएगा
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) {
    if (now - v.firstFailedAt > WINDOW_MS && (!v.lockedUntil || now > v.lockedUntil)) {
      attempts.delete(k);
    }
  }
}, 10 * 60 * 1000).unref();

const norm = (s) => String(s || '').trim().toLowerCase();

// पहचान + purpose — यही वह अलगाव है जो पहले नहीं था
function identityKey(req, purpose) {
  const id = req.body?.mobile || req.body?.identifier || req.body?.badgeId || req.body?.username || '';
  return `${norm(id)}|${purpose}`;
}

// बढ़ता हुआ इंतज़ार: 5वीं असफलता पर 1 मिनट, 6वीं पर 2, 7वीं पर 4… अधिकतम 30 मिनट।
// एक-एक करके अनुमान लगाना असंभव-सा महँगा हो जाता है, पर असली उपयोगकर्ता (जो 1-2 बार
// ग़लत टाइप करता है) को कोई रुकावट महसूस ही नहीं होती।
function backoffMs(failed) {
  const steps = Math.max(0, failed - MAX_FAILED);
  return Math.min(60_000 * 2 ** steps, 30 * 60 * 1000);
}

async function checkOtpAttempts(req, purpose) {
  const key = identityKey(req, purpose);
  const rec = await readRec(key);
  if (!rec) return { ok: true };

  const now = Date.now();
  if (rec.lockedUntil && now < rec.lockedUntil) {
    const secs = Math.ceil((rec.lockedUntil - now) / 1000);
    const mins = Math.ceil(secs / 60);
    return {
      ok: false,
      retryAfterSec: secs,
      error: `बहुत ज़्यादा ग़लत OTP कोशिशें — कृपया ${mins} मिनट बाद दोबारा कोशिश करें`,
    };
  }
  return { ok: true };
}

async function recordOtpFailure(req, purpose) {
  const key = identityKey(req, purpose);
  const now = Date.now();
  const rec = (await readRec(key)) || { failed: 0, firstFailedAt: now, lockedUntil: 0, alerted: false };

  // खिड़की बीत चुकी हो तो नए सिरे से गिनें
  if (now - rec.firstFailedAt > WINDOW_MS) {
    rec.failed = 0;
    rec.firstFailedAt = now;
    rec.alerted = false;
  }

  rec.failed += 1;
  if (rec.failed >= MAX_FAILED) rec.lockedUntil = now + backoffMs(rec.failed);
  await writeRec(key, rec);

  // बार-बार असफलता — इसे चुपचाप न जाने दें, ताकि किसी खाते पर हो रहा हमला
  // audit लॉग में दिखे और बाद में उसकी जाँच हो सके
  if (rec.failed >= ALERT_AT && !rec.alerted) {
    rec.alerted = true;
    logActivity({
      actorRole: 'system',
      actorId: null,
      actorName: maskIdentity(key.split('|')[0]),
      action: 'otp_repeated_failures',
      details: `OTP सत्यापन में लगातार ${rec.failed} असफल कोशिशें (${purpose}) — संभावित brute-force`,
      req,
    });
    await writeRec(key, rec); // alerted=true भी सुरक्षित रहे, वरना हर बार alert दोहराता
  }
  return rec.failed;
}

// सफल सत्यापन पर गिनती साफ़ — असली उपयोगकर्ता के नाम पुरानी असफलताएँ न टिकें
async function clearOtpAttempts(req, purpose) {
  await deleteRec(identityKey(req, purpose));
}

module.exports = { checkOtpAttempts, recordOtpFailure, clearOtpAttempts, MAX_FAILED };
