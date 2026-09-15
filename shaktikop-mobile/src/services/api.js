// ============================================================
// बैकएंड से जुड़ने वाली सारी API कॉल्स यहीं हैं।
// फोन (Expo Go) पर 'localhost' काम नहीं करेगा — अपने लैपटॉप का असली LAN IP डालें।
// टर्मिनल में `ipconfig` (Windows) या `ifconfig` (Mac/Linux) चलाकर पता करें।
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { lookupTranslation } from '../context/translationDictionary';
import { getDeviceName } from '../utils/deviceName';

export const BASE_URL = 'https://backend-production-2c8b.up.railway.app'; // ← अपना असली IP डालें

const TOKEN_KEY = 'shaktikop_token'; // ⚠️ SecureStore keys में सिर्फ़ अक्षर/अंक/'.'/'-'/'_' चल सकते हैं — इसलिए ':' हटाया
const LEGACY_TOKEN_KEY = 'shaktikop:token'; // पुराना AsyncStorage वाला key — माइग्रेशन के लिए
// 🆕 Refresh Token — access token अब छोटी अवधि (डिफ़ॉल्ट 1 घंटा) का है, इसलिए
// लंबे समय तक लॉगिन बनाए रखने के लिए यह अलग, लंबी अवधि का token भी उसी सुरक्षित
// जगह (SecureStore) में रखा जाता है।
const REFRESH_TOKEN_KEY = 'shaktikop_refresh_token';

// 🔒 सुरक्षा सुधार: JWT token — जो असली login-प्रमाण है — पहले AsyncStorage में सादे
// (unencrypted) रूप में रहता था। Android पर AsyncStorage असल में सादी SQLite फ़ाइल है,
// जिसे rooted/compromised डिवाइस पर आसानी से पढ़ा जा सकता है। अब SecureStore इस्तेमाल
// होता है — iOS पर Keychain, Android पर Keystore-सुरक्षित EncryptedSharedPreferences —
// यानी device की hardware-level सुरक्षा से एन्क्रिप्टेड रहता है।
// 🆕 export किया गया — backgroundLocation.js को भी बिल्कुल यही (SecureStore वाला,
// legacy-migration समेत) तरीक़ा चाहिए। पहले उसने अपनी अलग नक़ल रखी थी और वही इस
// पूरे feature के टूटने की वजह बनी — इसलिए अब नक़ल नहीं, यही साझा किया जाता है।
export async function getToken() {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) return token;
  } catch (e) {
    // कुछ पुराने/असामान्य डिवाइस पर SecureStore विफल हो सकता है — आगे पुराने तरीक़े से कोशिश करें
  }
  // माइग्रेशन: पुराने AsyncStorage में token मिले तो उसे SecureStore में ले आएं और वहां से हटा दें
  const legacy = await AsyncStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, legacy);
    } catch (e) {
      // SecureStore न चले तो कम-से-कम पुराना token तो काम करता रहे
    }
    await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
    return legacy;
  }
  return null;
}
export async function saveToken(token) {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (e) {
    // अत्यंत दुर्लभ स्थिति (SecureStore उपलब्ध न हो) — कम-से-कम लॉगिन तो काम करे
    await AsyncStorage.setItem(LEGACY_TOKEN_KEY, token);
  }
}
async function getRefreshToken() {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}
async function saveRefreshToken(refreshToken) {
  if (!refreshToken) return;
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  } catch (e) {
    // ignore — refresh token न बचे तो भी access token अपनी अवधि तक तो काम करेगा
  }
}
async function clearRefreshToken() {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (e) {
    // ignore
  }
}
// 🆕 लॉगिन/साइनअप के बाद दोनों token एक साथ सेव करने के लिए — हर जगह अलग-अलग
// दो लाइनें लिखने के बजाय एक ही जगह से
export async function saveTokens(token, refreshToken) {
  await saveToken(token);
  await saveRefreshToken(refreshToken);
}
export async function clearToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (e) {
    // ignore
  }
  await AsyncStorage.removeItem(LEGACY_TOKEN_KEY); // पुराना बचा हो तो वह भी साफ़ करें
  await clearRefreshToken();
}
// 🆕 सर्वर को बताएं कि यह refresh token अब बेकार कर दें (सिर्फ़ स्थानीय रूप से मिटाना
// काफ़ी नहीं — वरना अगर वही token कहीं और (जैसे किसी log/backup में) बचा रह जाए, वह
// अब भी नया access token लेने के लिए इस्तेमाल हो सकता था)
export async function apiLogout() {
  try {
    const rt = await getRefreshToken();
    if (rt) {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
    }
  } catch (e) {
    // नेटवर्क न हो तो भी स्थानीय logout ज़रूर हो — server-side token कुछ समय बाद अपनी
    // तय अवधि (REFRESH_TOKEN_EXPIRY_DAYS) पूरी होने पर वैसे भी अमान्य हो जाएगा
  }
}

// 🆕 फ़ोन चोरी/खोने या खाता compromise होने के शक़ पर — सभी डिवाइस से एक साथ लॉगआउट
// (यह अपने current access token से authenticated है — इसीलिए request() इस्तेमाल
// करता है, apiLogout जैसे सीधे fetch नहीं, ताकि Authorization header सही से लगे)
export async function apiLogoutAll() {
  return request('/auth/logout-all', { method: 'POST' });
}

