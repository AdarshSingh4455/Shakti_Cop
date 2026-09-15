import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

export default function LanguageManagementScreen() {
  const { user, fetchAdminLocalesList, createLocaleAdmin, deleteLocaleAdmin, fetchAdminTranslationsList, bulkUploadTranslationsAdmin } = useApp();
  const isSuperAdmin = user?.adminRole === 'super_admin';

  const [locales, setLocales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLocale, setShowAddLocale] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const [selectedCode, setSelectedCode] = useState(null);
  const [translationCount, setTranslationCount] = useState(0);
  const [pasteText, setPasteText] = useState('');
  const [mode, setMode] = useState('merge');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminLocalesList();
      setLocales(data);
    } catch (e) {
      // सिर्फ़ super_admin को मिलेगा
    }
    setLoading(false);
  }, [fetchAdminLocalesList]);

  useEffect(() => {
    load();
  }, [load]);

  const addLocale = async () => {
    if (!newCode.trim() || !newLabel.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('भाषा कोड (जैसे bho) और नाम दोनों आवश्यक हैं।'));
      return;
    }
    setBusy(true);
    try {
      await createLocaleAdmin({ code: newCode.trim().toLowerCase(), label: newLabel.trim() });
      setNewCode('');
      setNewLabel('');
      setShowAddLocale(false);
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const removeLocale = (locale) => {
    Alert.alert(tt('भाषा हटाएं?'), locale.label, [
      { text: tt('रद्द करें'), style: 'cancel' },
      {
        text: tt('हटाएं'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLocaleAdmin(locale.code);
            await load();
          } catch (e) {
            Alert.alert(tt('त्रुटि'), e.message);
          }
        },
      },
    ]);
  };

  const openTranslations = async (locale) => {
    setSelectedCode(locale.code);
    setPasteText('');
    try {
      const list = await fetchAdminTranslationsList(locale.code);
      setTranslationCount(list.length);
    } catch (e) {
      setTranslationCount(0);
    }
  };

  const uploadTranslations = async () => {
    const lines = pasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      Alert.alert(tt('कुछ भी नहीं है'), tt('कम से कम एक पंक्ति डालें — जैसे: पासवर्ड | Password'));
      return;
    }
    const rows = lines.map((line) => {
      const [sourceText, translatedText] = line.split('|').map((p) => p?.trim());
      return { sourceText, translatedText };
    });
    setBusy(true);
    try {
      const result = await bulkUploadTranslationsAdmin(selectedCode, rows, mode);
      setPasteText('');
      Alert.alert(tt('सफल'), `${result.inserted} अनुवाद जुड़े/अपडेट हुए।`);
      const list = await fetchAdminTranslationsList(selectedCode);
      setTranslationCount(list.length);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  if (!isSuperAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.restrictedBox}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.inkLight} />
          <Text style={styles.restrictedText}>{tt('यह सेक्शन सिर्फ़ Super Admin के लिए है।')}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('भाषा प्रबंधन')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddLocale((s) => !s)}>
          <Ionicons name={showAddLocale ? 'close' : 'add'} size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        {tt('हिंदी हमेशा मूल भाषा रहती है — नई भाषा (जैसे भोजपुरी, अवधी, उर्दू) जोड़कर उसके अनुवाद अपलोड करें।')}
      </Text>

      {showAddLocale && (
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder={tt('भाषा कोड (जैसे bho)')} value={newCode} onChangeText={setNewCode} autoCapitalize="none" maxLength={10} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('भाषा का नाम (जैसे भोजपुरी)')} value={newLabel} onChangeText={setNewLabel} maxLength={60} />
          <PrimaryButton title={busy ? tt('जोड़ी जा रही है…') : tt('भाषा जोड़ें')} onPress={addLocale} style={{ marginTop: 14 }}  loading={busy} />
        </View>
      )}

      {loading ? (
        <Text style={styles.hint}>{tt('लोड हो रहा है…')}</Text>
      ) : (
        locales.map((locale) => (
          <View key={locale.code}>
            <TouchableOpacity style={styles.localeRow} onPress={() => openTranslations(locale)}>
              <Ionicons name="language-outline" size={18} color={colors.shaktiMaroon} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.localeLabel}>{locale.label}</Text>
                <Text style={styles.localeCode}>{locale.code}</Text>
              </View>
              {!['hi', 'en'].includes(locale.code) && (
                <TouchableOpacity onPress={() => removeLocale(locale)}>
                  <Ionicons name="trash-outline" size={18} color={colors.alert} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {selectedCode === locale.code && locale.code !== 'hi' && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{locale.label} — अभी {translationCount} अनुवाद मौजूद</Text>
                <Text style={styles.formatHint}>
                  हर पंक्ति में: <Text style={styles.mono}>{tt('हिंदी टेक्स्ट | अनुवाद')}</Text> ( | से अलग)
                </Text>
                <Text style={styles.example}>उदाहरण:{'\n'}पासवर्ड | Password{'\n'}लॉगिन करें | Login</Text>
                <TextInput style={styles.textarea} placeholder={tt('यहाँ पेस्ट करें…')} multiline value={pasteText} onChangeText={setPasteText} maxLength={20000} />
                <View style={styles.modeRow}>
                  <TouchableOpacity style={[styles.modeChip, mode === 'merge' && styles.modeChipActive]} onPress={() => setMode('merge')}>
                    <Text style={[styles.modeChipText, mode === 'merge' && styles.modeChipTextActive]}>{tt('जोड़ें/अपडेट करें')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modeChip, mode === 'replace' && styles.modeChipActive]} onPress={() => setMode('replace')}>
                    <Text style={[styles.modeChipText, mode === 'replace' && styles.modeChipTextActive]}>{tt('पूरी सूची बदलें')}</Text>
                  </TouchableOpacity>
                </View>
                <PrimaryButton title={busy ? tt('अपलोड हो रहा है…') : tt('अपलोड करें')} onPress={uploadTranslations} style={{ marginTop: 14 }}  loading={busy} />
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  addBtn: { backgroundColor: colors.shaktiMaroon, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11.5, color: colors.inkLight, marginTop: 6, marginBottom: 16, lineHeight: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  localeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 8 },
  localeLabel: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  localeCode: { fontSize: 10.5, color: colors.inkGrey, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.inkNavy, marginBottom: 8 },
  formatHint: { fontSize: 11.5, color: colors.inkGrey, marginBottom: 6 },
  mono: { fontFamily: 'monospace', fontWeight: '700', color: colors.shaktiMaroon },
  example: { fontSize: 10.5, color: colors.inkLight, backgroundColor: colors.sand, padding: 10, borderRadius: radius.sm, marginBottom: 12, lineHeight: 15 },
  textarea: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 13, minHeight: 130, textAlignVertical: 'top' },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modeChip: { flex: 1, backgroundColor: colors.sand, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  modeChipActive: { backgroundColor: colors.inkNavy },
  modeChipText: { fontSize: 11, fontWeight: '700', color: colors.inkGrey },
  modeChipTextActive: { color: colors.white },
  restrictedBox: { alignItems: 'center', paddingTop: 80 },
  restrictedText: { fontSize: 13, color: colors.inkLight, marginTop: 12 },
});
