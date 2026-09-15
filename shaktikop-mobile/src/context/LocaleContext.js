import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPublicLocales, fetchPublicTranslations } from '../services/api';
import { DISTRICTS_EN_MAP, STATIONS_EN_FLAT } from '../data/districts';
import { TRANSLATIONS } from './translationDictionary';

const LocaleContext = createContext(null);
const LOCALE_KEY = 'shaktikop:locale';

// ============================================================
// अनुवाद शब्दकोश — हिंदी वाक्य को कुँजी मानकर अंग्रेज़ी अनुवाद देता है।
// स्क्रीन कोड में सिर्फ़ t(हिंदी टेक्स्ट) जैसा एक कॉल लगाना होता है — उदाहरण के तौर पर।
// अगर कोई स्ट्रिंग यहाँ न मिले, तो t() हिंदी वापस दे देता है (crash नहीं होता) —
// इसलिए नई स्क्रीन/टेक्स्ट जोड़ने पर बस translationDictionary.js में एक लाइन डालनी होती है।
// ============================================================

// ============================================================
// tt() — बिना hook वाला अनुवाद function।
// 48 स्क्रीनों में hook जोड़ना जोखिम भरा है, इसलिए यह module-स्तर पर मौजूदा भाषा पढ़ता है।
// भाषा बदलते ही LocaleProvider की state बदलती है → उसके नीचे की सारी स्क्रीनें दोबारा render
// होती हैं और तभी tt() नई भाषा लौटाता है। इसलिए यह hook जैसा ही भरोसेमंद है, पर सुरक्षित।
// ============================================================
let _locale = 'hi';
let _dynamic = {};

export function tt(hindiText) {
  if (typeof hindiText !== 'string') return hindiText;
  if (_locale === 'hi') return hindiText;
  const serverMap = _dynamic[_locale];
  if (serverMap && serverMap[hindiText]) return serverMap[hindiText];
  if (_locale === 'en') {
    // 🐛 बग फ़िक्स: पहले सिर्फ़ नीचे दी गई hardcoded TRANSLATIONS dictionary देखी जाती
    // थी — जिसमें सिर्फ़ "प्रमुख ज़िलों के थाने" थे (कोड में टिप्पणी में साफ़ लिखा था)।
    // UP के 1500+ असली थानों में से ज़्यादातर अंग्रेज़ी मोड में भी हिंदी में ही दिखते
    // रहते। अब Super Admin द्वारा police_stations तालिका में भरा गया असली अंग्रेज़ी
    // नाम (डेटा-आधारित, हर नए थाने के साथ अपने-आप सही) पहले जांचा जाता है — hardcoded
    // dictionary अब सिर्फ़ fallback है (पुराने/अभी-तक-न-भरे डेटा के लिए)।
    return DISTRICTS_EN_MAP[hindiText] || STATIONS_EN_FLAT[hindiText] || TRANSLATIONS[hindiText] || hindiText;
  }
  return hindiText;
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState('hi');
  const [availableLocales, setAvailableLocales] = useState([
    { code: 'hi', label: 'हिंदी' },
    { code: 'en', label: 'English' },
  ]);
  // ✅ हर भाषा का अनुवाद यहीं cache होता है — hi/en के अलावा Admin जो भी नई भाषा जोड़ें
  const [dynamicTranslations, setDynamicTranslations] = useState({});

  const loadLocalesList = useCallback(async () => {
    try {
      const locales = await fetchPublicLocales();
      if (Array.isArray(locales) && locales.length > 0) setAvailableLocales(locales);
    } catch (e) {
      // सर्वर से न मिले तो fallback hi/en इस्तेमाल होती रहेगी
    }
  }, []);

  const loadTranslationsFor = useCallback(async (code) => {
    if (code === 'hi' || dynamicTranslations[code]) return; // हिंदी को अनुवाद नहीं चाहिए, cache में हो तो दोबारा न लाएं
    try {
      const map = await fetchPublicTranslations(code);
      setDynamicTranslations((prev) => ({ ...prev, [code]: map }));
    } catch (e) {
      // ऑफ़लाइन हों तो चुपचाप छोड़ें — hardcoded TRANSLATIONS (English के लिए) fallback रहेगी
    }
  }, [dynamicTranslations]);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(LOCALE_KEY);
      if (saved) setLocaleState(saved);
      await loadLocalesList();
      await loadTranslationsFor(saved || 'hi');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(
    async (next) => {
      setLocaleState(next);
      await AsyncStorage.setItem(LOCALE_KEY, next);
      await loadTranslationsFor(next);
    },
    [loadTranslationsFor]
  );

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'hi' ? 'en' : 'hi');
  }, [locale, setLocale]);

  // module-स्तर की copy हमेशा ताज़ा रखें ताकि tt() सही भाषा लौटाए
  _locale = locale;
  _dynamic = dynamicTranslations;

  const t = useCallback(
    (hindiText) => {
      if (locale === 'hi') return hindiText;
      // पहले सर्वर से आया अनुवाद, न मिले तो built-in fallback (सिर्फ़ English के लिए), वरना हिंदी ही
      const serverMap = dynamicTranslations[locale];
      if (serverMap && serverMap[hindiText]) return serverMap[hindiText];
      if (locale === 'en') return TRANSLATIONS[hindiText] || hindiText;
      return hindiText;
    },
    [locale, dynamicTranslations]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, toggleLocale, t, availableLocales }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale को LocaleProvider के अंदर इस्तेमाल करें');
  return ctx;
}
