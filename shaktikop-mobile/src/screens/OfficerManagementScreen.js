import React, { useEffect, useState, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Switch, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { SkeletonList } from '../components/LoadingView';
export default function OfficerManagementScreen({ navigation }) {
  const { allOfficers, loadAllOfficers, setOfficerActive, removeOfficer, user, adminProfile } = useApp();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const currentRole = user?.adminRole || adminProfile?.adminRole;
  const isDistrictAdmin = currentRole === 'district_admin';
  const scopedDistrict = user?.district || adminProfile?.district;

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
    Alert.alert(
      tt('अधिकारी हटाएं?'),
      tt(`${officer.name} (${officer.badgeId}) को सेवा से हटाना पक्का करें? सक्रिय मामले होने पर पहले उन्हें अन्यत्र स्थानांतरित करना होगा। पूर्व इतिहास सुरक्षित रहेगा।`),
      [
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
      ]
    );
  };

  const filteredOfficers = allOfficers.filter((o) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (o.name && o.name.toLowerCase().includes(q)) ||
      (o.badgeId && o.badgeId.toLowerCase().includes(q)) ||
      (o.station && o.station.toLowerCase().includes(q)) ||
      (o.district && o.district.toLowerCase().includes(q))
    );
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.title}>{tt('अधिकारी प्रबंधन')} ({filteredOfficers.length})</Text>
          <Text style={styles.scopeText}>
            {isDistrictAdmin && scopedDistrict ? `📍 ज़िला: ${scopedDistrict}` : '📍 समस्त उत्तर प्रदेश'}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('OfficerForm', {})}>
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={styles.addBtnText}>{tt('नया अधिकारी')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBarWrap}>
        <Ionicons name="search-outline" size={16} color={colors.inkGrey} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={tt('नाम, PNO, या थाना से खोजें...')}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={colors.inkLight}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.inkGrey} />
          </TouchableOpacity>
        )}
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
          data={filteredOfficers}
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
          ListEmptyComponent={<Text style={styles.emptyText}>{tt('कोई अधिकारी नहीं मिला।')}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  scopeText: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginTop: 2 },
  searchBarWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 13, color: colors.inkNavy, padding: 0 },
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
