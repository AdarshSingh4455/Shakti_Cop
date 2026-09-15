import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { categoryDef } from '../data/constants';
import { useLocale } from '../context/LocaleContext';
import StatusBadge from './StatusBadge';
import LiveLocationStatus from './LiveLocationStatus';
import TimelineStepper from './TimelineStepper';

import { formatDateShort } from '../utils/datetime';
export default function ComplaintCard({ complaint, onPress }) {
  const { t, locale } = useLocale();
  // तारीख़ हमेशा अंग्रेज़ी में — ऐप की भाषा चाहे जो हो
  const dateLabel = formatDateShort(complaint.createdAt);
  const cat = categoryDef(complaint.category);

  return (
    <TouchableOpacity style={[styles.card, { borderLeftColor: cat.color }]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.row1}>
        <View style={[styles.iconWrap, { backgroundColor: cat.color }]}>
          <Ionicons name={cat.icon} size={16} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cid}>{complaint.id}</Text>
          <Text style={styles.cat}>{t(complaint.category)}</Text>
        </View>
        <StatusBadge status={complaint.status} />
      </View>
      <Text style={styles.desc} numberOfLines={2}>
        {complaint.description || `${t('पीड़ित')}: ${complaint.victimName || '—'}`}
      </Text>
      <View style={styles.stepperWrap}>
        <TimelineStepper status={complaint.status} size="mini" />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLocation} numberOfLines={1} ellipsizeMode="tail">
          📍 {complaint.location || t('लाइव लोकेशन')}
        </Text>
        <Text style={styles.metaDate}>{dateLabel}</Text>
      </View>
      <LiveLocationStatus complaint={complaint} compact />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  row1: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cid: { fontSize: 11, color: colors.inkLight, fontWeight: '600' },
  cat: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginTop: 3 },
  desc: { fontSize: 12.5, color: colors.inkGrey, marginTop: 8, lineHeight: 18 },
  stepperWrap: { marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, gap: 8 },
  metaLocation: { fontSize: 11.5, color: colors.inkLight, flex: 1 },
  metaDate: { fontSize: 11.5, color: colors.inkLight, flexShrink: 0 },
});
