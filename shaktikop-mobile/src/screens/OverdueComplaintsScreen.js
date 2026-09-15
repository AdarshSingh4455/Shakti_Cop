import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import ComplaintCard from '../components/ComplaintCard';

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
      <Text style={styles.hint}>{tt('⏰ 48 घंटे से ज़्यादा समय से लंबित/कार्यवाही में शिकायतें — तुरंत ध्यान देने योग्य।')}</Text>
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
              <Text style={styles.overdueTag}>⏰ {item.overdueSinceHours} घंटे से लंबित</Text>
              <ComplaintCard complaint={item} onPress={() => navigation.navigate('ComplaintDetail', { id: item.id })} />
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{tt('🎉 कोई शिकायत SLA से बाहर नहीं है।')}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  hint: { fontSize: 11.5, color: colors.inkLight, padding: 16, paddingBottom: 4, lineHeight: 16 },
  list: { padding: 16, paddingTop: 4 },
  overdueTag: { fontSize: 10.5, fontWeight: '700', color: colors.alert, marginBottom: 4, marginLeft: 4 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 40, fontSize: 13 },
});
