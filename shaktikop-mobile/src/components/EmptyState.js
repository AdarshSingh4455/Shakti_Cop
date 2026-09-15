import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { tt } from '../context/LocaleContext';

// ============================================================
// साझा Empty State — पहले हर सूची खाली होने पर सिर्फ़ एक धूसर (grey) लाइन का
// टेक्स्ट दिखती थी ("कोई शिकायत नहीं मिली", "कोई FAQ नहीं है" आदि) — कोई
// मार्गदर्शन नहीं कि आगे क्या करें। अब एक जैसा, आइकॉन के साथ, साफ़ शीर्षक +
// उप-वाक्य (guidance) दिखाने वाला घटक है, और चाहें तो एक कार्रवाई-बटन
// (जैसे "फ़िल्टर हटाएं" / "अभी जोड़ें") भी जोड़ा जा सकता है।
//
// इस्तेमाल:
//   <EmptyState icon="documents-outline" title="कोई शिकायत नहीं मिली"
//     subtitle="इस फ़िल्टर से मेल खाती कोई शिकायत नहीं है।"
//     actionLabel="फ़िल्टर हटाएं" onAction={clearFilters} />
// ============================================================
export default function EmptyState({ icon = 'file-tray-outline', title, subtitle, actionLabel, onAction, compact }) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.iconRing}>
        <Ionicons name={icon} size={compact ? 24 : 30} color={colors.inkLight} />
      </View>
      {title ? <Text style={styles.title}>{tt(title)}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{tt(subtitle)}</Text> : null}
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.actionBtn} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.actionText}>{tt(actionLabel)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, paddingHorizontal: 30 },
  wrapCompact: { paddingVertical: 26 },
  iconRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.sand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 14, fontWeight: '700', color: colors.inkNavy, textAlign: 'center' },
  subtitle: { fontSize: 12, color: colors.inkGrey, textAlign: 'center', marginTop: 6, lineHeight: 17 },
  actionBtn: { marginTop: 16, backgroundColor: colors.shaktiMaroonWash, paddingHorizontal: 18, paddingVertical: 9, borderRadius: radius.md },
  actionText: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
});
