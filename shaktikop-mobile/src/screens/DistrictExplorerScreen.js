import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { LoadingView } from '../components/LoadingView';

// 🆕 District → Station Explorer — पहले district/थाना-वार डेटा सिर्फ़ एक साधारण
// bar-chart (सिर्फ़ शिकायत-गिनती) के रूप में मिलता था। अब हर district/थाने के
// पूरे KPIs (निस्तारण-दर, औसत-समय, SOS, रेटिंग) एक तुलनात्मक तालिका में — और एक
// district चुनकर उसके अंदर के सभी थानों तक drill-down किया जा सकता है, फिर एक
// थाना चुनकर सीधे उसका पूरा Analytics या Performance खोला जा सकता है।
export default function DistrictExplorerScreen({ navigation }) {
  const { fetchDistrictsSummary, fetchStationsSummary, user } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [level, setLevel] = useState('district'); // 'district' | 'station'
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [districts, setDistricts] = useState([]);
  const [stations, setStations] = useState([]);
  const [actionSheet, setActionSheet] = useState(null); // चुना हुआ थाना/district जिसके लिए "देखें" मेन्यू खुला है

  const loadDistricts = useCallback(async () => {
    const data = await fetchDistrictsSummary();
    setDistricts(data);
    // district-scoped admin के लिए सिर्फ़ एक ही district आता है — सीधे उसी में drill-down कर दें
    if (data.length === 1 && user?.adminRole !== 'super_admin') {
      setSelectedDistrict(data[0].district);
      const st = await fetchStationsSummary(data[0].district);
      setStations(st);
      setLevel('station');
    }
  }, [fetchDistrictsSummary, fetchStationsSummary, user]);

  useEffect(() => {
    setLoading(true);
    loadDistricts().finally(() => setLoading(false));
  }, [loadDistricts]);

  const openDistrict = async (district) => {
    setLoading(true);
    setSelectedDistrict(district);
    try {
      const data = await fetchStationsSummary(district);
      setStations(data);
      setLevel('station');
    } catch (e) {
      // ignore
    }
    setLoading(false);
  };

  const goBackToDistricts = () => {
    setLevel('district');
    setSelectedDistrict(null);
    setStations([]);
  };

  const onPullRefresh = async () => {
    setRefreshing(true);
    if (level === 'district') {
      await loadDistricts();
    } else if (selectedDistrict) {
      const data = await fetchStationsSummary(selectedDistrict);
      setStations(data);
    }
    setRefreshing(false);
  };

  const openStationAction = (station) => setActionSheet(station);

  const goToAnalytics = () => {
    const target = actionSheet;
    setActionSheet(null);
    navigation.navigate('AdminAnalytics', {
      presetStation: level === 'station' ? target.station : null,
    });
  };

  const goToLeaderboard = () => {
    const target = actionSheet;
    setActionSheet(null);
    navigation.navigate('AdminLeaderboard', {
      presetStation: level === 'station' ? target.station : null,
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingView />
      </View>
    );
  }

  const list = level === 'district' ? districts : stations;
  const maxTotal = Math.max(1, ...list.map((r) => r.total));

  return (
    <View style={styles.container}>
      {level === 'station' && (
        <TouchableOpacity style={styles.backRow} onPress={goBackToDistricts}>
          <Ionicons name="chevron-back" size={18} color={colors.shaktiMaroon} />
          <Text style={styles.backText}>{tt('सभी ज़िले')}</Text>
        </TouchableOpacity>
      )}
      <View style={styles.headerRow}>
        <Text style={styles.h2}>
          {level === 'district' ? tt('ज़िला-वार तुलना') : `${tt(selectedDistrict)} — ${tt('थाना-वार तुलना')}`}
        </Text>
        <Text style={styles.countBadge}>{list.length}</Text>
      </View>

      <FlatList
        data={list}
        keyExtractor={(item, i) => (level === 'district' ? item.district : item.station) || String(i)}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
        renderItem={({ item, index }) => {
          const name = level === 'district' ? item.district : item.station;
          const rateColor = item.resolutionRate >= 60 ? colors.sage : item.resolutionRate >= 30 ? colors.marigold : colors.alert;
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => (level === 'district' ? openDistrict(item.district) : openStationAction(item))}
            >
              <View style={styles.cardTop}>
                <View style={styles.rankCircle}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{tt(name)}</Text>
                  <Text style={styles.cardSub}>
                    {level === 'district'
                      ? `${item.stationCount} ${tt('थाने')}`
                      : `${item.officerCount} ${tt('अधिकारी')}`}
                  </Text>
                </View>
                <View style={[styles.rateBadge, { backgroundColor: rateColor }]}>
                  <Text style={styles.rateBadgeText}>{item.resolutionRate}%</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
              </View>

              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(item.total / maxTotal) * 100}%` }]} />
              </View>

              <View style={styles.statsRow}>
                <StatChip icon="documents-outline" value={item.total} label={tt('कुल')} />
                <StatChip icon="checkmark-done-outline" value={item.resolved} label={tt('निस्तारित')} />
                <StatChip icon="hourglass-outline" value={item.pending} label={tt('लंबित')} />
                <StatChip icon="alert-circle-outline" value={item.sosCount} label={tt('SOS')} color={colors.alert} />
                {item.avgResolutionHours && <StatChip icon="time-outline" value={`${item.avgResolutionHours}घं.`} label={tt('औसत')} />}
                {item.avgRating && <StatChip icon="star-outline" value={item.avgRating} label={tt('रेटिंग')} />}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="map-outline" size={40} color={colors.border} />
            <Text style={styles.emptyText}>{tt('कोई डेटा नहीं मिला।')}</Text>
          </View>
        }
      />

      {/* थाना चुनने पर — "क्या देखना है" मेन्यू */}
      <Modal visible={!!actionSheet} transparent animationType="fade" onRequestClose={() => setActionSheet(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setActionSheet(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{tt(actionSheet?.station || '')}</Text>
            <TouchableOpacity style={styles.sheetBtn} onPress={goToAnalytics}>
              <Ionicons name="stats-chart-outline" size={18} color={colors.shaktiMaroon} />
              <Text style={styles.sheetBtnText}>{tt('पूरा Analytics देखें')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetBtn} onPress={goToLeaderboard}>
              <Ionicons name="trophy-outline" size={18} color={colors.shaktiMaroon} />
              <Text style={styles.sheetBtnText}>{tt('अधिकारी Performance देखें')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setActionSheet(null)}>
              <Text style={styles.sheetCancelText}>{tt('रद्द करें')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function StatChip({ icon, value, label, color }) {
  return (
    <View style={styles.statChip}>
      <Ionicons name={icon} size={12} color={color || colors.inkGrey} />
      <Text style={styles.statChipValue}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingTop: 12 },
  backText: { fontSize: 13, fontWeight: '700', color: colors.shaktiMaroon },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  h2: { fontSize: 17, fontWeight: '800', color: colors.inkNavy, flex: 1 },
  countBadge: {
    backgroundColor: colors.inkNavy,
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 15,
    marginBottom: 12,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 11.5, fontWeight: '800', color: colors.inkNavy },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy },
  cardSub: { fontSize: 11, color: colors.inkLight, marginTop: 1 },
  rateBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  rateBadgeText: { fontSize: 11, fontWeight: '800', color: colors.white },
  barTrack: { height: 5, backgroundColor: colors.sand, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.shaktiMaroon, borderRadius: 3 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statChipValue: { fontSize: 11.5, fontWeight: '800', color: colors.inkNavy },
  statChipLabel: { fontSize: 10, color: colors.inkLight },
  emptyBox: { alignItems: 'center', marginTop: 60 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 10 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 18 },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: colors.inkNavy, marginBottom: 14, textAlign: 'center' },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetBtnText: { fontSize: 14, fontWeight: '600', color: colors.inkNavy },
  sheetCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  sheetCancelText: { fontSize: 13, fontWeight: '700', color: colors.inkGrey },
});
