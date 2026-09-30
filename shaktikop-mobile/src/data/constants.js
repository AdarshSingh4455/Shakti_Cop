import { tt } from '../context/LocaleContext';
// ============================================================
// शिकायत श्रेणियां — Home स्क्रीन के कार्ड और फॉर्म दोनों इसी लिस्ट से बनते हैं।
// ✅ अब यह सूची सर्वर (database) से आती है — Super Admin नई श्रेणी जोड़/बदल सकते हैं।
// हर श्रेणी का fields बताता है कि फॉर्म में कौन से फ़ील्ड्स दिखेंगे — यह अभी भी कोड में तय है
// (नई श्रेणी के लिए एक सामान्य डिफ़ॉल्ट fields सेट अपने-आप लागू हो जाता है)।
// ============================================================

const FIELDS_BY_KEY = {
  'महिला हेल्प डेस्क': ['victim', 'district', 'policeStation', 'description', 'location'],
  'एंटी रोमियो स्क्वॉड': ['victim', 'district', 'policeStation', 'description', 'location'],
  'घरेलू हिंसा': ['victim', 'district', 'policeStation', 'relationship', 'description', 'location'],
  'सुरक्षित यात्रा मोड': ['victim', 'district', 'policeStation', 'vehicle', 'location'],
  'वॉइस शिकायत': ['victimMinimal', 'voiceRecording'],
};
const DEFAULT_FIELDS = ['victim', 'district', 'policeStation', 'description', 'location'];

// Dynamic Form Builder — इन्हीं में से चुनकर Admin किसी श्रेणी का फॉर्म बना सकता है
export const AVAILABLE_FORM_FIELDS = [
  { key: 'victim', label: 'पीड़ित की जानकारी (नाम, उम्र, आदि)' },
  { key: 'victimMinimal', label: 'सिर्फ़ नाम + मोबाइल (हल्का फ़ॉर्म)' },
  { key: 'district', label: 'ज़िला चुनना' },
  { key: 'policeStation', label: 'थाना चुनना' },
  { key: 'relationship', label: 'पीड़िता से संबंध (घरेलू हिंसा जैसी श्रेणी में)' },
  { key: 'description', label: 'विस्तृत विवरण (टाइप करके)' },
  { key: 'location', label: 'GPS लोकेशन' },
  { key: 'vehicle', label: 'वाहन नंबर' },
  { key: 'voiceRecording', label: 'आवाज़ रिकॉर्डिंग' },
];
const VALID_FIELD_KEYS = AVAILABLE_FORM_FIELDS.map((f) => f.key);

const FALLBACK_CATEGORY_DEFS = [
  { key: 'महिला हेल्प डेस्क', label: 'महिला हेल्प डेस्क', icon: 'woman-outline', color: '#7A1836', desc: 'महिला सुरक्षा से जुड़ी किसी भी समस्या की शिकायत यहाँ दर्ज करें।' },
  { key: 'एंटी रोमियो स्क्वॉड', label: 'एंटी रोमियो स्क्वॉड', icon: 'shield-outline', color: '#0F2A44', desc: 'छेड़छाड़ या असामाजिक व्यवहार की शिकायत — तुरंत कार्रवाई के लिए।' },
  { key: 'घरेलू हिंसा', label: 'घरेलू हिंसा', icon: 'home-outline', color: '#9B2647', desc: 'घर के अंदर हो रही हिंसा या उत्पीड़न की गोपनीय शिकायत।' },
  { key: 'सुरक्षित यात्रा मोड', label: 'सुरक्षित यात्रा मोड', icon: 'car-outline', color: '#2E7D5B', desc: 'यात्रा के दौरान असुरक्षित महसूस हो तो वाहन विवरण के साथ सूचित करें।' },
  { key: 'वॉइस शिकायत', label: 'वॉइस शिकायत', icon: 'mic-outline', color: '#C98A2B', desc: 'सिर्फ़ नाम, मोबाइल नंबर दें और अपनी शिकायत बोलकर रिकॉर्ड कर दें — बस इतना ही काफ़ी है।' },
].map((c) => ({ ...c, fields: FIELDS_BY_KEY[c.key] || DEFAULT_FIELDS }));

export const CATEGORY_DEFS = [...FALLBACK_CATEGORY_DEFS];

