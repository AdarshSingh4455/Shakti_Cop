import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

import { formatDate } from '../utils/datetime';
const SHIFTS = ['सामान्य', 'प्रातःकालीन', 'रात्रिकालीन'];

export default function RosterScreen() {
  const { officers, fetchRoster, addRosterEntry, deleteRosterEntry } = useApp();
  const [roster, setRoster] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [officerId, setOfficerId] = useState(officers[0]?.id || null);
  const [dutyDate, setDutyDate] = useState('');
  const [shift, setShift] = useState(SHIFTS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchRoster();
      setRoster(data);
    } catch (e) {
      // ignore
    }
  }, [fetchRoster]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, [load]);

  const addEntry = async () => {
    if (!officerId || !dutyDate.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('अधिकारी और तिथि (YYYY-MM-DD) दोनों आवश्यक हैं।'));
      return;
    }
    setBusy(true);
    try {
      await addRosterEntry({ officerId, dutyDate: dutyDate.trim(), shift, note: note.trim() });
      setDutyDate('');
      setNote('');
      setShowForm(false);
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const removeEntry = (id) => {
    Alert.alert(tt('हटाएं?'), '', [
      { text: tt('रद्द करें'), style: 'cancel' },
      { text: tt('हटाएं'), style: 'destructive', onPress: async () => { await deleteRosterEntry(id); await load(); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('ड्यूटी रोस्टर')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((s) => !s)}>
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.white} />
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={styles.card}>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={officerId} onValueChange={setOfficerId}>
              {officers.map((o) => (
                <Picker.Item key={o.id} label={o.name} value={o.id} />
              ))}
            </Picker>
          </View>
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('तिथि (YYYY-MM-DD)')} value={dutyDate} onChangeText={setDutyDate} maxLength={10} />
          <View style={[styles.pickerWrap, { marginTop: 10 }]}>
            <Picker selectedValue={shift} onValueChange={setShift}>
              {SHIFTS.map((s) => (
                <Picker.Item key={s} label={tt(s)} value={s} />
              ))}
            </Picker>
          </View>
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('टिप्पणी (वैकल्पिक)')} value={note} onChangeText={setNote} maxLength={1000} />
          <PrimaryButton title={busy ? tt('जोड़ा जा रहा है…') : tt('रोस्टर में जोड़ें')} onPress={addEntry} style={{ marginTop: 14 }}  loading={busy} />
        </View>
      )}

      <FlatList
        data={roster}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
        renderItem={({ item }) => (
          <View style={styles.rosterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.officerName}>{item.officerName}</Text>
              <Text style={styles.rosterMeta}>{formatDate(item.dutyDate)} · {item.shift}</Text>
              {item.note ? <Text style={styles.rosterNote}>{item.note}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => removeEntry(item.id)}>
              <Ionicons name="trash-outline" size={18} color={colors.alert} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={40} color={colors.border} />
            <Text style={styles.emptyText}>{tt('कोई रोस्टर entry नहीं।')}</Text>
            <Text style={styles.emptySubText}>{tt('ऊपर फ़ॉर्म से ड्यूटी शेड्यूल जोड़ें।')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  addBtn: { backgroundColor: colors.shaktiMaroon, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginHorizontal: 16, marginBottom: 10 },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  pickerWrap: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  rosterRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  officerName: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  rosterMeta: { fontSize: 11.5, color: colors.inkGrey, marginTop: 3 },
  rosterNote: { fontSize: 11, color: colors.inkLight, marginTop: 3 },
  emptyBox: { alignItems: 'center', marginTop: 40 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 10 },
  emptySubText: { textAlign: 'center', color: colors.inkLight, fontSize: 11.5, marginTop: 4 },
});
