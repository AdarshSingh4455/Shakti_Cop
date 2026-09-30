// ============================================================
// टेस्ट में process.env बदलने के बाद उसे वापस असली स्थिति में लाने के लिए —
// ताकि एक टेस्ट का env-बदलाव दूसरे टेस्ट को प्रभावित न करे (टेस्ट order-independent रहें)।
// ============================================================
function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const k of keys) prev[k] = process.env[k];
  for (const k of keys) {
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  const restore = () => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
  if (!fn) return restore; // caller खुद बाद में restore() बुलाएगा
  return Promise.resolve()
    .then(fn)
    .finally(restore);
}

// require cache से एक module हटाकर ताज़ा require करता है — otp.js जैसे modules
// जिनकी कुछ स्थिरांक (जैसे SMS_PROVIDER) सिर्फ़ module-load के समय तय होती हैं,
// उन्हें नए env vars के साथ दोबारा लोड करने के लिए ज़रूरी।
function freshRequire(resolvedPath) {
  delete require.cache[require.resolve(resolvedPath)];
  return require(resolvedPath);
}

module.exports = { withEnv, freshRequire };