// सर्वर से मिला असली डेटा यहाँ भरा जाता है (AppContext से एक बार कॉल होता है)
export function setCategoriesData(serverCategories) {
  if (!Array.isArray(serverCategories) || serverCategories.length === 0) return;
  const mapped = serverCategories.map((c) => {
    const serverFields = Array.isArray(c.fields) ? c.fields.filter((f) => VALID_FIELD_KEYS.includes(f)) : null;
    return {
      key: c.key,
      label: c.label,
      icon: c.icon || 'document-text-outline',
      color: c.color || '#8E2A46',
      desc: c.description || '',
      slaHours: c.slaHours,
      requiresVehicleNumber: c.requiresVehicleNumber,
      fields:
        serverFields && serverFields.length > 0
          ? serverFields
          : FIELDS_BY_KEY[c.key] || (c.requiresVehicleNumber ? FIELDS_BY_KEY['सुरक्षित यात्रा मोड'] : DEFAULT_FIELDS),
    };
  });
  CATEGORY_DEFS.length = 0;
  CATEGORY_DEFS.push(...mapped);
}

export const CATEGORIES = CATEGORY_DEFS.map((c) => c.key);

export const RELATIONSHIP_OPTIONS = ['पति', 'ससुराल पक्ष', 'पिता/भाई/अन्य रिश्तेदार', 'अन्य'];

// सर्वर से मिला असली डेटा यहाँ भरा जाता है (AppContext से एक बार कॉल होता है)
export function setRelationshipOptions(values) {
  if (!Array.isArray(values) || values.length === 0) return;
  RELATIONSHIP_OPTIONS.length = 0;
  RELATIONSHIP_OPTIONS.push(...values);
}

export const OFFICER_DESIGNATIONS = ['उप निरीक्षक', 'निरीक्षक', 'थानाध्यक्ष', 'हेड कांस्टेबल', 'कांस्टेबल'];

export function setOfficerDesignations(values) {
  if (!Array.isArray(values) || values.length === 0) return;
  OFFICER_DESIGNATIONS.length = 0;
  OFFICER_DESIGNATIONS.push(...values);
}

export function categoryDef(key) {
  return CATEGORY_DEFS.find((c) => c.key === key) || CATEGORY_DEFS[0];
}

// ============================================================
// स्टेटस
// ============================================================
export const STATUSES = ['दर्ज', 'अधिकारी नियुक्त', 'कार्यवाही जारी', 'निस्तारित'];
export const REJECTED_STATUS = 'अस्वीकृत';
export const ALL_STATUSES = [...STATUSES, REJECTED_STATUS];

// ============================================================
// हेल्पलाइन नंबर — Home स्क्रीन पर टैप करने से डायल-पैड खुलता है
// ✅ अब सर्वर से आता है (Admin "योजना, हेल्पलाइन" से प्रबंधित करता है) — नीचे fallback है
// ============================================================
export const HELPLINES = [
  { label: tt('महिला हेल्पलाइन (UP)'), number: '1090', icon: 'woman-outline', color: '#D6336C' },
  { label: tt('पुलिस आपातकाल'), number: '112', icon: 'alert-circle-outline', color: '#0F2A44' },
  { label: tt('महिला हेल्पलाइन (राष्ट्रीय)'), number: '181', icon: 'business-outline', color: '#9B2647' },
  { label: tt('साइबर क्राइम'), number: '1930', icon: 'laptop-outline', color: '#1B4A73' },
  { label: tt('चाइल्ड हेल्पलाइन'), number: '1098', icon: 'happy-outline', color: '#C98A2B' },
  { label: tt('एम्बुलेंस'), number: '108', icon: 'medkit-outline', color: '#2E7D5B' },
  { label: tt('फायर ब्रिगेड'), number: '101', icon: 'flame-outline', color: '#B23A2E' },
  { label: tt('CM हेल्पलाइन (UP)'), number: '1076', icon: 'clipboard-outline', color: '#6B4E9B' },
];

// लेबल के आधार पर सही Ionicons नाम — सर्वर पर पुराना/अलग icon नाम सेव हो सकता है
// (जो शायद अब मान्य Ionicons नाम न हो)। इसलिए आइकन हमेशा यहीं से मिलेगा (label के
// आधार पर), सर्वर की icon वैल्यू पर भरोसा नहीं करते।
const HELPLINE_ICON_BY_LABEL = HELPLINES.reduce((acc, h) => {
  acc[h.label] = h.icon;
  return acc;
}, {});
const DEFAULT_HELPLINE_ICON = 'call-outline';

// सर्वर से मिला असली डेटा यहाँ भरा जाता है (AppContext से एक बार कॉल होता है)
export function setHelplinesData(serverHelplines) {
  if (!Array.isArray(serverHelplines) || serverHelplines.length === 0) return;
  HELPLINES.length = 0;
  HELPLINES.push(
    ...serverHelplines.map((h) => ({
      label: h.label,
      number: h.number,
      icon: HELPLINE_ICON_BY_LABEL[h.label] || DEFAULT_HELPLINE_ICON,
      color: h.color,
    }))
  );
}
