const db = require('../config/db');
const { validateJsonDepth } = require('../utils/fieldValidators');

const DEFAULTS = {
  feature_flags: {
    voiceToText: true,
    qrScanner: true,
    audioRecording: true,
    liveLocationSharing: true,
  },
  maintenance_mode: { active: false, message: 'ShaktiCop अभी रखरखाव के लिए बंद है, कृपया थोड़ी देर बाद कोशिश करें।' },
  min_app_version: { android: '1.0.0', ios: '1.0.0', forceUpdateMessage: 'कृपया नया वर्शन इंस्टॉल करें, तभी ऐप काम करेगा।' },
  default_sla_hours: { hours: 48 },
  theme_color: { primary: '#8E2A46' },
  notification_templates: {
    sosAlertTitle: 'SOS अलर्ट — तुरंत कार्यवाही चाहिए',
    complaintAssignedBody: 'आपको एक नई शिकायत सौंपी गई है — कृपया जल्द जांच करें।',
    complaintResolvedBody: 'आपकी शिकायत निस्तारित कर दी गई है। कृपया अपना अनुभव साझा करें।',
  },
  rate_limit: { windowMinutes: 15, maxRequests: 300 },
  rank_permissions: {
    Constable: { canReject: false, canTransfer: false },
    'Head Constable': { canReject: false, canTransfer: false },
    SI: { canReject: true, canTransfer: false },
    Inspector: { canReject: true, canTransfer: true },
    SHO: { canReject: true, canTransfer: true },
  },
  escalation_rules: {
    enabled: true,
    afterHoursStart: 22, // रात 10 बजे
    afterHoursEnd: 6, // सुबह 6 बजे
    escalateAfterHours: 4, // ऑफ-आवर में इतने घंटे बिना कार्यवाही रहने पर escalate करें
  },
  relationship_options: {
    values: ['पति', 'ससुराल पक्ष', 'पिता/भाई/अन्य रिश्तेदार', 'अन्य'],
  },
  officer_designations: {
    values: ['उप निरीक्षक', 'निरीक्षक', 'थानाध्यक्ष', 'हेड कांस्टेबल', 'कांस्टेबल'],
  },
  // 🆕 MSG91 का सामान्य OTP API सिर्फ़ OTP भेज सकता है — SOS जैसे कस्टम मैसेज (जिसमें
  // पीड़िता का नाम/लोकेशन लिंक होता है) के लिए एक अलग, DLT-रजिस्टर्ड "flow" template चाहिए।
  // यहां वह template ID सेट करें — तभी SOS/अलर्ट SMS MSG91 से सही तरीक़े से जाएंगे।
  // टेम्पलेट में एक वेरिएबल (जैसे {{VAR1}}) होना चाहिए, जिसमें पूरा संदेश डाला जाएगा।
  sms_alert_template: {
    msg91TemplateId: '',
  },
  // 🆕 होम स्क्रीन बैनर — एक slide से दूसरी slide में बदलते समय transition effect
  // अब admin तय कर सकते हैं। पहले यह हमेशा एक तय (fade, 400ms, हर 4.5 सेकंड) पर
  // hardcoded था — किसी को यह पसंद न हो या ज़्यादा/कम तेज़ चाहिए हो, तो कोई विकल्प
  // ही नहीं था।
  //   transitionType: 'fade' | 'slide' | 'none'
  //   transitionDurationMs: transition कितनी देर (मिलीसेकंड) में पूरी हो
  //   autoPlayIntervalMs: हर slide कितनी देर (मिलीसेकंड) दिखे, अगली पर जाने से पहले
  banner_carousel: {
    transitionType: 'fade',
    transitionDurationMs: 400,
    autoPlayIntervalMs: 4500,
  },
};

// ============================================================
// साझा in-memory cache — rate-limiter जैसे hot-path कोड को हर request पर DB query
// न करनी पड़े। हर 60 सेकंड में अपने-आप ताज़ा होता है।
// ============================================================
let cache = { ...DEFAULTS };

async function refreshCache() {
  try {
    const result = await db.query('SELECT key, value FROM app_settings');
    const merged = { ...DEFAULTS };
    for (const row of result.rows) merged[row.key] = row.value;
    cache = merged;
  } catch (e) {
    console.error('app settings cache refresh विफल:', e.message);
  }
}