// 🆕 सत्र स्वतः-समाप्ति (auto-logout) — पहले token अमान्य/समाप्त होने पर
// (चाहे JWT expire हो गया हो, या अब सर्वर पर खाता निष्क्रिय कर दिया गया हो) यूज़र
// को सिर्फ़ उस स्क्रीन पर एक साधारण error दिखता, पर ऐप उसे लॉगिन स्क्रीन पर वापस
// नहीं भेजता था — हर अगली कार्रवाई पर वही त्रुटि बार-बार दिखती रहती, जब तक यूज़र
// खुद ऐप बंद करके दोबारा न खोले। अब AppContext इस callback को अपने logout() से
// जोड़ देता है, ताकि 401 आते ही सत्र तुरंत साफ़ हो जाए और लॉगिन स्क्रीन दिखे।
let onUnauthorized = null;
export function setOnUnauthorized(handler) {
  onUnauthorized = handler;
}

// 🆕 single-flight रक्षा — एक साथ कई API कॉल्स 401 पाएं (आम बात है, स्क्रीन खुलते
// ही अक्सर 2-3 कॉल्स समांतर चलती हैं), तो हरेक अपना अलग refresh शुरू न करे। चूंकि
// refresh token हर बार इस्तेमाल होने पर "rotate" होता है (पुराना बेकार हो जाता है,
// देखें backend), अगर दो कॉल्स एक साथ अलग-अलग refresh कोशिश करतीं, तो दूसरी वाली
// हमेशा एक पहले से बेकार हो चुके token से चलती और नाकाम हो जाती। अब सब एक ही
// चल रहे refresh का इंतज़ार करती हैं, फिर सब अपनी असली request दोबारा भेजती हैं।
let refreshPromise = null;
// 🆕 export किया गया — background task को भी 401 पर token ताज़ा करने की ज़रूरत है
export async function performRefresh() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const rt = await getRefreshToken();
      if (!rt) return false;
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) {
          await clearToken(); // refresh token भी अमान्य/समाप्त — दोनों साफ़ कर दें
          return false;
        }
        const data = await res.json();
        await saveTokens(data.token, data.refreshToken);
        return true;
      } catch (e) {
        return false; // नेटवर्क त्रुटि — token साफ़ न करें, शायद फिर कोशिश काम कर जाए
      }
    })();
  }
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function request(path, { method = 'GET', body, auth = true, _isRetry = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 🆕 access token की अवधि पूरी होना अब एक सामान्य/अपेक्षित घटना है (छोटी अवधि की
    // वजह से बार-बार होगी) — इसलिए पहले चुपचाप refresh करके वही request दोबारा भेजने
    // की कोशिश करते हैं, यूज़र को logout करने से पहले। अगर refresh token भी न हो या
    // वह भी अमान्य निकले, तभी पुराना व्यवहार (logout) होता है।
    if (res.status === 401 && auth && !_isRetry) {
      const refreshed = await performRefresh();
      if (refreshed) {
        return request(path, { method, body, auth, _isRetry: true });
      }
    }
    if (res.status === 401 && auth && onUnauthorized) {
      onUnauthorized(); // fire-and-forget — साथ ही नीचे असली त्रुटि भी थ्रो होती है ताकि स्क्रीन संदेश दिखा सके
    }
    // 🆕 बग फ़िक्स: बैकएंड की त्रुटियाँ हमेशा हिंदी में आती थीं और पूरे ऐप में 41 जगह
    // सीधे e.message के रूप में दिखाई जाती थीं — ये tt() से कभी नहीं गुज़रती थीं,
    // इसलिए English mode में भी हिंदी दिखती रहतीं। अब यहीं, एक ही केंद्रीय जगह पर,
    // सर्वर से आया संदेश अनुवाद-शब्दकोश में देखा जाता है — मिल जाए तो अंग्रेज़ी थ्रो
    // होती है, वरना असली हिंदी संदेश (कोई crash नहीं)। इससे उन सभी 41 जगहों को
    // अलग-अलग बदलने की ज़रूरत नहीं पड़ी।
    const rawMessage = data.error || `सर्वर त्रुटि (${res.status})`;
    let finalMessage = rawMessage;
    try {
      const locale = await AsyncStorage.getItem('shaktikop:locale');
      if (locale === 'en') {
        // 🆕 बग फ़िक्स: कुछ त्रुटि-संदेश (जैसे "duplicate officer" चेतावनी) रन-टाइम पर
        // बने (अधिकारी का नाम/थाना/ज़िला जोड़कर) होते हैं — हर बार अलग टेक्स्ट, इसलिए
        // शब्दकोश में कभी पूरा-मिलान (exact match) नहीं हो सकता, चाहे locale अंग्रेज़ी
        // हो। ऐसे संरचित (structured) मामलों के लिए, यहीं टुकड़ों में अनुवाद जोड़कर
        // संदेश दोबारा बनाते हैं (जगह के नाम अनुवाद होते हैं, व्यक्ति का नाम नहीं)।
        if (data.existingOfficer) {
          const ex = data.existingOfficer;
          const station = lookupTranslation(ex.station) || ex.station || 'unknown station';
          const district = lookupTranslation(ex.district) || ex.district || 'unknown district';
          finalMessage = `This police ID/mobile is already active with another officer (${ex.name}) — at ${station}, ${district}. Please deactivate that ID first before creating a new one.`;
        } else {
          finalMessage = lookupTranslation(rawMessage) || rawMessage;
        }
      }
    } catch (e) {
      // locale पढ़ने में दिक़्क़त — असली (हिंदी) संदेश से आगे बढ़ें, यह कभी request को न रोके
    }
    // 🆕 HTTP status को error पर जोड़ते हैं — बुलाने वाले को यह जानना ज़रूरी है कि
    // विफलता स्थायी (4xx — दोबारा कोशिश बेकार) है या अस्थायी (5xx/नेटवर्क — दोबारा
    // कोशिश सही)। offline-कतार इसी फ़र्क़ पर टिकी है (देखें syncOfflineQueue)।
    const err = new Error(finalMessage);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- नागरिक: साइनअप ----------
// 🆕 locale — OTP का SMS/ईमेल सही भाषा में भेजने के लिए, हर OTP-request के साथ
// मौजूदा भाषा भेजते हैं (DB में कहीं सेव नहीं होती, सिर्फ़ इसी request के लिए)
async function getCurrentLocaleSafe() {
  try {
    return (await AsyncStorage.getItem('shaktikop:locale')) || 'hi';
  } catch (e) {
    return 'hi';
  }
}

// 🆕 email वैकल्पिक — दिया हो तो वही OTP मोबाइल के साथ-साथ ईमेल पर भी जाता है
export async function signupRequestOtp(mobile, email) {
  const locale = await getCurrentLocaleSafe();
  return request('/auth/citizen/signup/request-otp', { method: 'POST', body: { mobile, email, locale }, auth: false });
}

export async function signupVerify({ mobile, otp, name, fatherName, address, password, email }) {
  const data = await request('/auth/citizen/signup/verify', {
    method: 'POST',
    body: { mobile, otp, name, fatherName, address, password, email, deviceName: await getDeviceName() },
    auth: false,
  });
  await saveTokens(data.token, data.refreshToken);
  return data.user;
}

// ---------- नागरिक: लॉगिन ----------
export async function citizenLogin(mobile, password) {
  const data = await request('/auth/citizen/login', { method: 'POST', body: { mobile, password, deviceName: await getDeviceName() }, auth: false });
  await saveTokens(data.token, data.refreshToken);
  return data.user;
}

// ---------- नागरिक: पासवर्ड भूल गए ----------
export async function forgotPasswordRequestOtp(mobile) {
  const locale = await getCurrentLocaleSafe();
  return request('/auth/citizen/forgot-password/request-otp', { method: 'POST', body: { mobile, locale }, auth: false });
}

export async function forgotPasswordReset(mobile, otp, newPassword) {
  return request('/auth/citizen/forgot-password/reset', {
    method: 'POST',
    body: { mobile, otp, newPassword },
    auth: false,
  });
}

// ---------- स्टाफ़ लॉगिन (एकीकृत — अधिकारी + एडमिन, मोबाइल या ईमेल) ----------
export async function staffRequestOtp(identifier) {
  const locale = await getCurrentLocaleSafe();
  return request('/auth/staff/request-otp', { method: 'POST', body: { identifier, locale }, auth: false });
}
export async function staffVerifyOtp(identifier, otp) {
  const data = await request('/auth/staff/verify-otp', { method: 'POST', body: { identifier, otp, deviceName: await getDeviceName() }, auth: false });
  await saveTokens(data.token, data.refreshToken);
  return data;
}

// ---------- अधिकारी लॉगिन (OTP) — Phase C, अब staff/* से बदला जा चुका है ----------
export async function officerRequestOtp(mobile) {
  const locale = await getCurrentLocaleSafe();
  return request('/auth/officer/request-otp', { method: 'POST', body: { mobile, locale }, auth: false });
}
export async function officerVerifyOtp(mobile, otp) {
  const data = await request('/auth/officer/verify-otp', { method: 'POST', body: { mobile, otp, deviceName: await getDeviceName() }, auth: false });
  await saveTokens(data.token, data.refreshToken);
  return data.user;
}

export async function adminLogin(username, password) {
  const data = await request('/auth/admin/login', { method: 'POST', body: { username, password, deviceName: await getDeviceName() }, auth: false });
  await saveTokens(data.token, data.refreshToken);
  return data.user;
}

// ---------- पुलिस सेवाएं (Super Admin द्वारा प्रबंधित) ----------
// पहले यह सूची ऐप के कोड में लिखी थी, इसलिए किसी सरकारी पोर्टल का URL बदलने पर भी
// नई APK बनानी पड़ती। अब सर्वर से आती है — बदलाव तुरंत सबको दिखता है।
export async function fetchPoliceServices() {
  return request('/police-services', { auth: false });
}
export async function fetchAllPoliceServices() {
  return request('/admin/police-services');
}
export async function createPoliceService(payload) {
  return request('/admin/police-services', { method: 'POST', body: payload });
}
export async function updatePoliceService(id, payload) {
  return request(`/admin/police-services/${id}`, { method: 'PATCH', body: payload });
}
export async function deletePoliceService(id) {
  return request(`/admin/police-services/${id}`, { method: 'DELETE' });
}

// ---------- नागरिक प्रोफ़ाइल ----------
export async function fetchMyProfile() {
  return request('/citizens/me');
}
export async function updateMyProfile({ name, fatherName, address, district, policeStation, email }) {
  return request('/citizens/me', { method: 'PATCH', body: { name, fatherName, address, district, policeStation, email } });
}
export async function updateEmergencyContacts(contacts) {
  return request('/citizens/me/emergency-contacts', { method: 'PATCH', body: { contacts } });
}
export async function updateMyPhoto(photoUrl) {
  return request('/citizens/me/photo', { method: 'PATCH', body: { photoUrl } });
}
export async function updateMyOfficerPhoto(photoUrl) {
  return request('/officers/me/photo', { method: 'PATCH', body: { photoUrl } });
}
export async function updateMyAdminPhoto(photoUrl) {
  return request('/admin/me/photo', { method: 'PATCH', body: { photoUrl } });
}
export async function updateCitizenPushToken(pushToken) {
  return request('/citizens/me/push-token', { method: 'PATCH', body: { pushToken } });
}
// 🆕 DPDP Act — डेटा तक पहुंच व मिटाने का अधिकार
export async function exportMyData() {
  return request('/citizens/me/export');
}
export async function requestAccountDeletion(reason) {
  return request('/citizens/me/deletion-request', { method: 'POST', body: { reason } });
}
export async function fetchMyDeletionRequest() {
  return request('/citizens/me/deletion-request');
}

// ---------- शिकायतें ----------
export async function fetchComplaints(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  ).toString();
  return request(`/complaints${qs ? `?${qs}` : ''}`);
}
export async function fetchComplaint(id) {
  return request(`/complaints/${id}`);
}
// QR स्कैन से सत्यापन — किसी भी थाने का officer/admin, अपने स्कोप से बाहर की शिकायत भी देख सकता है
export async function verifyComplaintByQr(id) {
  return request(`/complaints/${id}/verify`);
}
export async function createComplaint(payload) {
  return request('/complaints', { method: 'POST', body: payload });
}
export async function assignOfficer(id, officerId) {
  return request(`/complaints/${id}/assign`, { method: 'PATCH', body: { officerId } });
}
export async function updateComplaintStatus(id, status, note, attachmentUrl, voiceNoteUrl) {
  return request(`/complaints/${id}/status`, { method: 'PATCH', body: { status, note, attachmentUrl, voiceNoteUrl } });
}
export async function alertOfficer(id, message) {
  return request(`/complaints/${id}/alert`, { method: 'POST', body: { message } });
}
export async function transferComplaint(id, toOfficerId, note) {
  return request(`/complaints/${id}/transfer`, { method: 'PATCH', body: { toOfficerId, note } });
}
// 🆕 सिर्फ़ Super Admin — शिकायत को हटाना (अब स्थायी नहीं, soft-delete — वापस लाई जा सकती है)
export async function deleteComplaint(id) {
  return request(`/complaints/${id}`, { method: 'DELETE' });
}
// 🆕 सिर्फ़ Super Admin — हटाई गई शिकायतों की सूची
export async function fetchDeletedComplaints() {
  return request('/complaints/deleted');
}
// 🆕 सिर्फ़ Super Admin — हटाई गई शिकायत वापस लाना
export async function restoreComplaint(id) {
  return request(`/complaints/${id}/restore`, { method: 'POST' });
}

// ---------- सुरक्षित यात्रा मोड (Phase E) ----------
export async function triggerSos(id, latitude, longitude) {
  return request(`/complaints/${id}/sos`, { method: 'POST', body: { latitude, longitude } });
}
export async function confirmSafeArrival(id) {
  return request(`/complaints/${id}/safe-arrival`, { method: 'POST' });
}
export async function checkinResponse(id, status) {
  return request(`/complaints/${id}/checkin-response`, { method: 'POST', body: { status } });
}
export async function submitFeedback(id, rating, note) {
  return request(`/complaints/${id}/feedback`, { method: 'PATCH', body: { rating, note } });
}

// ---------- एडमिन: push token (SOS अलर्ट प्राप्त करने के लिए) ----------
export async function updateAdminPushToken(pushToken) {
  return request('/admin/me/push-token', { method: 'PATCH', body: { pushToken } });
}

// ---------- अधिकारी: स्वयं-सेवा ----------
export async function fetchMyOfficerProfile() {
  return request('/officers/me');
}
export async function fetchOfficersForTransfer() {
  return request('/officers/for-transfer');
}
export async function updateOfficerPushToken(pushToken) {
  return request('/officers/me/push-token', { method: 'PATCH', body: { pushToken } });
}
export async function updateOfficerDutyStatus(dutyStatus) {
  return request('/officers/me/duty-status', { method: 'PATCH', body: { dutyStatus } });
}

// ---------- अधिकारी: Phase H ----------
// 🆕 filters: { dateFrom, dateTo, category, status } — advanced analytics के लिए
export async function fetchMyPerformance(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  return request(`/officers/me/performance${qs ? `?${qs}` : ''}`);
}
export async function fetchStationPerformance() {
  return request('/officers/me/station-performance');
}
export async function updateNotificationPreferences(prefs) {
  return request('/officers/me/notification-preferences', { method: 'PATCH', body: prefs });
}
export async function requestBackup(complaintId, latitude, longitude, message) {
  return request('/officers/me/backup-request', { method: 'POST', body: { complaintId, latitude, longitude, message } });
}
export async function fetchPrivateNotes(complaintId) {
  return request(`/complaints/${complaintId}/private-notes`);
}
export async function addPrivateNote(complaintId, note) {
  return request(`/complaints/${complaintId}/private-notes`, { method: 'POST', body: { note } });
}
export async function fetchFieldVisits(complaintId) {
  return request(`/complaints/${complaintId}/field-visits`);
}
export async function addFieldVisit(complaintId, latitude, longitude, note) {
  return request(`/complaints/${complaintId}/field-visits`, { method: 'POST', body: { latitude, longitude, note } });
}

// ---------- संदेश (Phase H) ----------
export async function fetchMessageRecipients(q) {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return request(`/messages/recipients${query}`);
}
export async function fetchInbox() {
  return request('/messages/inbox');
}
export async function fetchConversation(withId) {
  return request(`/messages/conversation?with=${withId}`);
}
export async function sendMessage(recipientRole, recipientId, body) {
  return request('/messages', { method: 'POST', body: { recipientRole, recipientId, body } });
}

// 🆕 Complaint Chat — नागरिक और नियुक्त अधिकारी के बीच केस-दायरे में बातचीत
export async function fetchComplaintMessages(complaintId) {
  return request(`/complaints/${complaintId}/messages`);
}
export async function sendComplaintMessage(complaintId, body) {
  return request(`/complaints/${complaintId}/messages`, { method: 'POST', body: { body } });
}

// ---------- एडमिन: सामान्य ----------
export async function fetchOfficers() {
  return request('/officers');
}
export async function fetchStats() {
  return request('/admin/stats');
}
export async function fetchCategoryStats() {
  return request('/admin/stats/by-category');
}
export async function fetchActivityLogs(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  ).toString();
  return request(`/admin/activity-logs${qs ? `?${qs}` : ''}`);
}

// ---------- एडमिन: अधिकारी प्रबंधन ----------
export async function fetchAllOfficers() {
  return request('/admin/officers');
}
export async function createOfficer(payload) {
  return request('/admin/officers', { method: 'POST', body: payload });
}
export async function updateOfficer(id, payload) {
  return request(`/admin/officers/${id}`, { method: 'PATCH', body: payload });
}
export async function transferOfficer(id, payload) {
  return request(`/admin/officers/${id}/transfer`, { method: 'POST', body: payload });
}
export async function setOfficerStatus(id, isActive) {
  return request(`/admin/officers/${id}/status`, { method: 'PATCH', body: { isActive } });
}
export async function updateOfficerPermissions(id, permissions) {
  return request(`/admin/officers/${id}/permissions`, { method: 'PATCH', body: { permissions } });
}
export async function deleteOfficer(id) {
  return request(`/admin/officers/${id}`, { method: 'DELETE' });
}

// ---------- एडमिन: प्रोफ़ाइल ----------
export async function fetchAdminProfile() {
  return request('/admin/me');
}
export async function updateAdminProfile(name) {
  return request('/admin/me', { method: 'PATCH', body: { name } });
}
export async function changeAdminPassword(currentPassword, newPassword) {
  return request('/admin/me/password', { method: 'PATCH', body: { currentPassword, newPassword } });
}

// 🆕 अधिकारी व काउंसलर अपना पासवर्ड बदल सकें — बैकएंड में ये endpoints अभी जोड़े गए हैं।
// पहले सिर्फ़ admin के पास यह सुविधा थी, जबकि Settings में "पासवर्ड बदलें" सबको दिखता था।
export async function changeOfficerPassword(currentPassword, newPassword) {
  return request('/officers/me/password', { method: 'PATCH', body: { currentPassword, newPassword } });
}
export async function changeCounsellorPassword(currentPassword, newPassword) {
  return request('/counselling/providers/me/password', { method: 'PATCH', body: { currentPassword, newPassword } });
}

// ---------- नज़दीकी थाना/अस्पताल (कोई लॉगिन आवश्यक नहीं) ----------
export async function fetchNearby(latitude, longitude, type) {
  return request(`/nearby?lat=${latitude}&lng=${longitude}&type=${type}`, { auth: false });
}

// ---------- Home बैनर (सार्वजनिक) ----------
export async function fetchBanners() {
  return request('/banners', { auth: false });
}

// ---------- एडमिन: बैनर प्रबंधन ----------
export async function fetchAllBanners() {
  return request('/admin/banners');
}
export async function createBanner(payload) {
  return request('/admin/banners', { method: 'POST', body: payload });
}
export async function updateBanner(id, payload) {
  return request(`/admin/banners/${id}`, { method: 'PATCH', body: payload });
}
export async function deleteBanner(id) {
  return request(`/admin/banners/${id}`, { method: 'DELETE' });
}

// ---------- शिकायत नंबर से ट्रैक करना (सार्वजनिक) ----------
export async function trackComplaint(id) {
  return request(`/track/${id}`, { auth: false });
}

// ---------- सूचनाएं (bell आइकन) ----------
export async function fetchMyNotifications() {
  return request('/notifications');
}
export async function fetchUnreadCount() {
  return request('/notifications/unread-count');
}
export async function markNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: 'PATCH' });
}
export async function markAllNotificationsRead() {
  return request('/notifications/read-all', { method: 'PATCH' });
}

