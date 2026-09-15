import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius, spacing } from './colors';

// ============================================================
// रूप-रंग (Appearance) — Super Admin द्वारा तय की गई सेटिंग्स को
// पूरे ऐप पर लागू करने का ढांचा।
//
// ⚠️ यह कैसे काम करता है, यह समझना ज़रूरी है:
// React Native में हर स्क्रीन अपनी StyleSheet एक बार, module लोड होते समय
// बनाती है। इसलिए रंग/आकार बदलने के लिए यह ज़रूरी है कि बदलाव **स्क्रीनें
// लोड होने से पहले** लागू हो जाएं। इसीलिए यहाँ theme को AsyncStorage में
// संजोकर रखा जाता है और ऐप शुरू होते ही, नेविगेशन बनने से पहले, colors व
// radius ऑब्जेक्ट को उसी जगह बदल दिया जाता है।
//
// नतीजा: Super Admin बदलाव सहेजता है → सर्वर व फ़ोन दोनों में सुरक्षित →
// **ऐप अगली बार खुलने पर** नया रूप पूरे ऐप में दिखता है। इसलिए स्क्रीन पर
// साफ़ लिखा है कि बदलाव देखने के लिए ऐप दोबारा खोलें।
// ============================================================

const THEME_KEY = 'shaktikop:appearance';

export const COLOR_PRESETS = [
  { key: 'shakti_pink', label: 'मिशन शक्ति गुलाबी', primary: '#D6336C', light: '#F06292', wash: '#FCE4EC', sand: '#FDF3F6', border: '#F0DCE4' },
  { key: 'police_maroon', label: 'पुलिस मैरून', primary: '#7A1836', light: '#9B2647', wash: '#F5E4EA', sand: '#FBF6F7', border: '#EBD9DE' },
  { key: 'ink_navy', label: 'गहरा नीला', primary: '#0F2A44', light: '#1B4A73', wash: '#E3EAF2', sand: '#F5F7FA', border: '#DCE3EB' },
  { key: 'forest', label: 'हरा (वन)', primary: '#1F5F46', light: '#2E7D5B', wash: '#E4F0EA', sand: '#F5FAF7', border: '#D8E7DF' },
  { key: 'saffron', label: 'केसरिया', primary: '#B26A00', light: '#D98C1F', wash: '#FBEEDA', sand: '#FDF8F0', border: '#EFE0C8' },
  { key: 'royal', label: 'बैंगनी', primary: '#5B3A8E', light: '#7B57B0', wash: '#EDE5F7', sand: '#F8F5FC', border: '#E0D6EE' },
];

export const SHAPE_PRESETS = [
  { key: 'sharp', label: 'नुकीले कोने', sm: 2, md: 4, lg: 6 },
  { key: 'soft', label: 'हल्के गोल', sm: 6, md: 10, lg: 14 },
  { key: 'rounded', label: 'गोल (डिफ़ॉल्ट)', sm: 8, md: 12, lg: 16 },
  { key: 'pill', label: 'ज़्यादा गोल', sm: 12, md: 18, lg: 24 },
];

export const DENSITY_PRESETS = [
  { key: 'compact', label: 'सघन — ज़्यादा डेटा एक स्क्रीन में', factor: 0.75 },
  { key: 'normal', label: 'सामान्य (डिफ़ॉल्ट)', factor: 1 },
  { key: 'comfortable', label: 'खुला — पढ़ने में आसान', factor: 1.25 },
];

export const TABLE_STYLES = [
  { key: 'striped', label: 'एक-एक पंक्ति रंगीन' },
  { key: 'bordered', label: 'हर खाने में लकीर' },
  { key: 'plain', label: 'सादा' },
];

export const CARD_STYLES = [
  { key: 'elevated', label: 'उभरे हुए (छाया के साथ)' },
  { key: 'outlined', label: 'सिर्फ़ किनारा' },
  { key: 'flat', label: 'सपाट' },
];

