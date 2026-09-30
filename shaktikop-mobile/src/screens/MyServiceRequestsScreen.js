import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatDateShort } from '../utils/datetime';
import { SERVICE_TYPES } from '../data/serviceRequests';

import { SkeletonList, LoadingView } from '../components/LoadingView';
const STATUS_STYLE = {
  'अनुरोध प्राप्त': { bg: colors.marigold, icon: 'hourglass-outline' },
  'सत्र निर्धारित': { bg: colors.sage, icon: 'calendar' },
  'पूर्ण': { bg: colors.inkNavyLight, icon: 'checkmark-done' },
  'रद्द': { bg: colors.alert, icon: 'close-circle' },
};

export default function MyServiceRequestsScreen({ navigation, route }) {
  // किस सेवा की सूची — drawer से type आता है
  const type = route.params?.type || 'counselling';
  const cfg = SERVICE_TYPES[type] || SERVICE_TYPES.counselling;
  const { fetchCounsellingRequests } = useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchCounsellingRequests({ type });
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      // चुपचाप — पुरानी सूची दिखती रहे
    }
    setLoading(false);
    setRefreshing(false);
  }, [fetchCounsellingRequests, type]);

  useEffect(() => {
    load();
  }, [load]);

  // सत्र निर्धारित होते ही नागरिक को दिखे — हर 20 सेकंड में ताज़ा
  useEffect(() => {
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading) {
    return (
      <SkeletonList rows={6} />
    );
  }

  const renderItem = ({ item }) => {
    const st = STATUS_STYLE[item.status] || STATUS_STYLE['अनुरोध प्राप्त'];
    const scheduled = item.status === 'सत्र निर्धारित' && item.scheduledAt;
    return (
      <View style={[styles.card, scheduled && styles.cardScheduled]}>
        <View style={styles.headRow}>
          <Text style={styles.cid}>{item.id}</Text>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Ionicons name={st.icon} size={11} color={colors.white} />
            <Text style={styles.badgeText}>{tt(item.status)}</Text>
          </View>
        </View>

        <Text style={styles.reason}>{tt(item.reasonKey || cfg.label)}</Text>
        {item.reasonDetail ? <Text style={styles.detail}>{item.reasonDetail}</Text> : null}

        {scheduled ? (
          <View style={styles.scheduleBox}>
            <View style={styles.scheduleRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.sage} />
              <Text style={styles.scheduleText}>{formatDateTime(item.scheduledAt)}</Text>
            </View>
            {item.venue ? (
              <View style={styles.scheduleRow}>
                <Ionicons name="location-outline" size={14} color={colors.sage} />
                <Text style={styles.scheduleText}>{item.venue}</Text>
              </View>
            ) : null}
            {item.counsellorName ? (
              <View style={styles.scheduleRow}>
                <Ionicons name="person-outline" size={14} color={colors.sage} />
                <Text style={styles.scheduleText}>{item.counsellorName}</Text>
              </View>
            ) : null}
            {item.officerNote ? <Text style={styles.officerNote}>{item.officerNote}</Text> : null}
          </View>
        ) : item.status === 'अनुरोध प्राप्त' ? (
          <View style={styles.pendingBox}>
            <Ionicons name="time-outline" size={14} color={colors.marigold} />
            <Text style={styles.pendingText}>
              {tt('सत्र के समय व दिनांक से आपको जल्द ही अवगत कराया जाएगा।')}
            </Text>
          </View>
        ) : null}

        <Text style={styles.created}>
          {tt('अनुरोध दिनांक')}: {formatDateShort(item.createdAt)}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('ServiceRequestForm', { type })}>
        <Ionicons name="add-circle" size={18} color={colors.white} />
        <Text style={styles.newBtnText}>{tt('नया अनुरोध')} — {tt(cfg.label)}</Text>
      </TouchableOpacity>

      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.shaktiMaroon}
            colors={[colors.shaktiMaroon]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={cfg.icon} size={34} color={colors.inkLight} />
            <Text style={styles.emptyText}>
              {tt('अभी कोई अनुरोध नहीं — ऊपर से नया अनुरोध भेजें।')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.shaktiMaroon, margin: 14, marginBottom: 0, paddingVertical: 12, borderRadius: radius.md },
  newBtnText: { color: colors.white, fontSize: 13.5, fontWeight: '700' },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 13, marginBottom: 11, borderLeftWidth: 4, borderLeftColor: colors.border },
  cardScheduled: { borderLeftColor: colors.sage },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cid: { flex: 1, fontSize: 12, fontWeight: '800', color: colors.inkNavy },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  reason: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy, marginTop: 8 },
  detail: { fontSize: 12, color: colors.inkGrey, marginTop: 4, lineHeight: 17 },
  scheduleBox: { backgroundColor: '#F4F9F6', borderRadius: radius.sm, padding: 10, marginTop: 10, gap: 5 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scheduleText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.inkNavy },
  officerNote: { fontSize: 11.5, color: colors.inkGrey, marginTop: 4, fontStyle: 'italic' },
  pendingBox: { flexDirection: 'row', gap: 7, backgroundColor: '#FFF8E6', borderRadius: radius.sm, padding: 10, marginTop: 10 },
  pendingText: { flex: 1, fontSize: 11.5, color: colors.inkGrey, lineHeight: 16 },
  created: { fontSize: 10.5, color: colors.inkLight, marginTop: 9 },
  empty: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { fontSize: 13, color: colors.inkGrey, marginTop: 10, textAlign: 'center', paddingHorizontal: 30, lineHeight: 19 },
});
