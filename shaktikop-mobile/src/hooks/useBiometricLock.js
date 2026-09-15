import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// 🆕 Biometric App-Lock (नागरिक ऐप)
//
// अगर फ़ोन किसी और के हाथ लग जाए (खो जाए, चोरी हो, या घर पर कोई और इस्तेमाल
// करे), पहले ऐप खुलते ही सीधे संवेदनशील शिकायत-इतिहास दिखा देता था — किसी भी
// अतिरिक्त सुरक्षा-परत के बिना (सिर्फ़ device का अपना lock-screen, जो अक्सर
// बंद ही नहीं होता)। अब — अगर नागरिक ने चालू किया हो — ऐप हर बार खुलने पर
// (और background से वापस आने पर) फ़िंगरप्रिंट/फ़ेस-अनलॉक मांगता है।
//
// यह पूरी तरह स्थानीय (device-only) प्राथमिकता है — सर्वर पर सेव नहीं होती,
// क्योंकि यह एक ही डिवाइस से जुड़ी सुरक्षा-सेटिंग है।
// ============================================================

const STORAGE_KEY = 'shaktikop:biometricLockEnabled';

export async function isBiometricLockEnabled() {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === 'true';
  } catch (e) {
    return false;
  }
}

export async function setBiometricLockEnabled(enabled) {
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
}

export async function isBiometricAvailable() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch (e) {
    return false;
  }
}

// role दिए जाने पर (सिर्फ़ 'citizen' के लिए यह सुविधा है) — लॉक की स्थिति व
// unlock करने का तरीक़ा देता है।
export function useBiometricLock(role) {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const checkedOnce = useRef(false);
  const prevRole = useRef(null);

  useEffect(() => {
    if (role !== 'citizen') {
      setLocked(false);
      // 🐛 बग फ़िक्स: अगर एक ही डिवाइस पर पहले किसी citizen ने लॉक चालू किया हो, फिर
      // logout करके कोई *दूसरा* citizen खाता login करे (बिना app बंद किए) — checkedOnce
      // पहले account से true रह जाता, इसलिए नए (fresh) session पर लॉक दोबारा कभी नहीं
      // ट्रिगर होता। भूमिका citizen से हटने पर checkedOnce रीसेट करते हैं, ताकि अगली
      // बार citizen भूमिका में वापसी को "नया प्रवेश" माना जाए।
      checkedOnce.current = false;
      prevRole.current = role;
      return;
    }
    let cancelled = false;
    isBiometricLockEnabled().then((val) => {
      if (cancelled) return;
      setEnabled(val);
      if (val && !checkedOnce.current) {
        setLocked(true);
      }
      checkedOnce.current = true;
    });
    prevRole.current = role;
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    if (role !== 'citizen' || !enabled) return;
    const sub = AppState.addEventListener('change', (next) => {
      // background/inactive से वापस active होने पर दोबारा लॉक — बीच में स्क्रीन
      // बदलने (जैसे notification खोलना) पर बार-बार न पूछे, इसलिए सिर्फ़ असल
      // background-transition पर ही ट्रिगर होता है
      if (appState.current.match(/inactive|background/) && next === 'active') {
        setLocked(true);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [role, enabled]);

  const unlock = () => setLocked(false);

  return { locked: role === 'citizen' && enabled && locked, enabled, unlock, setEnabled };
}
