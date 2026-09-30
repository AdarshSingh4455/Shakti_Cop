import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { SkeletonList } from '../components/LoadingView';
const MEDAL_COLORS = ['#C9962B', '#9CA3AF', '#B87333'];

// 🆕 पहले यह लिस्ट हमेशा hamesha-हर-समय (all-time), सिर्फ़ "निस्तारित" के हिसाब से
// क्रमबद्ध दिखती थी — बैकएंड में sortBy/date-range/station फ़िल्टर पहले से जुड़ चुके
// थे, पर यह स्क्रीन उन्हें इस्तेमाल ही नहीं कर रही थी। अब क्रम बदल सकते हैं और
// समय-सीमा से फ़िल्टर कर सकते हैं।
const SORT_OPTIONS = [
  { key: 'resolved', label: 'निस्तारित (संख्या)' },
  { key: 'resolutionRate', label: 'निस्तारण दर' },
  { key: 'avgRating', label: 'रेटिंग' },
  { key: 'avgResolutionHours', label: 'औसत समय (कम बेहतर)' },
];
const DATE_PRESETS = [
  { key: 'all', label: 'सभी समय', days: null },
  { key: '30d', label: '30 दिन', days: 30 },
  { key: '90d', label: '90 दिन', days: 90 },
];

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

export default function AdminLeaderboardScreen({ route }) {
  const { fetchOfficerLeaderboard, user } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState([]);
  const [sortBy, setSortBy] = useState('resolved');
  const [datePreset, setDatePreset] = useState('all');
  // 🆕 District/Station Explorer से आने पर सिर्फ़ उसी थाने के अधिकारी दिखते हैं
  const presetStation = route?.params?.presetStation || null;

  const filters = useMemo(() => {
    const preset = DATE_PRESETS.find((p) => p.key === datePreset);
    const base = { sortBy, station: presetStation || undefined };
    if (!preset?.days) return base;
    const from = new Date();
    from.setDate(from.getDate() - preset.days);
    return { ...base, dateFrom: fmtDate(from), dateTo: fmtDate(new Date()) };
  }, [sortBy, datePreset, presetStation]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOfficerLeaderboard(filters);
      setList(data);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [fetchOfficerLeaderboard, filters]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchOfficerLeaderboard(filters);
      setList(data);
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
          ListHeaderComponent={
            <>
              <Text style={styles.h2}>{tt('अधिकारी Leaderboard')}</Text>
              {presetStation ? (
                <View style={styles.stationChip}>
                  <Ionicons name="business-outline" size={13} color={colors.white} />
                  <Text style={styles.stationChipText}>{tt(presetStation)}</Text>
                </View>
              ) : user?.rangeDistricts && user.rangeDistricts.length > 0 ? (
                <View style={styles.scopeNoteRow}>
                  <Ionicons name="location-outline" size={13} color={colors.inkGrey} />
                  <Text style={styles.scopeNote}>{tt('आपका Range')}: {user.rangeDistricts.map((d) => tt(d)).join(', ')}</Text>
                </View>
              ) : user?.circleStations && user.circleStations.length > 0 ? (
                <View style={styles.scopeNoteRow}>
                  <Ionicons name="location-outline" size={13} color={colors.inkGrey} />
                  <Text style={styles.scopeNote}>{tt('आपका सर्किल')}: {user.circleStations.map((s) => tt(s)).join(', ')}</Text>
                </View>
              ) : user?.district && (user?.adminRole === 'district_admin' || user?.adminRole === 'monitor') ? (
                <View style={styles.scopeNoteRow}>
                  <Ionicons name="location-outline" size={13} color={colors.inkGrey} />
                  <Text style={styles.scopeNote}>{tt('आपका ज़िला')}: {tt(user.district)}</Text>
                </View>
              ) : null}
              <Text style={styles.filterSectionLabel}>{tt('क्रम')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {SORT_OPTIONS.map((o) => (
                  <TouchableOpacity key={o.key} style={[styles.pillBtn, sortBy === o.key && styles.pillBtnActive]} onPress={() => setSortBy(o.key)}>
                    <Text style={[styles.pillBtnText, sortBy === o.key && styles.pillBtnTextActive]}>{tt(o.label)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.filterSectionLabel}>{tt('समय-सीमा')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {DATE_PRESETS.map((p) => (
                  <TouchableOpacity key={p.key} style={[styles.pillBtn, datePreset === p.key && styles.pillBtnActive]} onPress={() => setDatePreset(p.key)}>
                    <Text style={[styles.pillBtnText, datePreset === p.key && styles.pillBtnTextActive]}>{tt(p.label)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          }
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={[styles.rankCircle, index < 3 && { backgroundColor: MEDAL_COLORS[index] }]}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.badgeId} · {item.station || '—'}</Text>
                <View style={styles.statsRow}>
                  <Text style={styles.stat}>{item.totalAssigned} कुल</Text>
                  <Text style={styles.stat}>{item.resolved} निस्तारित</Text>
                  <Text style={styles.stat}>{item.resolutionRate}% दर</Text>
                  {item.avgRating && (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={11} color={colors.marigold} />
                      <Text style={styles.stat}>{item.avgRating}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="trophy-outline" size={40} color={colors.border} />
              <Text style={styles.emptyText}>{tt('कोई अधिकारी नहीं मिला।')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  list: { padding: 16 },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginBottom: 6 },
  scopeNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: 10 },
  scopeNote: { flex: 1, fontSize: 11.5, color: colors.shaktiMaroon, fontWeight: '700' },
  stationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: colors.shaktiMaroon,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  stationChipText: { fontSize: 11.5, fontWeight: '700', color: colors.white },
  filterSectionLabel: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey, marginBottom: 8 },
  pillBtn: { backgroundColor: colors.white, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 13, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  pillBtnActive: { backgroundColor: colors.shaktiMaroon, borderColor: colors.shaktiMaroon },
  pillBtnText: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey },
  pillBtnTextActive: { color: colors.white },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rankCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: '800', color: colors.inkNavy },
  name: { fontSize: 14, fontWeight: '700', color: colors.inkNavy },
  meta: { fontSize: 11, color: colors.inkLight, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  stat: { fontSize: 10.5, color: colors.inkGrey, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  emptyBox: { alignItems: 'center', marginTop: 40 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 10 },
});