// ---------- Analytics (एडमिन) ----------
// 🆕 filters: { dateFrom, dateTo, category, status, station, officerId } — advanced analytics
export async function fetchAnalyticsOverview(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  return request(`/admin/analytics/overview${qs ? `?${qs}` : ''}`);
}
export async function fetchAnalyticsFilterOptions() {
  return request('/admin/analytics/filter-options');
}
// 🆕 District → Station Drill-Down Explorer
export async function fetchDistrictsSummary(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  return request(`/admin/analytics/districts-summary${qs ? `?${qs}` : ''}`);
}
export async function fetchStationsSummary(district, filters = {}) {
  const qs = new URLSearchParams(Object.entries({ ...filters, district }).filter(([, v]) => v)).toString();
  return request(`/admin/analytics/stations-summary${qs ? `?${qs}` : ''}`);
}
// 🆕 SLA जोखिम-सूची, दोहराए-आरोपी सारांश, अधिकारी कार्यभार वितरण
export async function fetchSlaAtRisk(thresholdPercent) {
  const qs = thresholdPercent ? `?thresholdPercent=${thresholdPercent}` : '';
  return request(`/admin/analytics/sla-at-risk${qs}`);
}
export async function fetchRepeatOffenders() {
  return request('/admin/analytics/repeat-offenders');
}
// 🆕 SOS पर प्रतिक्रिया-समय — इस ऐप का सबसे अहम आंकड़ा
export async function fetchSosResponseAnalytics() {
  return request('/admin/analytics/sos-response');
}
// 🆕 बार-बार शिकायत करने वाली पीड़िताएं (पहचान कभी नहीं लौटती — सिर्फ़ गिनती व पैटर्न)
export async function fetchRepeatVictims(minCount) {
  return request(`/admin/analytics/repeat-victims${minCount ? `?minCount=${minCount}` : ''}`);
}
export async function fetchOfficerWorkload() {
  return request('/admin/analytics/officer-workload');
}
export async function fetchOfficerLeaderboard(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  return request(`/admin/analytics/officer-leaderboard${qs ? `?${qs}` : ''}`);
}

