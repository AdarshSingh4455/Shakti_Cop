import React, { useRef, useState, useEffect } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';

// ============================================================
// डैशबोर्ड स्टैट कार्ड — Citizen/Officer/Admin तीनों डैशबोर्ड में एक जैसा
// दिखे इसलिए एक ही जगह से बनाया गया है (पहले तीनों जगह अलग-अलग, हल्के-फुल्के
// अलग स्टाइल वाले flat कार्ड थे)।
//
// जोड़ा गया:
//  • हल्की shadow/elevation — पहले कार्ड बिल्कुल flat थे
//  • दबाने पर scale-down animation — पहले सिर्फ़ opacity बदलती थी
//  • आइकन अब एक अर्ध-पारदर्शी गोल बैज में — पहले सीधे रंगीन बैकग्राउंड पर था
//  • संख्या अब हमेशा 0 से गिनकर ऊपर आती है (पहले सिर्फ़ नागरिक डैशबोर्ड में था)
// ============================================================

function CountUpNumber({ value, style }) {
  const animValue = useRef(new Animated.Value(value || 0)).current;
  // 🐛 बग फ़िक्स (गंभीर): पहले display हमेशा 0 से शुरू होता और animation से असली
  // मान तक "गिनकर" पहुंचता था — यह animation JS-thread पर निर्भर है (useNativeDriver:
  // false, क्योंकि टेक्स्ट-कॉन्टेंट को native driver से animate नहीं किया जा सकता)।
  // अगर डैशबोर्ड लोड होते ही JS-thread व्यस्त हो (डेटा आ रहा हो, कई कार्ड एक साथ
  // animate हो रहे हों), तो यह animation अटक सकती थी — कार्ड "0" या खाली दिखता रहता,
  // जब तक कोई और घटना (जैसे scroll) JS-thread को दोबारा सक्रिय न कर दे। यही "स्क्रॉल
  // करने पर data दिखना" वाली शिकायत की असली वजह थी — सभी डैशबोर्ड (नागरिक/अधिकारी/
  // एडमिन) इसी साझा घटक का इस्तेमाल करते हैं। अब पहली बार में असली मान तुरंत दिखता
  // है (कोई animation-निर्भरता नहीं) — "गिनकर ऊपर आना" सिर्फ़ बाद के अपडेट (जैसे
  // live-refresh) पर होता है, जब कार्ड पहले से स्क्रीन पर मौजूद/दिख चुका होता है।
  const [display, setDisplay] = useState(value || 0);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setDisplay(value || 0); // पहली बार — सीधे असली मान, कोई animation नहीं
      return;
    }
    const id = animValue.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(animValue, { toValue: value || 0, duration: 650, useNativeDriver: false }).start();
    return () => animValue.removeListener(id);
  }, [value]);
  return <Text style={style}>{display}</Text>;
}

export default function DashboardStatCard({ icon, emoji, value, label, color, onPress, active, style, size = 'normal' }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  };

  const isCompact = size === 'compact';

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        style={[styles.card, isCompact && styles.cardCompact, { backgroundColor: color }, active && styles.cardActive]}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={0.9}
      >
        <View style={[styles.iconBadge, isCompact && styles.iconBadgeCompact]}>
          {emoji ? (
            <Text style={isCompact ? styles.emojiCompact : styles.emoji}>{emoji}</Text>
          ) : (
            <Ionicons name={icon} size={isCompact ? 16 : 20} color={colors.white} />
          )}
        </View>
        <CountUpNumber value={value} style={[styles.num, isCompact && styles.numCompact]} />
        <Text style={[styles.label, isCompact && styles.labelCompact]} numberOfLines={2}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: 16,
    minHeight: 116,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardCompact: { padding: 12, minHeight: 90 },
  cardActive: { borderWidth: 2, borderColor: colors.inkNavy },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconBadgeCompact: { width: 28, height: 28, borderRadius: 14, marginBottom: 6 },
  emoji: { fontSize: 18 },
  emojiCompact: { fontSize: 14 },
  num: { fontSize: 24, fontWeight: '800', color: colors.white },
  numCompact: { fontSize: 18 },
  label: { fontSize: 11.5, color: 'rgba(255,255,255,0.92)', marginTop: 3, fontWeight: '600' },
  labelCompact: { fontSize: 10, marginTop: 2 },
});
