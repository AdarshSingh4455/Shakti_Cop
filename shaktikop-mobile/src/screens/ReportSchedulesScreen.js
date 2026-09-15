import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { formatDateTime } from '../utils/datetime';

// 🆕 Interactive Report Dashboard — पहले "generate करें" दबाने पर सिर्फ़ एक
// साधारण Alert popup (तीन संख्याएं, टेक्स्ट में) दिखता था, जिसे बंद करते ही
// डेटा गायब हो जाता — कोई visual/interactive झलक नहीं थी। अब यह डेटा उसी
// schedule की row के नीचे एक असली मिनी-डैशबोर्ड (KPI कार्ड + श्रेणी-अनुसार बार)
// के रूप में खुलता है, जिसे दबाकर खोला/बंद किया जा सकता है।
function ReportPreview({ report }) {
  if (!report) return null;
  const { reportData } = report;
  const maxCategory = Math.max(1, ...reportData.byCategory.map((c) => c.total));

  // 🆕 असली PDF अब base64 के रूप में साथ आता है — डिवाइस पर सेव करके शेयर/खोल सकते हैं
  const openPdf = async () => {
    if (!report.pdfBase64) return;
    try {
      const path = `${FileSystem.cacheDirectory}shaktikop-report-${Date.now()}.pdf`;
      await FileSystem.writeAsStringAsync(path, report.pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, { mimeType: 'application/pdf', dialogTitle: tt('रिपोर्ट PDF') });
      } else {
        Alert.alert(tt('सुरक्षित हुआ'), path);
      }
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('PDF खोलने/शेयर करने में समस्या हुई।'));
    }
  };

  return (
    <View style={styles.previewBox}>
      {report.message && (
        <View style={[styles.previewStatusBox, report.emailSent ? styles.previewStatusOk : styles.previewStatusWarn]}>
          <Ionicons name={report.emailSent ? 'checkmark-circle' : 'alert-circle'} size={14} color={report.emailSent ? colors.sage : colors.marigold} />
          <Text style={styles.previewStatusText}>{report.message}</Text>
        </View>
      )}
      {report.pdfBase64 && (
        <TouchableOpacity style={styles.pdfDownloadBtn} onPress={openPdf}>
          <Ionicons name="document-text-outline" size={16} color={colors.white} />
          <Text style={styles.pdfDownloadBtnText}>{tt('PDF डाउनलोड/शेयर करें')}</Text>
        </TouchableOpacity>
      )}
      <View style={styles.previewKpiGrid}>
        <PreviewKpi label={tt('कुल')} value={reportData.total} color={colors.inkNavy} />
        <PreviewKpi label={tt('निस्तारित')} value={reportData.resolved} color={colors.sage} />
        <PreviewKpi label={tt('लंबित')} value={reportData.pending} color={colors.marigold} />
        <PreviewKpi label={tt('कार्यवाही में')} value={reportData.inProgress} color={colors.shaktiMaroon} />
        <PreviewKpi label={tt('अस्वीकृत')} value={reportData.rejected} color={colors.alert} />
        <PreviewKpi label={tt('औसत समय')} value={reportData.avgResolutionHours ? `${reportData.avgResolutionHours} घं.` : '—'} color={colors.inkNavyLight} />
      </View>
      {reportData.byCategory.length > 0 && (
        <View style={styles.previewCatBox}>
          <Text style={styles.previewCatTitle}>{tt('श्रेणी अनुसार (शीर्ष 5)')}</Text>
          {reportData.byCategory.map((c) => (
            <View key={c.category} style={styles.previewCatRow}>
              <Text style={styles.previewCatLabel} numberOfLines={1}>{c.category}</Text>
              <View style={styles.previewCatTrack}>
                <View style={[styles.previewCatFill, { width: `${(c.total / maxCategory) * 100}%` }]} />
              </View>
              <Text style={styles.previewCatCount}>{c.total}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.previewMeta}>{tt('तैयार हुआ')}: {formatDateTime(report.generatedAt)}</Text>
    </View>
  );
}

function PreviewKpi({ label, value, color }) {
  return (
    <View style={[styles.previewKpiTile, { borderLeftColor: color }]}>
      <Text style={styles.previewKpiValue}>{value}</Text>
      <Text style={styles.previewKpiLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

export default function ReportSchedulesScreen() {
  const { fetchReportSchedules, createReportSchedule, updateReportSchedule, deleteReportSchedule, generateReportNow, user } = useApp();
  // 🐛 बग फ़िक्स: यह पूरी स्क्रीन पहले किसी भी role-जांच के बिना "जोड़ें/मिटाएं/चालू-बंद/
  // generate करें" बटन दिखाती थी। पर बैकएंड में ये सभी चार कार्रवाइयां monitor भूमिका
  // (DSP/ASP/SSP) के लिए blockMonitor से रोकी गई हैं — सिर्फ़ देखना अनुमत है। अगर
  // Super Admin किसी DSP/ASP/SSP को इस स्क्रीन की दृश्यता दे दे (जो menu_permissions से
  // संभव है), तो बटन दिखते तो थे पर दबाने पर हमेशा 403 त्रुटि आती — भ्रामक अनुभव।
  // अब उनके लिए ये सभी बटन दिखते ही नहीं, साफ़ संदेश के साथ।
  const isMonitor = user?.adminRole === 'monitor';

  const [schedules, setSchedules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState({}); // scheduleId -> report data
  const [genBusyId, setGenBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setSchedules(await fetchReportSchedules());
    } catch (e) {
      // ignore
    }
  }, [fetchReportSchedules]);

  useEffect(() => {
    load();
  }, [load]);

  const addSchedule = async () => {
    if (!email.trim()) return Alert.alert(tt('ईमेल आवश्यक है'));
    setBusy(true);
    try {
      await createReportSchedule({ frequency, recipientEmail: email.trim() });
      setEmail('');
      setShowForm(false);
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const toggle = async (s) => {
    await updateReportSchedule(s.id, { isActive: !s.isActive });
    await load();
  };

  const remove = (s) => {
    Alert.alert(tt('हटाएं?'), s.recipientEmail, [
      { text: tt('रद्द करें'), style: 'cancel' },
      { text: tt('हटाएं'), style: 'destructive', onPress: async () => { await deleteReportSchedule(s.id); await load(); } },
    ]);
  };

  const generateNow = async (s) => {
    setGenBusyId(s.id);
    try {
      const result = await generateReportNow(s.id);
      // पहले सिर्फ़ Alert popup में flat टेक्स्ट दिखता था — अब row के नीचे
      // interactive preview खुलता है, दोबारा दबाने पर बंद हो जाता है
      setPreviews((p) => ({ ...p, [s.id]: p[s.id] ? null : result }));
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setGenBusyId(null);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={styles.headerRow}>
          <Text style={styles.h2}>Scheduled Reports</Text>
          {!isMonitor && (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((s) => !s)}>
              <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.white} />
            </TouchableOpacity>
          )}
        </View>
        {isMonitor && (
          <View style={styles.warningBox}>
            <Ionicons name="eye-outline" size={16} color={colors.marigold} />
            <Text style={styles.warningText}>
              {tt('आपकी भूमिका (DSP/ASP/SSP) सिर्फ़ देखने की अनुमति देती है — Schedule जोड़ना/हटाना/बदलना District Admin या Super Admin ही कर सकते हैं।')}
            </Text>
          </View>
        )}
        <View style={styles.warningBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.marigold} />
          <Text style={styles.warningText}>
            {tt('असली ईमेल भेजने के लिए सर्वर पर SMTP कॉन्फ़िगर होना ज़रूरी है — अभी "generate करें" सिर्फ़ report का डेटा दिखाता है, ईमेल नहीं भेजता।')}
          </Text>
        </View>

        {showForm && !isMonitor && (
          <View style={styles.card}>
            <TextInput style={styles.input} placeholder={tt('ईमेल पता')} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} maxLength={254} />
            <View style={[styles.pickerWrap, { marginTop: 10 }]}>
              <Picker selectedValue={frequency} onValueChange={setFrequency}>
                <Picker.Item label={tt('साप्ताहिक')} value="weekly" />
                <Picker.Item label={tt('मासिक')} value="monthly" />
              </Picker>
            </View>
            <PrimaryButton title={busy ? tt('जोड़ा जा रहा है…') : 'Schedule जोड़ें'} onPress={addSchedule} style={{ marginTop: 14 }}  loading={busy} />
          </View>
        )}

        {schedules.map((s) => (
          <View key={s.id}>
            <View style={styles.scheduleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleEmail}>{s.recipientEmail}</Text>
                <Text style={styles.scheduleMeta}>
                  {s.frequency === 'weekly' ? 'साप्ताहिक' : 'मासिक'} {s.district ? `· ${s.district}` : ''}
                </Text>
                {s.lastSentAt && <Text style={styles.scheduleMeta}>आख़िरी बार: {formatDateTime(s.lastSentAt)}</Text>}
              </View>
              <TouchableOpacity onPress={() => generateNow(s)} style={styles.genBtn} disabled={isMonitor || genBusyId === s.id}>
                <Ionicons name={previews[s.id] ? 'stats-chart' : 'play'} size={14} color={isMonitor ? colors.inkLight : colors.white} />
              </TouchableOpacity>
              <Switch value={s.isActive} onValueChange={() => toggle(s)} trackColor={{ true: colors.shaktiMaroon }} disabled={isMonitor} />
              {!isMonitor && (
                <TouchableOpacity onPress={() => remove(s)} style={{ marginLeft: 8 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.alert} />
                </TouchableOpacity>
              )}
            </View>
            <ReportPreview report={previews[s.id]} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  addBtn: { backgroundColor: colors.shaktiMaroon, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  warningBox: { flexDirection: 'row', gap: 8, backgroundColor: colors.marigoldWash, borderRadius: radius.md, padding: 12, marginTop: 12, marginBottom: 16 },
  warningText: { flex: 1, fontSize: 11, color: colors.inkGrey, lineHeight: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  pickerWrap: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  scheduleEmail: { fontSize: 13, fontWeight: '700', color: colors.inkNavy },
  scheduleMeta: { fontSize: 10.5, color: colors.inkGrey, marginTop: 2 },
  genBtn: { backgroundColor: colors.sage, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 8 },

  previewBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginTop: -4, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  previewStatusBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: radius.sm, marginBottom: 10 },
  previewStatusOk: { backgroundColor: '#EAF4EE' },
  previewStatusWarn: { backgroundColor: '#FBF3E6' },
  previewStatusText: { fontSize: 11, color: colors.inkGrey, flex: 1, lineHeight: 15 },
  pdfDownloadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.shaktiMaroon, borderRadius: radius.sm, paddingVertical: 10, marginBottom: 12 },
  pdfDownloadBtnText: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
  previewKpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  previewKpiTile: { width: '31%', backgroundColor: colors.sand, borderRadius: radius.sm, padding: 9, borderLeftWidth: 3 },
  previewKpiValue: { fontSize: 15, fontWeight: '800', color: colors.inkNavy },
  previewKpiLabel: { fontSize: 9, color: colors.inkGrey, marginTop: 2 },
  previewCatBox: { marginTop: 4 },
  previewCatTitle: { fontSize: 11.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 8 },
  previewCatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  previewCatLabel: { width: 90, fontSize: 10, color: colors.inkGrey },
  previewCatTrack: { flex: 1, height: 7, backgroundColor: colors.sand, borderRadius: 4, overflow: 'hidden' },
  previewCatFill: { height: '100%', backgroundColor: colors.shaktiMaroon, borderRadius: 4 },
  previewCatCount: { width: 24, fontSize: 10, fontWeight: '700', color: colors.inkNavy, textAlign: 'right' },
  previewMeta: { fontSize: 9.5, color: colors.inkLight, marginTop: 8, textAlign: 'right' },
});
