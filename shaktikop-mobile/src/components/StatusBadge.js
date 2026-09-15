import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { statusColors } from '../theme/colors';
import { useLocale } from '../context/LocaleContext';

export default function StatusBadge({ status }) {
  const { t } = useLocale();
  const c = statusColors[status] || statusColors['दर्ज'];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{t(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
