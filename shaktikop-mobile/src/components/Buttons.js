import React, { useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, ActivityIndicator, View } from 'react-native';
import { colors, radius } from '../theme/colors';

// दोनों बटन अब: (1) दबाने पर हल्का scale-down feedback देते हैं, (2) loading prop मिलने पर
// अंदर ही spinner दिखाते हैं (बटन का shape/जगह बदले बिना), (3) disabled होने पर धुंधले दिखते हैं।

// दोनों बटन अब: (1) दबाने पर हल्का scale-down feedback देते हैं, (2) loading prop मिलने पर
// अंदर ही spinner दिखाते हैं (बटन का shape/जगह बदले बिना), (3) disabled होने पर धुंधले दिखते हैं,
// (4) स्क्रीन-रीडर (TalkBack/VoiceOver) के लिए अपने-आप सही accessibility जानकारी देते हैं —
// title से label बन जाता है, loading/disabled होने पर state भी बताई जाती है। पूरे ऐप में
// यही दो बटन component हर जगह इस्तेमाल होते हैं, इसलिए यह एक बदलाव पूरे ऐप को कवर कर लेता है।

export function PrimaryButton({ title, onPress, style, loading = false, disabled = false, accessibilityLabel }) {
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;
  const onPressIn = () => !isDisabled && Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.primary, isDisabled && styles.primaryDisabled, style]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.85}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.white} size="small" />
            <Text style={styles.primaryText}>{title}</Text>
          </View>
        ) : (
          <Text style={styles.primaryText}>{title}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export function SecondaryButton({ title, onPress, style, loading = false, disabled = false, accessibilityLabel }) {
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;
  const onPressIn = () => !isDisabled && Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.secondary, isDisabled && styles.secondaryDisabled, style]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.8}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.shaktiMaroon} size="small" />
            <Text style={styles.secondaryText}>{title}</Text>
          </View>
        ) : (
          <Text style={styles.secondaryText}>{title}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.shaktiMaroon,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: colors.white, fontSize: 15.5, fontWeight: '700' },
  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  secondaryDisabled: { opacity: 0.6 },
  secondaryText: { color: colors.inkNavy, fontSize: 14.5, fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
