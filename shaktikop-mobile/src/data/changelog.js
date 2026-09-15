// ============================================================
// ऐप का changelog — नया version खुलने पर "क्या नया है" दिखाने के लिए।
// हर release में यहाँ ऊपर एक नया entry जोड़ें (नया सबसे ऊपर)।
// ============================================================
export const CHANGELOG = [
  {
    version: '1.1.0',
    date: '2026-07-26',
    changes: [
      'शिकायत फॉर्म का draft अब सभी डिवाइस पर sync होता है — एक फोन पर लिखा अधूरा फॉर्म दूसरे फोन पर भी दिखेगा',
      'असली UP Police आधिकारिक चिह्न (logo) पूरे ऐप में जोड़ा गया',
      'नक्शे अब मुफ़्त OpenStreetMap से (कोई Google बिल नहीं)',
      'सभी dashboards में notification bell 🔔 जोड़ी गई',
      'Admin के लिए पेशेवर केस प्रबंधन — Priority, Checklist, QR पावती सत्यापन',
      'पूरा police rank hierarchy: SI, SHO, DSP, SP, SSP, Super Admin',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-20',
    changes: ['ShaktiCop का पहला संस्करण जारी हुआ — शिकायत दर्ज करना, ट्रैक करना, अधिकारी/एडमिन डैशबोर्ड'],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
