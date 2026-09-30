import React, { useEffect, useRef } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import PoliceLogoIcon from './PoliceLogoIcon';
import { useApp } from '../context/AppContext';

const ROLE_LABEL = {
  citizen: 'नागरिक',
  officer: 'अधिकारी',
  admin: 'एडमिन',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'सुप्रभात';
  if (hour < 17) return 'नमस्कार';
  return 'शुभ संध्या';
}

export default function WelcomeScreen() {
  const { role, user, dismissWelcome } = useApp();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => dismissWelcome(), 2600);
    return () => clearTimeout(timer);
  }, []);

  const subtitle =
    role === 'officer'
      ? `${user?.badgeId || ''}${user?.rank ? ' · ' + user.rank : ''}`
      : role === 'admin'
      ? user?.adminRole === 'super_admin'
        ? 'Super Admin'
        : user?.rank
        ? `Monitor · ${user.rank}`
        : `District Admin${user?.district ? ' · ' + user.district : ''}`
      : user?.mobile || '';

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.card, { opacity: fade, transform: [{ scale }] }]}>
        <PoliceLogoIcon size={40} />
        <View style={styles.avatar}>
          <Ionicons name="person-circle" size={32} color={colors.shaktiMaroon} />
        </View>
        <Text style={styles.greeting}>{greeting()},</Text>
        <Text style={styles.name}>{user?.name || 'उपयोगकर्ता'}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={14} color={colors.sage} />
          <Text style={styles.badgeText}>{ROLE_LABEL[role] || ''} के रूप में लॉगिन हुआ</Text>
        </View>

        <TouchableOpacity style={styles.continueBtn} onPress={dismissWelcome}>
          <Text style={styles.continueBtnText}>{tt('आगे बढ़ें')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.shaktiMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  card: { alignItems: 'center', paddingHorizontal: 30 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  avatarText: { fontSize: 34 },
  greeting: { color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: 18 },
  name: { color: colors.white, fontSize: 26, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    marginTop: 20,
  },
  badgeText: { color: colors.white, fontSize: 11.5, fontWeight: '600' },
  continueBtn: { marginTop: 34, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', borderRadius: radius.md, paddingHorizontal: 28, paddingVertical: 11 },
  continueBtnText: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
