import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { tt } from '../context/LocaleContext';

// किसी भी action (शिकायत दर्ज होना, SOS भेजना, प्रतिक्रिया सुरक्षित होना वगैरह) के पूरा होने पर
// एक छोटा सा checkmark "pop" animation दिखाता है — action पूरा होने का साफ़ एहसास देता है।
// इस्तेमाल: <SuccessOverlay visible={showSuccess} message="शिकायत दर्ज हो गई" />
export default function SuccessOverlay({ visible, message = 'हो गया' }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
      <Animated.View style={[styles.circle, { transform: [{ scale }] }]}>
        <Ionicons name="checkmark" size={44} color={colors.white} />
      </Animated.View>
      {message ? <Text style={styles.message}>{tt(message)}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,42,68,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  circle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  message: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
