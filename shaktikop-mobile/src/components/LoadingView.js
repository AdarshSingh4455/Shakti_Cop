import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { tt } from '../context/LocaleContext';

// ============================================================
// ऐप के अंदर चलने वाले कामों का लोडर।
//
// सादा घूमता चक्र (ActivityIndicator) खाली स्क्रीन पर अकेला लगता है और
// प्रतीक्षा लंबी महसूस होती है। यहाँ दो विकल्प हैं:
//
//   <LoadingView />          — धड़कता आइकॉन + संदेश (छोटे कामों के लिए)
//   <SkeletonList rows={5} /> — आने वाले content का ढाँचा (सूचियों के लिए)
//
// Skeleton ज़्यादा असरदार होता है — उपयोगकर्ता को पहले ही दिख जाता है कि
// किस आकार का content आ रहा है, इसलिए प्रतीक्षा छोटी लगती है।
// ============================================================

// ---- धड़कता आइकॉन + संदेश ----
export function LoadingView({ message, icon = 'shield-checkmark', compact }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const dots = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(dots, { toValue: 3, duration: 1200, easing: Easing.linear, useNativeDriver: false })
    ).start();
  }, []);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View style={[styles.center, compact && { paddingVertical: 26 }]}>
      <Animated.View style={[styles.iconRing, { transform: [{ scale }], opacity }]}>
        <Ionicons name={icon} size={compact ? 20 : 26} color={colors.shaktiMaroon} />
      </Animated.View>
      <Text style={styles.msg}>{tt(message || 'लोड हो रहा है…')}</Text>
    </View>
  );
}

// ---- सूची का ढाँचा (skeleton) ----
export function SkeletonList({ rows = 5, showAvatar = true }) {
  const shimmer = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={{ padding: 14 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Animated.View key={i} style={[styles.skCard, { opacity: shimmer }]}>
          {showAvatar && <View style={styles.skAvatar} />}
          <View style={{ flex: 1, gap: 7 }}>
            <View style={[styles.skLine, { width: '55%' }]} />
            <View style={[styles.skLine, { width: '85%', height: 10 }]} />
            <View style={[styles.skLine, { width: '40%', height: 10 }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

// ---- कार्ड-ग्रिड का ढाँचा (डैशबोर्ड के आंकड़ों के लिए) ----
export function SkeletonCards({ count = 4 }) {
  const shimmer = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={[styles.skTile, { opacity: shimmer }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, backgroundColor: colors.sand },
  iconRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.shaktiMaroonWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msg: { fontSize: 12.5, color: colors.inkGrey, marginTop: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 30 },
  skCard: {
    flexDirection: 'row',
    gap: 11,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.shaktiMaroonWash },
  skLine: { height: 12, borderRadius: 6, backgroundColor: colors.shaktiMaroonWash },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 },
  skTile: { width: '47%', height: 96, borderRadius: radius.md, backgroundColor: colors.shaktiMaroonWash },
});

export default LoadingView;