// ---------- Granular RBAC — district-admin management (सिर्फ़ super_admin) ----------
export async function fetchAdmins() {
  return request('/admin/admins');
}
export async function createDistrictAdmin(payload) {
  return request('/admin/admins', { method: 'POST', body: payload });
}
export async function deleteAdmin(id) {
  return request(`/admin/admins/${id}`, { method: 'DELETE' });
}
export async function updateAdminMenuPermissions(id, menuPermissions) {
  return request(`/admin/admins/${id}/menu-permissions`, { method: 'PATCH', body: { menuPermissions } });
}

// ---------- Broadcast / Announcement ----------
export async function sendBroadcast(payload) {
  return request('/admin/broadcast', { method: 'POST', body: payload });
}
export async function fetchBroadcastHistory() {
  return request('/admin/broadcast/history');
}

// ---------- Duplicate Detection ----------
export async function fetchPossibleDuplicates() {
  return request('/admin/duplicates');
}
export async function markDuplicate(id, duplicateOfId) {
  return request(`/complaints/${id}/mark-duplicate`, { method: 'PATCH', body: { duplicateOfId } });
}
export async function unmarkDuplicate(id) {
  return request(`/complaints/${id}/unmark-duplicate`, { method: 'PATCH' });
}

// ---------- Duty Roster ----------
export async function fetchRoster(params = {}) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
  return request(`/admin/roster${qs ? `?${qs}` : ''}`);
}
export async function addRosterEntry(payload) {
  return request('/admin/roster', { method: 'POST', body: payload });
}
export async function deleteRosterEntry(id) {
  return request(`/admin/roster/${id}`, { method: 'DELETE' });
}

