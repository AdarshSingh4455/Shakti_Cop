import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert } from 'react-native';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

export default function BulkImportScreen() {
  const { bulkImportOfficers } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const doImport = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      Alert.alert(tt('कुछ भी नहीं है'), tt('कम से कम एक पंक्ति डालें।'));
      return;
    }
    const officers = lines.map((line) => {
      const [name, badgeId, mobile, password, station, district] = line.split(',').map((p) => p?.trim());
      return { name, badgeId, mobile, password, station, district };
    });

    setBusy(true);
    try {
      const res = await bulkImportOfficers(officers);
      setResult(res);
      Alert.alert(tt('पूरा हुआ'), `${res.success.length} सफल, ${res.failed.length} असफल`);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('Bulk अधिकारी Import')}</Text>
      <Text style={styles.hint}>
        हर पंक्ति में CSV format में डालें (comma से अलग करें):{'\n'}
        <Text style={styles.mono}>{tt('नाम, PNO, मोबाइल, पासवर्ड, थाना, ज़िला')}</Text>
      </Text>
      <Text style={styles.example}>
        उदाहरण:{'\n'}
        राम शर्मा, UP-5001, 9876543210, Ram@123, हजरतगंज, लखनऊ{'\n'}
        सीता वर्मा, UP-5002, 9876543211, Sita@123, गोमती नगर, लखनऊ
      </Text>

      <TextInput
        style={styles.textarea}
        placeholder={tt('यहाँ पंक्तियां पेस्ट करें…')}
        multiline
        value={text}
        onChangeText={setText}
        maxLength={20000}
      />

      <PrimaryButton title={busy ? 'Import हो रहा है…' : tt('सभी Import करें')} onPress={doImport} style={{ marginTop: 14 }}  loading={busy} />

      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>✅ {result.success.length} सफल</Text>
          {result.failed.length > 0 && (
            <>
              <Text style={styles.resultTitleFail}>❌ {result.failed.length} असफल</Text>
              {result.failed.map((f, i) => (
                <Text key={i} style={styles.failLine}>
                  {f.row.name || '—'}: {f.existingOfficer
                    ? `${tt('पहले से सक्रिय')} (${f.existingOfficer.name} — ${tt(f.existingOfficer.station)}, ${tt(f.existingOfficer.district)}) — ${tt('पहले वहां निष्क्रिय करें')}`
                    : tt(f.error)}
                </Text>
              ))}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginBottom: 10 },
  hint: { fontSize: 12, color: colors.inkGrey, lineHeight: 18, marginBottom: 8 },
  mono: { fontFamily: 'monospace', fontWeight: '700', color: colors.inkNavy },
  example: { fontSize: 11, color: colors.inkLight, backgroundColor: colors.white, padding: 10, borderRadius: radius.sm, marginBottom: 14, lineHeight: 16 },
  textarea: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 13, minHeight: 150, textAlignVertical: 'top' },
  resultBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginTop: 16 },
  resultTitle: { fontSize: 13.5, fontWeight: '700', color: colors.sage },
  resultTitleFail: { fontSize: 13.5, fontWeight: '700', color: colors.alert, marginTop: 8 },
  failLine: { fontSize: 11.5, color: colors.inkGrey, marginTop: 4 },
});
