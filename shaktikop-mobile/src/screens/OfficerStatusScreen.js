import React, { useState, useEffect, useCallback, useRef } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { SkeletonList } from '../components/LoadingView';
const STATUS_DEFS = [
  { key: 'उपलब्ध', label: 'उपलब्ध', icon: 'checkmark-circle', color: colors.sage },
  { key: 'अवकाश पर', label: 'अवकाश पर', icon: 'bed-outline', color: colors.marigold },
  { key: 'अन्य ड्यूटी पर', label: 'अन्य ड्यूटी पर', icon: 'briefcase-outline', color: colors.inkNavy },
  { key: 'ज़िले से बाहर', label: 'ज़िले से बाहर', icon: 'airplane-outline', color: colors.shaktiMaroon },
];

const AUTO_REFRESH_MS = 20000;

export default function OfficerStatusScreen() {
  const { fetchOfficerStatusOverview } = useApp();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await fetchOfficerStatusOverview();
      setData(d);
    } catch (e) {
      // चुपचाप छोड़ें — अगली auto-refresh पर फिर कोशिश होगी
    }
    if (!silent) setLoading(false);
  }, [fetchOfficerStatusOverview]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), AUTO_REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  if (loading || !data) {
    return (
      <View style={styles.container}>
        <SkeletonList rows={5} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('अधिकारी स्थिति — Live')}</Text>
        <View style={styles.liveDot}>
          <View style={styles.liveDotInner} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>
      <Text style={styles.hint}>कुल {data.total} सक्रिय अधिकारी · हर {AUTO_REFRESH_MS / 1000} सेकंड में अपने-आप ताज़ा होता है</Text>

      <View style={styles.summaryGrid}>
        {STATUS_DEFS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.summaryCard, { borderLeftColor: s.color }, expanded === s.key && styles.summaryCardActive]}
            onPress={() => setExpanded(expanded === s.key ? null : s.key)}
            activeOpacity={0.85}
          >
            <Ionicons name={s.icon} size={22} color={s.color} />
            <Text style={styles.summaryNum}>{data.counts[s.key] || 0}</Text>
            <Text style={styles.summaryLabel}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {STATUS_DEFS.map((s) => {
        if (expanded && expanded !== s.key) return null;
        const officers = data.groups[s.key] || [];
        if (officers.length === 0) return null;
        return (
          <View key={s.key} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Ionicons name={s.icon} size={16} color={s.color} />
              <Text style={[styles.groupTitle, { color: s.color }]}>{s.label} ({officers.length})</Text>
            </View>
            {officers.map((o) => (
              <View key={o.id} style={styles.officerRow}>
                <View style={[styles.officerDot, { backgroundColor: s.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.officerName}>{o.name} {o.rank ? `(${o.rank})` : ''}</Text>
                  <Text style={styles.officerMeta}>{o.badgeId} · {o.station || '—'} {o.district ? `· ${o.district}` : ''}</Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}

      {data.total === 0 && <Text style={styles.emptyText}>{tt('कोई सक्रिय अधिकारी नहीं मिला।')}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  liveDot: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.sageWash, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  liveDotInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.sage },
  liveText: { fontSize: 10, fontWeight: '800', color: colors.sage, letterSpacing: 0.5 },
  hint: { fontSize: 11, color: colors.inkLight, marginTop: 6, marginBottom: 16 },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  summaryCard: { width: '47%', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, borderLeftWidth: 4 },
  summaryCardActive: { borderWidth: 1.5, borderColor: colors.inkNavy },
  summaryNum: { fontSize: 24, fontWeight: '800', color: colors.inkNavy, marginTop: 8 },
  summaryLabel: { fontSize: 11.5, color: colors.inkGrey, marginTop: 2 },

  groupCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 12 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  groupTitle: { fontSize: 13.5, fontWeight: '700' },
  officerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  officerDot: { width: 8, height: 8, borderRadius: 4 },
  officerName: { fontSize: 13, fontWeight: '700', color: colors.inkNavy },
  officerMeta: { fontSize: 10.5, color: colors.inkGrey, marginTop: 2 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 40 },
});
