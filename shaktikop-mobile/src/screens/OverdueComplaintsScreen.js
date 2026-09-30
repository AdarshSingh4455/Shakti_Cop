import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import ComplaintCard from '../components/ComplaintCard';
import EmptyState from '../components/EmptyState';

import { SkeletonList } from '../components/LoadingView';
export default function OverdueComplaintsScreen({ navigation }) {
  const { fetchOverdueComplaints } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOverdueComplaints();
      setList(data);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [fetchOverdueComplaints]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchOverdueComplaints();
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
      <View style={styles.hintRow}>
        <Ionicons name="time-outline" size={15} color={colors.inkGrey} />
        <Text style={styles.hint}>{tt('48 घंटे से ज़्यादा समय से लंबित/कार्यवाही में शिकायतें — तुरंत ध्यान देने योग्य।')}</Text>
      </View>
      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
          renderItem={({ item }) => (
            <View>
              <View style={styles.overdueTagRow}>
                <Ionicons name="time-outline" size={12} color={colors.alert} />
                <Text style={styles.overdueTag}>{item.overdueSinceHours} घंटे से लंबित</Text>
              </View>
              <ComplaintCard complaint={item} onPress={() => navigation.navigate('ComplaintDetail', { id: item.id })} />
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="checkmark-circle-outline" title={tt('कोई शिकायत SLA से बाहर नहीं है')} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 16, paddingBottom: 4 },
  hint: { flex: 1, fontSize: 11.5, color: colors.inkLight, lineHeight: 16 },
  list: { padding: 16, paddingTop: 4 },
  overdueTagRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4, marginLeft: 4 },
  overdueTag: { fontSize: 10.5, fontWeight: '700', color: colors.alert },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 40, fontSize: 13 },
});
