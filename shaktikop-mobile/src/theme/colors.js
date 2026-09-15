export const colors = {
  inkNavy: '#0F2A44',
  inkNavyLight: '#1B4A73',
  shaktiMaroon: '#D6336C', // Mission Shakti गुलाबी — पूरे ऐप का मुख्य रंग
  shaktiMaroonLight: '#F06292',
  shaktiMaroonWash: '#FCE4EC',
  sand: '#FDF3F6', // हल्का गुलाबी-सा पृष्ठभूमि रंग
  white: '#FFFFFF',
  marigold: '#C98A2B',
  marigoldWash: '#FBF0DE',
  sage: '#2E7D5B',
  sageWash: '#E7F2EC',
  alert: '#B23A2E',
  alertWash: '#FBEAE8',
  inkGrey: '#5B5750',
  inkLight: '#8A8578',
  border: '#F0DCE4',
};

export const statusColors = {
  'दर्ज': { bg: colors.marigoldWash, fg: colors.marigold },
  'अधिकारी नियुक्त': { bg: '#EAF0F7', fg: colors.inkNavyLight },
  'कार्यवाही जारी': { bg: colors.shaktiMaroonWash, fg: colors.shaktiMaroon },
  'निस्तारित': { bg: colors.sageWash, fg: colors.sage },
  'अस्वीकृत': { bg: colors.alertWash, fg: colors.alert },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 24 };

// सर्वर से Admin का चुना हुआ रंग यहाँ लागू होता है (AppContext से एक बार कॉल होता है)।
// शुरुआती hex से हल्के (light) और धुले (wash) shade अपने-आप निकाले जाते हैं, ताकि पूरा
// theme एक जैसा दिखे — सिर्फ़ मुख्य रंग बदलकर बाकी असंगत न रह जाएं।
function mixWithWhite(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function setThemeColor(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  colors.shaktiMaroon = hex;
  colors.shaktiMaroonLight = mixWithWhite(hex, 0.35);
  colors.shaktiMaroonWash = mixWithWhite(hex, 0.92);
  // statusColors ने बनते समय मूल्य copy किए थे (live reference नहीं) — इन्हें भी ताज़ा करते हैं
  statusColors['कार्यवाही जारी'] = { bg: colors.shaktiMaroonWash, fg: colors.shaktiMaroon };
}
