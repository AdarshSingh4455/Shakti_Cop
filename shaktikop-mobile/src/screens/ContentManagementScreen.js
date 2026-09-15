import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

export default function ContentManagementScreen() {
  const {
    fetchAdminWelfare, createWelfareItem, updateWelfareItem, deleteWelfareItem,
    fetchAdminHelplines, createHelplineItem, updateHelplineItem, deleteHelplineItem,
  } = useApp();
  const [tab, setTab] = useState('welfare');
  const [welfare, setWelfare] = useState([]);
  const [helplines, setHelplines] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const [section, setSection] = useState('welfare');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setWelfare(await fetchAdminWelfare());
      setHelplines(await fetchAdminHelplines());
    } catch (e) {
      // ignore
    }
  }, [fetchAdminWelfare, fetchAdminHelplines]);

  useEffect(() => {
    load();
  }, [load]);

  const addWelfare = async () => {
    if (!title.trim()) return Alert.alert(tt('शीर्षक आवश्यक है'));
    setBusy(true);
    try {
      await createWelfareItem({ section, title: title.trim(), description: description.trim(), url: url.trim() });
      setTitle(''); setDescription(''); setUrl(''); setShowForm(false);
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const addHelpline = async () => {
    if (!label.trim() || !number.trim()) return Alert.alert(tt('नाम और नंबर दोनों आवश्यक हैं'));
    setBusy(true);
    try {
      await createHelplineItem({ label: label.trim(), number: number.trim() });
      setLabel(''); setNumber(''); setShowForm(false);
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const toggleWelfare = async (item) => {
    await updateWelfareItem(item.id, { isActive: !item.isActive });
    await load();
  };
  const toggleHelpline = async (item) => {
    await updateHelplineItem(item.id, { isActive: !item.isActive });
    await load();
  };
  const removeWelfare = (item) => {
    Alert.alert(tt('हटाएं?'), item.title, [
      { text: tt('रद्द करें'), style: 'cancel' },
      { text: tt('हटाएं'), style: 'destructive', onPress: async () => { await deleteWelfareItem(item.id); await load(); } },
    ]);
  };
  const removeHelpline = (item) => {
    Alert.alert(tt('हटाएं?'), item.label, [
      { text: tt('रद्द करें'), style: 'cancel' },
      { text: tt('हटाएं'), style: 'destructive', onPress: async () => { await deleteHelplineItem(item.id); await load(); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'welfare' && styles.tabBtnActive]} onPress={() => { setTab('welfare'); setShowForm(false); }}>
          <Text style={[styles.tabText, tab === 'welfare' && styles.tabTextActive]}>{tt('योजनाएं/सेवाएं')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'helplines' && styles.tabBtnActive]} onPress={() => { setTab('helplines'); setShowForm(false); }}>
          <Text style={[styles.tabText, tab === 'helplines' && styles.tabTextActive]}>{tt('हेल्पलाइन')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((s) => !s)}>
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {showForm && tab === 'welfare' && (
          <View style={styles.card}>
            <View style={styles.sectionToggle}>
              <TouchableOpacity style={[styles.sectionChip, section === 'welfare' && styles.sectionChipActive]} onPress={() => setSection('welfare')}>
                <Text style={[styles.sectionChipText, section === 'welfare' && styles.sectionChipTextActive]}>{tt('कल्याणकारी योजना')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sectionChip, section === 'support' && styles.sectionChipActive]} onPress={() => setSection('support')}>
                <Text style={[styles.sectionChipText, section === 'support' && styles.sectionChipTextActive]}>{tt('सहायता सेवा')}</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder={tt('शीर्षक')} value={title} onChangeText={setTitle} maxLength={150} />
            <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('विवरण')} value={description} onChangeText={setDescription} maxLength={1000} />
            <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('URL (पोर्टल लिंक)')} autoCapitalize="none" value={url} onChangeText={setUrl} maxLength={500} />
            <PrimaryButton title={busy ? tt('जोड़ा जा रहा है…') : tt('जोड़ें')} onPress={addWelfare} style={{ marginTop: 14 }}  loading={busy} />
          </View>
        )}

        {showForm && tab === 'helplines' && (
          <View style={styles.card}>
            <TextInput style={styles.input} placeholder={tt('नाम (जैसे — पुलिस आपातकाल)')} value={label} onChangeText={setLabel} maxLength={100} />
            <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('नंबर (जैसे — 112)')} keyboardType="number-pad" value={number} onChangeText={setNumber} maxLength={15} />
            <PrimaryButton title={busy ? tt('जोड़ा जा रहा है…') : tt('जोड़ें')} onPress={addHelpline} style={{ marginTop: 14 }}  loading={busy} />
          </View>
        )}

        {tab === 'welfare'
          ? welfare.map((w) => (
              <View key={w.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{w.title}</Text>
                  <Text style={styles.itemMeta}>{w.section === 'welfare' ? tt('कल्याणकारी योजना') : tt('सहायता सेवा')}</Text>
                </View>
                <Switch value={w.isActive} onValueChange={() => toggleWelfare(w)} trackColor={{ true: colors.shaktiMaroon }} />
                <TouchableOpacity onPress={() => removeWelfare(w)} style={{ marginLeft: 10 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.alert} />
                </TouchableOpacity>
              </View>
            ))
          : helplines.map((h) => (
              <View key={h.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{h.label}</Text>
                  <Text style={styles.itemMeta}>{h.number}</Text>
                </View>
                <Switch value={h.isActive} onValueChange={() => toggleHelpline(h)} trackColor={{ true: colors.shaktiMaroon }} />
                <TouchableOpacity onPress={() => removeHelpline(h)} style={{ marginLeft: 10 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.alert} />
                </TouchableOpacity>
              </View>
            ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, paddingBottom: 8 },
  tabBtn: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  tabBtnActive: { backgroundColor: colors.inkNavy, borderColor: colors.inkNavy },
  tabText: { fontSize: 12.5, fontWeight: '700', color: colors.inkGrey },
  tabTextActive: { color: colors.white },
  addBtn: { backgroundColor: colors.shaktiMaroon, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  sectionToggle: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sectionChip: { backgroundColor: colors.sand, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  sectionChipActive: { backgroundColor: colors.shaktiMaroon },
  sectionChipText: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey },
  sectionChipTextActive: { color: colors.white },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  itemTitle: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  itemMeta: { fontSize: 11, color: colors.inkGrey, marginTop: 3 },
});