// ---------- Content Management (Welfare/Helplines) ----------
export async function fetchAdminWelfare() {
  return request('/admin/content/welfare');
}
export async function createWelfareItem(payload) {
  return request('/admin/content/welfare', { method: 'POST', body: payload });
}
export async function updateWelfareItem(id, payload) {
  return request(`/admin/content/welfare/${id}`, { method: 'PATCH', body: payload });
}
export async function deleteWelfareItem(id) {
  return request(`/admin/content/welfare/${id}`, { method: 'DELETE' });
}
export async function fetchAdminHelplines() {
  return request('/admin/content/helplines');
}
export async function createHelplineItem(payload) {
  return request('/admin/content/helplines', { method: 'POST', body: payload });
}
export async function updateHelplineItem(id, payload) {
  return request(`/admin/content/helplines/${id}`, { method: 'PATCH', body: payload });
}
export async function deleteHelplineItem(id) {
  return request(`/admin/content/helplines/${id}`, { method: 'DELETE' });
}
export async function fetchPublicWelfare() {
  return request('/welfare-items', { auth: false });
}
export async function fetchPublicHelplines() {
  return request('/helpline-items', { auth: false });
}

// ---------- Scheduled Reports ----------
export async function fetchReportSchedules() {
  return request('/admin/report-schedules');
}
export async function createReportSchedule(payload) {
  return request('/admin/report-schedules', { method: 'POST', body: payload });
}
export async function updateReportSchedule(id, payload) {
  return request(`/admin/report-schedules/${id}`, { method: 'PATCH', body: payload });
}
export async function deleteReportSchedule(id) {
  return request(`/admin/report-schedules/${id}`, { method: 'DELETE' });
}
export async function generateReportNow(id) {
  return request(`/admin/report-schedules/${id}/generate-now`, { method: 'POST' });
}

