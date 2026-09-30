import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { REJECTED_STATUS } from '../data/constants';
import { useApp } from '../context/AppContext';
import LiveLocationStatus from '../components/LiveLocationStatus';

import { formatDateTime } from '../utils/datetime';
import { SkeletonList } from '../components/LoadingView';
export default function SafeTravelScreen({ navigation }) {
  const { queryComplaints } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await queryComplaints({ category: 'सुरक्षित यात्रा मोड', sort: 'newest' });
      setList(data);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [queryComplaints]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await queryComplaints({ category: 'सुरक्षित यात्रा मोड', sort: 'newest' });
      setList(data);
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, [load]);

  // 🐛 बग फ़िक्स: पहले सिर्फ़ safeArrivalConfirmed जांचा जाता था — "निस्तारित"/"अस्वीकृत"
  // होकर मामला बंद हो जाने पर भी यह हमेशा के लिए "सक्रिय SOS" गिना जाता रहता।
  const sosCount = list.filter(
    (c) => c.sosTriggered && !c.safeArrivalConfirmed && c.status !== 'निस्तारित' && c.status !== REJECTED_STATUS
  ).length;

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: colors.inkNavy }]}>
          <Text style={styles.summaryNum}>{list.length}</Text>
          <Text style={styles.summaryLabel}>{tt('कुल यात्राएं')}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: sosCount > 0 ? colors.alert : colors.sage }]}>
          <Text style={styles.summaryNum}>{sosCount}</Text>
          <Text style={styles.summaryLabel}>{tt('सक्रिय SOS')}</Text>
        </View>
      </View>

      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
          renderItem={({ item }) => {
            const sosActive = item.sosTriggered && !item.safeArrivalConfirmed && item.status !== 'निस्तारित' && item.status !== REJECTED_STATUS;
            return (
              <TouchableOpacity
                style={[styles.card, sosActive && styles.cardSos]}
                onPress={() => navigation.navigate('ComplaintDetail', { id: item.id })}
                activeOpacity={0.85}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.cid}>{item.id}</Text>
                  {sosActive && (
                    <View style={styles.sosBadge}>
                      <Ionicons name="alert-circle" size={13} color={colors.white} />
                      <Text style={styles.sosBadgeText}>{tt('SOS सक्रिय')}</Text>
                    </View>
                  )}
                  {item.safeArrivalConfirmed && (
                    <View style={styles.safeBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={colors.white} />
                      <Text style={styles.sosBadgeText}>{tt('सुरक्षित पहुँचे')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.name}>{item.victimName}</Text>
                <Text style={styles.meta}>वाहन: {item.extraDetails?.vehicleNumber || '—'}</Text>
                <Text style={styles.meta}>{item.extraDetails?.fromLocation || '—'} → {item.extraDetails?.toLocation || '—'}</Text>
                {item.latitude ? (
                  <View style={styles.coordRow}>
                    <Ionicons name="location-outline" size={12} color={colors.inkLight} />
                    <Text style={styles.meta}>{item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}</Text>
                  </View>
                ) : null}
                <LiveLocationStatus complaint={item} />
                <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="navigate-outline" size={40} color={colors.border} />
              <Text style={styles.emptyText}>{tt('अभी कोई सुरक्षित यात्रा शिकायत नहीं है।')}</Text>
              <Text style={styles.emptySubText}>{tt('जैसे ही कोई सुरक्षित यात्रा शुरू होगी, यहाँ दिखेगी।')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  summaryRow: { flexDirection: 'row', gap: 10, padding: 16 },
  summaryCard: { flex: 1, borderRadius: radius.lg, padding: 16, alignItems: 'center' },
  summaryNum: { fontSize: 26, fontWeight: '800', color: colors.white },
  summaryLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 4, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
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
  cardSos: { borderWidth: 2, borderColor: colors.alert },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cid: { fontSize: 11, color: colors.inkLight, fontWeight: '600' },
  sosBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.alert, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  safeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.sage, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  sosBadgeText: { fontSize: 10, color: colors.white, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: colors.inkNavy, marginTop: 6 },
  meta: { fontSize: 12, color: colors.inkGrey, marginTop: 3 },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  time: { fontSize: 10.5, color: colors.inkLight, marginTop: 6 },
  emptyBox: { alignItems: 'center', marginTop: 40, paddingHorizontal: 30 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 10, fontSize: 13 },
  emptySubText: { textAlign: 'center', color: colors.inkLight, marginTop: 4, fontSize: 11.5 },
});
