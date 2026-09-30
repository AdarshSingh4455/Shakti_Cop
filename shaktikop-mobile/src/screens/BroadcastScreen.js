import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

import { formatDateTime } from '../utils/datetime';
const AUDIENCES = [
  { key: 'officers', label: 'सभी अधिकारी', icon: 'shield-outline' },
  { key: 'citizens', label: 'सभी नागरिक', icon: 'people-outline' },
  { key: 'all', label: 'सभी (दोनों)', icon: 'megaphone-outline' },
];

export default function BroadcastScreen() {
  const { sendBroadcast, fetchBroadcastHistory, user } = useApp();
  // 🐛 बग फ़िक्स: यह स्क्रीन बिना role-जांच के "भेजें" बटन दिखाती थी। बैकएंड में
  // broadcast भेजना blockMonitor से DSP/ASP/SSP के लिए रोका गया है — सिर्फ़ देखना
  // अनुमत है। और "broadcast" मेनू-अनुमति हर नए DSP/ASP/SSP खाते को शुरुआत में
  // डिफ़ॉल्ट रूप से मिलती है (createDistrictAdmin का defaultMonitorMenu) — इसलिए
  // यह बग सैद्धांतिक नहीं, हर नए DSP/ASP/SSP खाते के लिए तुरंत सामने आता।
  const isMonitor = user?.adminRole === 'monitor';
  const [audience, setAudience] = useState('officers');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await fetchBroadcastHistory();
      setHistory(data);
    } catch (e) {
      // ignore
    }
  }, [fetchBroadcastHistory]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('शीर्षक और संदेश दोनों आवश्यक हैं।'));
      return;
    }
    setBusy(true);
    try {
      const result = await sendBroadcast({ audience, title: title.trim(), body: body.trim() });
      setTitle('');
      setBody('');
      await load();
      Alert.alert(tt('भेज दिया गया'), `${result.recipientCount} लोगों को सूचना भेज दी गई है।`);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>Broadcast / Announcement</Text>

      {isMonitor ? (
        <View style={styles.card}>
          <View style={styles.audienceRow}>
            <Ionicons name="eye-outline" size={16} color={colors.marigold} />
            <Text style={{ fontSize: 12.5, color: colors.inkGrey, flex: 1, lineHeight: 18 }}>
              {tt('आपकी भूमिका (DSP/ASP/SSP) सिर्फ़ Broadcast इतिहास देख सकती है — नया संदेश भेजना District Admin या Super Admin ही कर सकते हैं।')}
            </Text>
          </View>
        </View>
      ) : (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('किसे भेजें?')}</Text>
        <View style={styles.audienceRow}>
          {AUDIENCES.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={[styles.audienceChip, audience === a.key && styles.audienceChipActive]}
              onPress={() => setAudience(a.key)}
            >
              <Ionicons name={a.icon} size={16} color={audience === a.key ? colors.white : colors.inkGrey} />
              <Text style={[styles.audienceText, audience === a.key && styles.audienceTextActive]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.smallLabel}>{tt('शीर्षक')}</Text>
        <TextInput style={styles.input} placeholder={tt('जैसे — नई नीति')} value={title} onChangeText={setTitle} maxLength={150} />

        <Text style={styles.smallLabel}>{tt('संदेश')}</Text>
        <TextInput style={styles.textarea} placeholder={tt('पूरा संदेश लिखें…')} multiline value={body} onChangeText={setBody} maxLength={2000} />

        <PrimaryButton title={busy ? tt('भेजा जा रहा है…') : tt('भेजें')} onPress={send} style={{ marginTop: 14 }}  loading={busy} />
      </View>
      )}

      <Text style={styles.sectionTitle}>{tt('पिछले Broadcasts')}</Text>
      {history.map((h) => (
        <View key={h.id} style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>{h.title}</Text>
            <Text style={styles.historyAudience}>{h.audience}</Text>
          </View>
          <Text style={styles.historyBody}>{h.body}</Text>
          <Text style={styles.historyTime}>{h.senderName} · {formatDateTime(h.createdAt)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginBottom: 14 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 20 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 12 },
  audienceRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  audienceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.sand, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  audienceChipActive: { backgroundColor: colors.shaktiMaroon },
  audienceText: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey },
  audienceTextActive: { color: colors.white },
  smallLabel: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, marginBottom: 8 },
  textarea: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  historyCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  historyTitle: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy, flex: 1 },
  historyAudience: { fontSize: 10, color: colors.shaktiMaroon, fontWeight: '700', textTransform: 'uppercase' },
  historyBody: { fontSize: 12.5, color: colors.inkGrey, marginTop: 6, lineHeight: 18 },
  historyTime: { fontSize: 10.5, color: colors.inkLight, marginTop: 8 },
});