// ---------- Overdue / SLA ----------
export async function fetchOverdueComplaints() {
  return request('/admin/overdue-complaints');
}

// ---------- Heatmap ----------
export async function fetchHeatmapPoints() {
  return request('/admin/analytics/heatmap');
}

// ---------- Bulk Officer Import ----------
export async function bulkImportOfficers(officers) {
  return request('/admin/officers/bulk-import', { method: 'POST', body: { officers } });
}

// ---------- सार्वजनिक भरोसा-काउंटर (Home स्क्रीन) ----------
export async function fetchPublicStats() {
  return request('/public-stats', { auth: false });
}

// ---------- पेशेवर केस प्रबंधन: Priority, Checklist, Verification ----------
export async function updatePriority(id, priority) {
  return request(`/complaints/${id}/priority`, { method: 'PATCH', body: { priority } });
}
export async function toggleChecklistItem(id, key, done) {
  return request(`/complaints/${id}/checklist`, { method: 'PATCH', body: { key, done } });
}
export async function verifyResolution(id) {
  return request(`/complaints/${id}/verify`, { method: 'POST' });
}

// ---------- Officer Status Overview (live — Admin के लिए) ----------
export async function fetchOfficerStatusOverview() {
  return request('/admin/officer-status-overview');
}

// ---------- Officer Rank (SI/SHO) ----------
export async function updateOfficerRank(id, rank) {
  return request(`/admin/officers/${id}/rank`, { method: 'PATCH', body: { rank } });
}