export const DEFAULT_APPEARANCE = {
  colorPreset: 'shakti_pink',
  customPrimary: '',
  shape: 'rounded',
  density: 'normal',
  tableStyle: 'striped',
  cardStyle: 'outlined',
  menuIcons: true,
};

// वर्तमान में लागू सेटिंग्स — स्क्रीनें इसे पढ़कर तालिका/कार्ड का रूप तय करती हैं
export let appearance = { ...DEFAULT_APPEARANCE };

function isHex(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

// रंग को हल्का करें — wash/border अपने-आप बनाने के लिए
function lighten(hex, amount) {
  try {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amount));
    const g = Math.min(255, Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amount));
    const b = Math.min(255, Math.round((n & 255) + (255 - (n & 255)) * amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  } catch (e) {
    return hex;
  }
}

// ---- theme को असल में लागू करें ----
// colors/radius/spacing ऑब्जेक्ट को जगह पर ही बदलते हैं, ताकि जो भी module
// इन्हें import करता है उसे नए मान मिलें।
export function applyAppearance(next) {
  const a = { ...DEFAULT_APPEARANCE, ...(next || {}) };
  appearance = a;

  const preset = COLOR_PRESETS.find((p) => p.key === a.colorPreset) || COLOR_PRESETS[0];
  const primary = isHex(a.customPrimary) ? a.customPrimary : preset.primary;

  colors.shaktiMaroon = primary;
  colors.shaktiMaroonLight = isHex(a.customPrimary) ? lighten(primary, 0.25) : preset.light;
  colors.shaktiMaroonWash = isHex(a.customPrimary) ? lighten(primary, 0.85) : preset.wash;
  colors.sand = isHex(a.customPrimary) ? lighten(primary, 0.94) : preset.sand;
  colors.border = isHex(a.customPrimary) ? lighten(primary, 0.8) : preset.border;

  const shape = SHAPE_PRESETS.find((s) => s.key === a.shape) || SHAPE_PRESETS[2];
  radius.sm = shape.sm;
  radius.md = shape.md;
  radius.lg = shape.lg;

  const dens = DENSITY_PRESETS.find((d) => d.key === a.density) || DENSITY_PRESETS[1];
  spacing.xs = Math.round(4 * dens.factor);
  spacing.sm = Math.round(8 * dens.factor);
  spacing.md = Math.round(12 * dens.factor);
  spacing.lg = Math.round(16 * dens.factor);
  spacing.xl = Math.round(24 * dens.factor);

  return a;
}

// ---- ऐप शुरू होते ही — स्क्रीनें बनने से पहले ----
export async function loadSavedAppearance() {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    if (raw) return applyAppearance(JSON.parse(raw));
  } catch (e) {
    // सुरक्षित रूप से डिफ़ॉल्ट पर बने रहें
  }
  return applyAppearance(DEFAULT_APPEARANCE);
}

// ---- Super Admin के बदलाव सहेजें ----
export async function saveAppearance(next) {
  const a = { ...DEFAULT_APPEARANCE, ...(next || {}) };
  try {
    await AsyncStorage.setItem(THEME_KEY, JSON.stringify(a));
  } catch (e) {
    // ignore
  }
  return a;
}

// ---- कार्ड व तालिका के लिए तैयार styles ----
// (जो स्क्रीनें चलते-चलते रूप बदल सकें, वे इन्हें इस्तेमाल करती हैं)
export function cardStyle() {
  if (appearance.cardStyle === 'elevated') {
    return {
      backgroundColor: colors.white,
      borderRadius: radius.md,
      shadowColor: colors.inkNavy,
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    };
  }
  if (appearance.cardStyle === 'flat') {
    return { backgroundColor: colors.white, borderRadius: radius.md };
  }
  return { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border };
}

export function tableRowStyle(index) {
  if (appearance.tableStyle === 'striped') {
    return index % 2 === 1 ? { backgroundColor: colors.sand } : { backgroundColor: colors.white };
  }
  if (appearance.tableStyle === 'bordered') {
    return { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border };
  }
  return { backgroundColor: colors.white };
}
