import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonList } from '../components/LoadingView';
import { formatDateTime } from '../utils/datetime';

// ============================================================
// 🆕 हटाई गई शिकायतें — Soft Delete की "वापसी" (undo) व्यवस्था।
//
// पहले शिकायत हटाना हमेशा स्थायी था — कोई गलती से हटी शिकायत हमेशा के लिए खो
// जाती थी। अब हटाने पर शिकायत सिर्फ़ यहाँ (इस सूची में) आ जाती है — असली डेटा
// डेटाबेस में सुरक्षित रहता है, और Super Admin चाहें तो एक टैप में वापस ला
// सकते हैं। सिर्फ़ Super Admin को ही यह स्क्रीन दिखती है (navigator में गेटेड)।
// ============================================================
export default function DeletedComplaintsScreen() {
  const { fetchDeletedComplaints, restoreComplaintById } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState([]);
  const [restoringId, setRestoringId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDeletedComplaints();
      setList(data || []);
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setLoading(false);
  }, [fetchDeletedComplaints]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmRestore = (item) => {
    Alert.alert(
      tt('शिकायत वापस लाएं?'),
      `${item.id} — ${item.category}`,
      [
        { text: tt('रद्द करें'), style: 'cancel' },
        {
          text: tt('हां, वापस लाएं'),
          onPress: async () => {
            setRestoringId(item.id);
            try {
              await restoreComplaintById(item.id);
              setList((prev) => prev.filter((c) => c.id !== item.id));
              Alert.alert(tt('शिकायत वापस लाई गई'));
            } catch (e) {
              Alert.alert(tt('त्रुटि'), e.message || tt('वापस नहीं लाई जा सकी'));
            }
            setRestoringId(null);
          },
        },
      ]
    );
  };

  if (loading) return <SkeletonList />;

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.title}>{tt('हटाई गई शिकायतें')} ({list.length})</Text>
        <Text style={styles.subtitle}>{tt('इन्हें एक टैप में वापस लाया जा सकता है')}</Text>
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon="trash-outline"
            title="कोई हटाई गई शिकायत नहीं है।"
            subtitle="जब भी कोई शिकायत हटाई जाएगी, वह यहां दिखेगी और वापस लाई जा सकेगी।"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTop}>
                <Text style={styles.id}>{item.id}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.category}>{tt(item.category)}</Text>
              <Text style={styles.meta}>{item.district} {item.policeStation ? `· ${item.policeStation}` : ''}</Text>
              {item.deletedByName && (
                <Text style={styles.deletedMeta}>
                  {tt('हटाई गई')}: {item.deletedByName} · {formatDateTime(item.deletedAt)}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.restoreBtn}
              onPress={() => confirmRestore(item)}
              disabled={restoringId === item.id}
            >
              <Ionicons name="refresh-outline" size={15} color={colors.white} />
              <Text style={styles.restoreBtnText}>{restoringId === item.id ? tt('...') : tt('वापस लाएं')}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerBar: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  title: { fontSize: 17, fontWeight: '800', color: colors.inkNavy },
  subtitle: { fontSize: 11.5, color: colors.inkGrey, marginTop: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  id: { fontSize: 13, fontWeight: '800', color: colors.inkNavy },
  category: { fontSize: 12.5, color: colors.inkGrey, marginTop: 2 },
  meta: { fontSize: 11, color: colors.inkLight, marginTop: 2 },
  deletedMeta: { fontSize: 10.5, color: colors.alert, marginTop: 6 },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.sage,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  restoreBtnText: { color: colors.white, fontSize: 11.5, fontWeight: '700' },
});
