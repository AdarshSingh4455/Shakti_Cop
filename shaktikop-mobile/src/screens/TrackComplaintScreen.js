import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { STATUSES } from '../data/constants';
import { useApp } from '../context/AppContext';

import { formatDateTime } from '../utils/datetime';
export default function TrackComplaintScreen() {
  const { trackComplaintPublic } = useApp();
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const track = async () => {
    if (!id.trim()) {
      Alert.alert(tt('शिकायत नंबर डालें'));
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const data = await trackComplaintPublic(id.trim().toUpperCase());
      setResult(data);
    } catch (e) {
      Alert.alert(tt('नहीं मिला'), e.message);
    }
    setBusy(false);
  };

  const stepIndex = result ? STATUSES.indexOf(result.status) : -1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.h1}>{tt('शिकायत नंबर से ट्रैक करें')}</Text>
      <Text style={styles.sub}>{tt('अपनी शिकायत का ID डालें (जैसे — SK-9421-101040), लॉगिन की ज़रूरत नहीं।')}</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="SK-9421-101040"
          autoCapitalize="characters"
          value={id}
          onChangeText={setId}
          maxLength={20}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={track} disabled={busy}>
          <Ionicons name="search" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>

      {busy && <ActivityIndicator color={colors.shaktiMaroon} style={{ marginTop: 30 }} />}

      {result && (
        <View style={styles.card}>
          <Text style={styles.resultId}>{result.id}</Text>
          {/* 🔒 निजता फ़िक्स: श्रेणी यहाँ नहीं दिखाई जाती। यह स्क्रीन बिना लॉगिन के
              चलती है — सिर्फ़ शिकायत-नंबर से। नंबर आरोपी की नज़र में आ जाए (पीड़िता
              के फ़ोन पर, पावती की पर्ची या QR में) तो श्रेणी उसे पक्का बता देती कि
              शिकायत "घरेलू हिंसा" की है। स्थिति व timeline नीचे दिख ही रहे हैं, जो
              "मेरी शिकायत का क्या हुआ" के लिए काफ़ी हैं। */}

          <View style={{ marginTop: 16 }}>
            {STATUSES.map((s, i) => {
              const done = i <= stepIndex;
              return (
                <View key={s} style={styles.stepRow}>
                  <View style={[styles.stepDot, done && styles.stepDotActive]}>
                    {done && <Ionicons name="checkmark" size={12} color={colors.white} />}
                  </View>
                  <Text style={[styles.stepText, done && styles.stepTextActive]}>{s}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>{tt('दर्ज हुई')}</Text>
            <Text style={styles.metaValue}>{formatDateTime(result.createdAt)}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>{tt('अधिकारी नियुक्त')}</Text>
            <Text style={styles.metaValue}>{result.officerAssigned ? 'हाँ' : 'अभी नहीं'}</Text>
          </View>
          <Text style={styles.hint}>{tt('पूरी जानकारी के लिए लॉगिन करके अपने डैशबोर्ड में देखें।')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  scrollContent: { padding: 20, flexGrow: 1 },
  h1: { fontSize: 20, fontWeight: '800', color: colors.inkNavy, marginTop: 10 },
  sub: { fontSize: 12.5, color: colors.inkGrey, marginTop: 6, marginBottom: 20, lineHeight: 18 },
  searchRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  searchBtn: { backgroundColor: colors.shaktiMaroon, width: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    marginTop: 24,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  resultId: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: colors.sage },
  stepText: { fontSize: 13, color: colors.inkLight },
  stepTextActive: { color: colors.inkNavy, fontWeight: '700' },
  metaBox: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6 },
  metaLabel: { fontSize: 12, color: colors.inkGrey },
  metaValue: { fontSize: 12, fontWeight: '700', color: colors.inkNavy },
  hint: { fontSize: 11, color: colors.inkLight, marginTop: 12, textAlign: 'center' },
});
