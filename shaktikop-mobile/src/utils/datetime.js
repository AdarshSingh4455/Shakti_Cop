// ============================================================
// तारीख़ व समय — हमेशा अंग्रेज़ी में।
//
// पहले जगह-जगह toLocaleDateString('hi-IN') इस्तेमाल होता था, जिससे महीने
// देवनागरी में आते थे ("28 जुल॰ 2026")। तारीख़/समय संख्यात्मक जानकारी है —
// रिपोर्ट, निर्यात और रिकॉर्ड में इसे एक जैसा व पढ़ने योग्य रखना बेहतर है,
// इसलिए ऐप की भाषा चाहे कोई भी हो, यह हमेशा अंग्रेज़ी में दिखती है।
// ============================================================

import { tt } from '../context/LocaleContext';

const LOCALE = 'en-IN';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function valid(value) {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// 28/07/2026
export function formatDate(value) {
  const d = valid(value);
  if (!d) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// 28 Jul 2026
export function formatDateShort(value) {
  const d = valid(value);
  if (!d) return '—';
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
}

// 10:10 AM
export function formatTime(value) {
  const d = valid(value);
  if (!d) return '—';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: true });
}

// 10:10:40 AM
export function formatTimeFull(value) {
  const d = valid(value);
  if (!d) return '—';
  return d.toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

// 28 Jul 2026, 10:10 AM
export function formatDateTime(value) {
  const d = valid(value);
  if (!d) return '—';
  return `${formatDateShort(d)}, ${formatTime(d)}`;
}

// 28/07/2026 10:10:40 AM  — तालिका/निर्यात के लिए
export function formatDateTimeFull(value) {
  const d = valid(value);
  if (!d) return '—';
  return `${formatDate(d)} ${formatTimeFull(d)}`;
}

// "12 मिनट पहले" जैसा पढ़ने लायक रूप — SOS, सुरक्षित यात्रा व लाइव लोकेशन में इस्तेमाल होता है
// 🐛 बग फ़िक्स: यह function सीधे हार्डकोडेड हिंदी लौटाता था ("2 दिन पहले") — यह
// टेक्स्ट कभी अनुवाद से गुज़रता ही नहीं था, इसलिए हर शिकायत-कार्ड पर (लाइव-लोकेशन
// लाइन में) अंग्रेज़ी मोड में भी हिंदी ही दिखती रहती। अब संख्या और इकाई-वाक्यांश
// अलग रखे हैं, ताकि इकाई शब्दकोश से अनुवादित हो सके और संख्या ज्यों की त्यों रहे।
export function timeAgo(value) {
  const d = valid(value);
  if (!d) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return tt('अभी-अभी');
  if (mins < 60) return `${mins} ${tt('मिनट पहले')}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${tt('घंटे पहले')}`;
  return `${Math.floor(hrs / 24)} ${tt('दिन पहले')}`;
}
