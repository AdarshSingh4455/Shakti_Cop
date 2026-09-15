import React, { useEffect, useState, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { SkeletonList } from '../components/LoadingView';
export default function OfficerManagementScreen({ navigation }) {
  const { allOfficers, loadAllOfficers, setOfficerActive, removeOfficer } = useApp();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadAllOfficers();
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [loadAllOfficers]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (officer) => {
    try {
      await setOfficerActive(officer.id, !officer.isActive);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
  };

  const confirmDelete = (officer) => {
    Alert.alert(tt('अधिकारी हटाएं?'), `${officer.name} को हटाना पक्का करें — यह वापस नहीं हो सकता।`, [
      { text: tt('रद्द करें'), style: 'cancel' },
      {
        text: tt('हटाएं'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeOfficer(officer.id);
          } catch (e) {
            Alert.alert(tt('त्रुटि'), e.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.title}>{tt('अधिकारी प्रबंधन')} ({allOfficers.length})</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('OfficerForm', {})}>
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={styles.addBtnText}>{tt('नया अधिकारी')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quickRow}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('OfficerStatus')}>
          <Ionicons name="pulse-outline" size={15} color={colors.shaktiMaroon} />
          <Text style={styles.quickBtnText}>{tt('अधिकारी स्थिति (Live)')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('BulkImport')}>
          <Ionicons name="cloud-upload-outline" size={15} color={colors.shaktiMaroon} />
          <Text style={styles.quickBtnText}>Bulk Import</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <FlatList
          data={allOfficers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('OfficerForm', { officer: item })}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  <View style={[styles.rankBadge, item.rank === 'SHO' && styles.rankBadgeSHO]}>
                    <Text style={styles.rankBadgeText}>{item.rank || 'SI'}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>{item.badgeId} · {item.station || '—'} {item.district ? `· ${tt(item.district)}` : ''}</Text>
                <Text style={styles.meta}>{item.mobile || 'मोबाइल नहीं जोड़ा गया'}</Text>
              </TouchableOpacity>
              <View style={styles.actions}>
                <Switch value={item.isActive} onValueChange={() => toggleActive(item)} trackColor={{ true: colors.sage }} />
                <TouchableOpacity onPress={() => confirmDelete(item)} style={{ marginTop: 10 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.alert} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{tt('कोई अधिकारी नहीं जोड़ा गया।')}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  quickRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 9 },
  quickBtnText: { fontSize: 11.5, fontWeight: '700', color: colors.shaktiMaroon },
  title: { fontSize: 16, fontWeight: '700', color: colors.inkNavy },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.shaktiMaroon, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  addBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankBadge: { backgroundColor: colors.sand, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  rankBadgeSHO: { backgroundColor: colors.shaktiMaroonWash },
  rankBadgeText: { fontSize: 9.5, fontWeight: '800', color: colors.inkGrey },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 15,
    marginBottom: 12,
    flexDirection: 'row',
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy },
  meta: { fontSize: 12, color: colors.inkGrey, marginTop: 3 },
  actions: { alignItems: 'center', marginLeft: 10 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 40, fontSize: 13 },
});