// ============================================================
// ⚠️ नीचे के फ़ंक्शन पहले इस फ़ाइल से गायब थे (AppContext.js में उपयोग हो रहे थे
// पर यहाँ परिभाषित नहीं थे) — इसलिए काउंसलिंग, श्रेणी-प्रबंधन, ATR, बैकअप/रीस्टोर,
// FAQ प्रबंधन, भाषा/अनुवाद प्रबंधन, लोकेशन-डेटा प्रबंधन, ऐप सेटिंग्स, ड्राफ़्ट-सिंक
// और लाइव-लोकेशन जैसी सुविधाएं रनटाइम पर टूट जातीं। यहाँ जोड़ा गया।
// ============================================================

// ---------- सेवा अनुरोध (काउंसलिंग/कानूनी सहायता/आत्मरक्षा/सशक्तिकरण) ----------
export async function createCounsellingRequest(payload) {
  return request('/counselling', { method: 'POST', body: payload });
}
export async function fetchCounsellingRequests(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  ).toString();
  return request(`/counselling${qs ? `?${qs}` : ''}`);
}
export async function updateCounsellingRequest(id, payload) {
  return request(`/counselling/${id}`, { method: 'PATCH', body: payload });
}
export async function fetchCounsellingStats(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  ).toString();
  return request(`/counselling/stats${qs ? `?${qs}` : ''}`);
}
export async function fetchCounsellingHistory(id) {
  return request(`/counselling/${id}/history`);
}

// ---------- काउंसलर / सेवा-प्रदाता सूची (नई — dropdown के लिए) ----------
export async function fetchServiceProviders(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  ).toString();
  return request(`/counselling/providers${qs ? `?${qs}` : ''}`);
}
export async function createServiceProvider(payload) {
  return request('/counselling/providers', { method: 'POST', body: payload });
}
export async function updateServiceProvider(id, payload) {
  return request(`/counselling/providers/${id}`, { method: 'PATCH', body: payload });
}
export async function deleteServiceProvider(id) {
  return request(`/counselling/providers/${id}`, { method: 'DELETE' });
}

// ---------- काउंसलर/प्रशिक्षक का अपना लॉगिन ----------
export async function counsellorLogin(identifier, password) {
  const data = await request('/counselling/providers/login', { method: 'POST', body: { identifier, password, deviceName: await getDeviceName() }, auth: false });
  await saveTokens(data.token, data.refreshToken);
  return data.user;
}
export async function fetchMyProviderProfile() {
  return request('/counselling/providers/me');
}
export async function updateMyProviderProfile(payload) {
  return request('/counselling/providers/me', { method: 'PATCH', body: payload });
}
export async function updateMyProviderPhoto(photoUrl) {
  return request('/counselling/providers/me/photo', { method: 'PATCH', body: { photoUrl } });
}
// 🆕 काउंसलर: push token (नई नियुक्ति/सत्र-तिथि बदलने की सूचना पाने के लिए)
export async function updateCounsellorPushToken(pushToken) {
  return request('/counselling/providers/me/push-token', { method: 'PATCH', body: { pushToken } });
}
export async function fetchMySessions() {
  return request('/counselling/providers/me/sessions');
}
export async function updateMySession(id, payload) {
  return request(`/counselling/providers/me/sessions/${id}`, { method: 'PATCH', body: payload });
}

// ---------- शिकायत श्रेणी प्रबंधन (Super Admin) ----------
export async function fetchCategories() {
  return request('/categories', { auth: false });
}
export async function fetchAdminCategories() {
  return request('/admin/categories');
}
export async function createCategory(payload) {
  return request('/admin/categories', { method: 'POST', body: payload });
}
export async function updateCategory(id, payload) {
  return request(`/admin/categories/${id}`, { method: 'PATCH', body: payload });
}
export async function deactivateCategory(id) {
  return request(`/admin/categories/${id}`, { method: 'DELETE' });
}

// ---------- ATR (Action Taken Report) ----------
export async function fetchAtrSummary(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  ).toString();
  return request(`/atr${qs ? `?${qs}` : ''}`);
}
export async function fetchAtr(id) {
  return request(`/atr/${id}`);
}