// तुरंत एक बार लोड करें, फिर हर 60 सेकंड में ताज़ा होता रहे
if (process.env.NODE_ENV !== 'test') {
  refreshCache();
}
const cacheInterval = setInterval(refreshCache, 60000);
if (cacheInterval.unref) cacheInterval.unref();

// किसी भी दूसरे controller से इस्तेमाल के लिए — बिना DB query किए तुरंत मिलता है
function getCachedSetting(key) {
  return cache[key] || DEFAULTS[key];
}

// GET /app-settings   (सार्वजनिक — कोई लॉगिन आवश्यक नहीं)
// 🐛 बग फ़िक्स (सुरक्षा): पहले यह पूरी settings cache — जिसमें rate_limit की सीमाएं
// (जो किसी हमलावर को बताती हैं कि सीमा से पहले कितनी बार कोशिश कर सकते हैं), MSG91
// alert template ID, escalation_rules, notification_templates जैसी आंतरिक/परिचालन
// जानकारी शामिल थी — बिना लॉगिन के किसी को भी दिखा देता था। अब सिर्फ़ वही settings
// जो नागरिक ऐप को लॉगिन से पहले सच में चाहिए, स्पष्ट रूप से चुनकर भेजी जाती हैं।
const PUBLIC_SETTING_KEYS = ['feature_flags', 'maintenance_mode', 'min_app_version', 'theme_color', 'relationship_options', 'banner_carousel'];

async function getPublicSettings(req, res) {
  const publicSubset = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    if (cache[key] !== undefined) publicSubset[key] = cache[key];
  }
  res.json(publicSubset);
}

// GET /admin/settings   (Super Admin — प्रबंधन के लिए)
async function listSettings(req, res) {
  const result = await db.query('SELECT key, value, updated_at, updated_by FROM app_settings');
  const stored = {};
  for (const row of result.rows) stored[row.key] = row;
  const merged = {};
  for (const key of Object.keys(DEFAULTS)) {
    merged[key] = stored[key] || { key, value: DEFAULTS[key], updated_at: null, updated_by: null };
  }
  res.json(merged);
}

// PUT /admin/settings/:key   (Super Admin only)   body: { value: {...} }
async function updateSetting(req, res) {
  const { key } = req.params;
  const { value } = req.body;
  if (!Object.keys(DEFAULTS).includes(key)) {
    return res.status(400).json({ error: 'अमान्य setting key' });
  }
  if (value == null || typeof value !== 'object') {
    return res.status(400).json({ error: 'value एक object होना चाहिए' });
  }
  const depthErr = validateJsonDepth(value, { label: 'value' });
  if (depthErr) return res.status(400).json({ error: depthErr });
  // 🆕 banner_carousel के लिए सीमा-जांच — बहुत कम/नकारात्मक मान मोबाइल पर carousel
  // को तोड़ सकते हैं (जैसे 0ms transition या 0ms interval अनंत-लूप जैसा व्यवहार कर सकता है)
  if (key === 'banner_carousel') {
    const { transitionType, transitionDurationMs, autoPlayIntervalMs } = value;
    if (!['fade', 'slide', 'none'].includes(transitionType)) {
      return res.status(400).json({ error: 'transitionType "fade", "slide" या "none" में से एक होना चाहिए' });
    }
    if (!(transitionDurationMs >= 100 && transitionDurationMs <= 2000)) {
      return res.status(400).json({ error: 'transitionDurationMs 100-2000 के बीच होना चाहिए' });
    }
    if (!(autoPlayIntervalMs >= 1500 && autoPlayIntervalMs <= 30000)) {
      return res.status(400).json({ error: 'autoPlayIntervalMs 1500-30000 के बीच होना चाहिए' });
    }
  }
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ($1,$2, now(), $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now(), updated_by = $3`,
    [key, JSON.stringify(value), req.user.name]
  );
  await refreshCache(); // तुरंत असर हो, 60 सेकंड इंतज़ार न करना पड़े
  res.json({ message: 'सुरक्षित हुआ', key, value });
}

module.exports = { getPublicSettings, listSettings, updateSetting, getCachedSetting, DEFAULTS };
