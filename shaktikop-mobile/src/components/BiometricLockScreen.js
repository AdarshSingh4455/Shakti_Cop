import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, radius } from '../theme/colors';

export default function BiometricLockScreen({ onUnlock }) {
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const tryUnlock = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      // 🔒 सुरक्षा फ़िक्स (ताला-बंदी का जोखिम): पहले सीधे authenticateAsync() बुलाया
      // जाता था, यह जांचे बिना कि डिवाइस पर कोई पहचान-व्यवस्था बची भी है या नहीं।
      // अगर उपयोगकर्ता ने ऐप-लॉक चालू करने के बाद फ़ोन से अपना फ़िंगरप्रिंट/PIN हटा
      // दिया (या सेंसर ख़राब हो गया), तो सत्यापन हमेशा विफल होता — और अंदर जाने का
      // कोई रास्ता ही नहीं बचता। महिला-सुरक्षा ऐप में इसका मतलब है कि आपात स्थिति
      // में पीड़िता SOS तक नहीं पहुँच सकती।
      //
      // ऐसे में ताला खुला रखना ही सही है, क्योंकि इस ताले का मक़सद है — फ़ोन किसी और
      // के हाथ लगे तो डेटा सुरक्षित रहे। पर जब फ़ोन पर कोई ताला बचा ही नहीं, तो कोई
      // भी उसे वैसे भी इस्तेमाल कर सकता है; ऐप को बंद रखने से कोई सुरक्षा नहीं जुड़ती,
      // बस पीड़िता SOS से कट जाती है।
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        onUnlock();
        setChecking(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: tt('ShaktiCop खोलने के लिए पहचान सत्यापित करें'),
        cancelLabel: tt('रद्द करें'),
        disableDeviceFallback: false, // फ़िंगरप्रिंट/फ़ेस न चले तो डिवाइस के PIN/pattern से भी अनुमति — पूरी तरह बाहर न रहना पड़े
      });
      if (result.success) {
        onUnlock();
      } else if (result.error !== 'user_cancel') {
        setError(tt('पहचान सत्यापित नहीं हो सकी — दोबारा कोशिश करें।'));
      }
    } catch (e) {
      setError(tt('पहचान-जांच उपलब्ध नहीं है — दोबारा कोशिश करें।'));
    }
    setChecking(false);
  }, [onUnlock]);

  // स्क्रीन खुलते ही अपने-आप एक बार कोशिश — नागरिक को हर बार बटन दबाना न पड़े
  useEffect(() => {
    tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="finger-print" size={48} color={colors.white} />
      </View>
      <Text style={styles.title}>{tt('ShaktiCop लॉक है')}</Text>
      <Text style={styles.subtitle}>{tt('आपकी सुरक्षा के लिए — जारी रखने हेतु फ़िंगरप्रिंट/फ़ेस से अनलॉक करें')}</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.unlockBtn} onPress={tryUnlock} disabled={checking}>
        <Ionicons name="lock-open-outline" size={18} color={colors.white} />
        <Text style={styles.unlockBtnText}>{checking ? tt('जांच हो रही है…') : tt('अनलॉक करें')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.shaktiMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    zIndex: 9999,
    elevation: 9999,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.white, marginBottom: 8 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  error: { fontSize: 12, color: '#FFD6D6', marginBottom: 14, textAlign: 'center' },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1.5,
    borderColor: colors.white,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  unlockBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
