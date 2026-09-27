// ============================================================
// बैकएंड से बात करने वाली परत
//
// मोबाइल ऐप के api.js जैसी ही, पर ब्राउज़र के हिसाब से:
//   • टोकन localStorage में (ब्राउज़र में SecureStore जैसा कुछ नहीं होता)
//   • access token चुपचाप refresh होता रहे, ताकि अधिकारी का काम बीच में न रुके
// ============================================================

// ⚠️ deploy करते समय VITE_API_URL ज़रूर सेट करें (Render → Environment)।
//    🐛 बग फ़िक्स: पहले यहां न सेट होने पर पुराने (अब बंद हो चुके) Railway बैकएंड पर
//    चुपचाप fallback हो जाता था — यानी बिल्ड में गलती से यह variable छूट जाने पर भी
//    कोई त्रुटि नहीं दिखती, बस ऐप एक मरे हुए बैकएंड से बात करने की कोशिश करता रहता।
//    अब जानबूझकर fail-fast: variable न हो तो बिल्ड-टाइम पर ही साफ़ त्रुटि।
if (!import.meta.env.VITE_API_URL) {
  throw new Error('VITE_API_URL सेट नहीं है — deploy से पहले Render पर यह environment variable ज़रूर जोड़ें।');
}
export const BASE_URL = import.meta.env.VITE_API_URL;

const TOKEN_KEY = 'shaktikop_admin_token';
const REFRESH_KEY = 'shaktikop_admin_refresh';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getRefresh = () => localStorage.getItem(REFRESH_KEY);

export function saveTokens(token, refreshToken) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// एक ही समय पर कई requests 401 पाएं तो refresh सिर्फ़ एक बार चले — वरना हर request
// अपना refresh भेजती, और सर्वर उन्हें "दोबारा इस्तेमाल" मानकर सारे सत्र रद्द कर देता।
let refreshing = null;

async function doRefresh() {
  const rt = getRefresh();
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveTokens(data.token, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // access token की अवधि ख़त्म — एक बार चुपचाप refresh करके दोबारा कोशिश
  if (res.status === 401 && auth && getRefresh()) {
    if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
    const ok = await refreshing;
    if (ok) {
      const t2 = getToken();
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { ...headers, Authorization: `Bearer ${t2}` },
        body: body ? JSON.stringify(body) : undefined,
      });
    } else {
      clearTokens();
      // पूरा reload — ताकि ऐप लॉगिन स्क्रीन पर लौट आए
      window.location.href = '/login';
      throw new Error('सत्र समाप्त हो गया — कृपया दोबारा लॉगिन करें');
    }
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    // सर्वर का अपना संदेश ज़्यादा काम का होता है — वही दिखाएं
    throw new Error(data?.error || `अनुरोध विफल (${res.status})`);
  }
  return data;
}

// ---------- लॉगिन ----------
export async function adminLogin(username, password) {
  const data = await api('/auth/admin/login', {
    method: 'POST',
    auth: false,
    body: { username, password, deviceName: 'वेब ब्राउज़र' },
  });
  saveTokens(data.token, data.refreshToken);
  return data.user;
}

export async function fetchMe() {
  return api('/admin/me');
}