// ---------- बैकअप / रीस्टोर ----------
export async function fetchBackupStats() {
  return request('/admin/backup/stats');
}
export async function createBackup(tables) {
  return request('/admin/backup/create', { method: 'POST', body: { tables } });
}
export async function restoreBackup(payload) {
  return request('/admin/backup/restore', { method: 'POST', body: payload });
}

// ---------- FAQ प्रबंधन ----------
export async function fetchPublicFaq() {
  return request('/faq', { auth: false });
}
export async function fetchAdminFaq() {
  return request('/admin/faq');
}
export async function createFaq(payload) {
  return request('/admin/faq', { method: 'POST', body: payload });
}
export async function updateFaq(id, payload) {
  return request(`/admin/faq/${id}`, { method: 'PATCH', body: payload });
}
export async function deleteFaq(id) {
  return request(`/admin/faq/${id}`, { method: 'DELETE' });
}

// ---------- भाषा / अनुवाद प्रबंधन ----------
export async function fetchAdminLocales() {
  return request('/admin/locales');
}
export async function createLocale(payload) {
  return request('/admin/locales', { method: 'POST', body: payload });
}
export async function deleteLocale(code) {
  return request(`/admin/locales/${code}`, { method: 'DELETE' });
}
export async function fetchAdminTranslations(code) {
  return request(`/admin/translations/${code}`);
}
export async function bulkUploadTranslations(code, rows, mode) {
  return request(`/admin/translations/${code}/bulk-upload`, { method: 'POST', body: { rows, mode } });
}

// ---------- ज़िला/थाना लोकेशन डेटा प्रबंधन ----------
export async function fetchLocationData() {
  return request('/location-data', { auth: false });
}
export async function fetchAdminLocationData() {
  return request('/admin/location-data');
}
export async function addLocationEntry(payload) {
  return request('/admin/location-data', { method: 'POST', body: payload });
}
export async function deleteLocationEntry(id) {
  return request(`/admin/location-data/${id}`, { method: 'DELETE' });
}
export async function updateLocationEntryGeo(id, payload) {
  return request(`/admin/location-data/${id}`, { method: 'PATCH', body: payload });
}
export async function bulkUploadLocationData(rows, mode) {
  return request('/admin/location-data/bulk-upload', { method: 'POST', body: { rows, mode } });
}

// ---------- ऐप सेटिंग्स (Super Admin) ----------
export async function fetchAppSettings() {
  return request('/app-settings', { auth: false });
}
export async function fetchAdminSettings() {
  return request('/admin/settings');
}
export async function updateAdminSetting(key, value) {
  return request(`/admin/settings/${key}`, { method: 'PUT', body: { value } });
}

// ---------- Escalation को अभी चलाएं (Super Admin) ----------
export async function runEscalationNow() {
  return request('/admin/escalation/run-now', { method: 'POST' });
}

// ---------- DSP द्वारा SHO व अधिकारी बनाना ----------
export async function createSHOByDSP(payload) {
  return request('/admin/officers/create-sho', { method: 'POST', body: payload });
}
export async function createSubordinateOfficer(payload) {
  return request('/officers/me/create-officer', { method: 'POST', body: payload });
}
export async function fetchMyStationOfficers() {
  return request('/officers/me/station-officers');
}
export async function updateMyStationOfficer(id, payload) {
  return request(`/officers/me/station-officers/${id}`, { method: 'PATCH', body: payload });
}
export async function setMyStationOfficerStatus(id, isActive) {
  return request(`/officers/me/station-officers/${id}/status`, { method: 'PATCH', body: { isActive } });
}

// ---------- शिकायत ड्राफ़्ट — डिवाइसों के बीच सिंक ----------
export async function fetchDraft(category) {
  return request(`/citizens/me/drafts/${category}`);
}
export async function saveDraftRemote(category, draft) {
  return request(`/citizens/me/drafts/${category}`, { method: 'PUT', body: { draft } });
}
export async function deleteDraftRemote(category) {
  return request(`/citizens/me/drafts/${category}`, { method: 'DELETE' });
}

// ---------- लाइव लोकेशन (नागरिक — शिकायत में लगातार लोकेशन शेयर करना) ----------
export async function updateLiveLocation(id, payload) {
  return request(`/complaints/${id}/live-location`, { method: 'PATCH', body: payload });
}
export async function fetchLocationTrail(id, since) {
  const q = since ? `?since=${encodeURIComponent(since)}` : '';
  return request(`/complaints/${id}/location-trail${q}`);
}

// 🆕 दोहराए-आरोपी पहचान — सिर्फ़ officer/admin के लिए (backend खुद भी citizen को रोकता है)
export async function fetchAccusedHistory(id) {
  return request(`/complaints/${id}/accused-history`);
}

// 🆕 "किन-किन डिवाइस में लॉगिन है" (device login-sessions — काउंसलर के appointment
// "sessions" से बिल्कुल अलग चीज़ है, इसलिए जान-बूझकर अलग नाम रखा गया है ताकि कभी
// टकराव न हो — यहां पहले एक बार यही नाम टकरा भी गया था, बनाते ही पकड़ा गया)।
export async function fetchActiveDeviceSessions() {
  return request('/auth/sessions');
}
export async function revokeDeviceSession(sessionId) {
  return request(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
}

// ---------- संदेश — भेजे व प्राप्त दोनों एक साथ ----------
export async function fetchSentReceivedMessages() {
  return request('/messages/sent-received');
}
