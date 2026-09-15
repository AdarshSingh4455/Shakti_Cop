import React from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import RootNavigator from '../navigation/RootNavigator';
import WhatsNewModal from './WhatsNewModal';
import WelcomeScreen from './WelcomeScreen';
import BiometricLockScreen from './BiometricLockScreen';

function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export default function AppGate() {
  const { appSettings, settingsReady, justLoggedIn, biometricLocked, unlockBiometric } = useApp();
  // 🆕 Biometric App-Lock — सिर्फ़ नागरिक भूमिका के लिए, और सिर्फ़ तभी जब
  // नागरिक ने ख़ुद Settings से चालू किया हो (देखें ProfileScreen.js)। अब यह
  // state AppContext में साझा है (देखें वहां की टिप्पणी) — ProfileScreen में
  // टॉगल करते ही यहां तुरंत असर होता है, ऐप दोबारा खोलने की ज़रूरत नहीं।
  if (biometricLocked) {
    return <BiometricLockScreen onUnlock={unlockBiometric} />;
  }

  if (!settingsReady || !appSettings) {
    return (
      <>
        <RootNavigator />
        <WhatsNewModal />
        {justLoggedIn && <WelcomeScreen />}
      </>
    );
  }

  if (appSettings.maintenance_mode?.active) {
    return (
      <View style={styles.container}>
        <Ionicons name="construct-outline" size={56} color={colors.marigold} />
        <Text style={styles.title}>{tt('रखरखाव जारी है')}</Text>
        <Text style={styles.message}>{appSettings.maintenance_mode.message || 'ShaktiCop अभी रखरखाव के लिए बंद है, कृपया थोड़ी देर बाद कोशिश करें।'}</Text>
      </View>
    );
  }

  const currentVersion = Constants.expoConfig?.version || '1.0.0';
  const minVersion = appSettings.min_app_version?.android || '1.0.0';
  if (compareVersions(currentVersion, minVersion) < 0) {
    return (
      <View style={styles.container}>
        <Ionicons name="cloud-download-outline" size={56} color={colors.shaktiMaroon} />
        <Text style={styles.title}>{tt('अपडेट आवश्यक है')}</Text>
        <Text style={styles.message}>
          {appSettings.min_app_version?.forceUpdateMessage || 'कृपया नया वर्शन इंस्टॉल करें, तभी ऐप काम करेगा।'}
        </Text>
        <TouchableOpacity style={styles.updateBtn} onPress={() => Linking.openURL('market://details?id=in.gov.up.shaktikop')}>
          <Text style={styles.updateBtnText}>{tt('अभी अपडेट करें')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <RootNavigator />
      <WhatsNewModal />
      {justLoggedIn && <WelcomeScreen />}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: colors.sand },
  title: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginTop: 16 },
  message: { fontSize: 13, color: colors.inkGrey, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  updateBtn: { backgroundColor: colors.shaktiMaroon, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.md, marginTop: 22 },
  updateBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
