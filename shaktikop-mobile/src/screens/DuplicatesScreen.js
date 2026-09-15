import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { SkeletonList } from '../components/LoadingView';
export default function DuplicatesScreen({ navigation }) {
  const { fetchPossibleDuplicates, markDuplicate } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPossibleDuplicates();
      setList(data);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [fetchPossibleDuplicates]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchPossibleDuplicates();
      setList(data);
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, [load]);

  const link = (pair) => {
    Alert.alert(
      tt('डुप्लीकेट के रूप में चिह्नित करें?'),
      `${pair.complaintId2} ${tt('को')} ${pair.complaintId1} ${tt('की डुप्लीकेट के रूप में चिह्नित किया जाएगा।')}`,
      [
        { text: tt('रद्द करें'), style: 'cancel' },
        {
          text: tt('हाँ, चिह्नित करें'),
          onPress: async () => {
            try {
              await markDuplicate(pair.complaintId2, pair.complaintId1);
              await load();
              Alert.alert(tt('चिह्नित हो गया'));
            } catch (e) {
              Alert.alert(tt('त्रुटि'), e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>{tt('एक जैसा मोबाइल नंबर व श्रेणी, 24 घंटे के अंदर — संभावित डुप्लीकेट शिकायतें।')}</Text>
      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item, i) => `${item.complaintId1}-${item.complaintId2}-${i}`}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => navigation.navigate('ComplaintDetail', { id: item.complaintId1 })}>
                  <Text style={styles.idLink}>{item.complaintId1}</Text>
                </TouchableOpacity>
                <Ionicons name="swap-horizontal" size={16} color={colors.inkLight} />
                <TouchableOpacity onPress={() => navigation.navigate('ComplaintDetail', { id: item.complaintId2 })}>
                  <Text style={styles.idLink}>{item.complaintId2}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.meta}>{item.category} · {item.victimName} · {item.victimMobile}</Text>
              <TouchableOpacity style={styles.linkBtn} onPress={() => link(item)}>
                <Text style={styles.linkBtnText}>{tt('डुप्लीकेट के रूप में जोड़ें')}</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-circle-outline" size={40} color={colors.sage} />
              <Text style={styles.emptyText}>{tt('कोई संभावित डुप्लीकेट नहीं मिली।')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  hint: { fontSize: 11.5, color: colors.inkLight, padding: 16, paddingBottom: 4, lineHeight: 16 },
  list: { padding: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  idLink: { fontSize: 13, fontWeight: '700', color: colors.shaktiMaroon },
  meta: { fontSize: 12, color: colors.inkGrey, marginTop: 6 },
  linkBtn: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: colors.marigoldWash, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  linkBtnText: { fontSize: 11.5, fontWeight: '700', color: colors.marigold },
  emptyBox: { alignItems: 'center', marginTop: 40 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 10 },
});
