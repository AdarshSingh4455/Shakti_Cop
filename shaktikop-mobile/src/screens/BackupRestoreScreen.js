import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import CryptoJS from 'crypto-js';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { formatDateTime } from '../utils/datetime';

import { LoadingView } from '../components/LoadingView';
// फ़ाइल चुनने वाला module — न मिले तो ऐप टूटे नहीं, बस restore बंद रहे
let DocumentPicker = null;
let PICKER_AVAILABLE = false;
try {
  DocumentPicker = require('expo-document-picker');
  PICKER_AVAILABLE = !!DocumentPicker?.getDocumentAsync;
} catch (e) {
  PICKER_AVAILABLE = false;
}

const GROUP_LABEL = {
  config: 'कॉन्फ़िगरेशन',
  content: 'ऐप का content',
  people: 'खाते (संवेदनशील)',
  data: 'शिकायत व सेवा डेटा',
};

export default function BackupRestoreScreen() {
  const { fetchBackupStats, createBackup, restoreBackup } = useApp();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);

  // restore
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('merge');
  const [password, setPassword] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await fetchBackupStats();
      setStats(s);
      const sel = {};
      (s.tables || []).forEach((t) => {
        sel[t.name] = true;
      });
      setSelected(sel);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setLoading(false);
  }, [fetchBackupStats]);

  useEffect(() => {
    load();
  }, [load]);

  const chosenTables = Object.keys(selected).filter((k) => selected[k]);
  const chosenRows = (stats?.tables || [])
    .filter((t) => selected[t.name])
    .reduce((a, b) => a + b.rows, 0);

  // ---------- बैकअप बनाएं ----------
  const doBackup = async () => {
    if (chosenTables.length === 0) {
      return Alert.alert(tt('कुछ नहीं चुना'), tt('कम से कम एक तालिका चुनें।'));
    }
    // 🔒 बैकअप फ़ाइल अब इसी पासवर्ड से encrypt होती है — खाली पासवर्ड से encrypt करना
    // बिना encryption से भी बुरा होता: फ़ाइल "सुरक्षित" दिखती, पर कोई भी खोल लेता।
    if (!password) {
      return Alert.alert(
        tt('पासवर्ड भरें'),
        tt('बैकअप फ़ाइल आपके लॉगिन पासवर्ड से सुरक्षित (encrypted) की जाती है — नीचे "पासवर्ड" वाले खाने में उसे भरें। restore करते समय यही पासवर्ड लगेगा।')
      );
    }
    setBusy(true);
    try {
      const backup = await createBackup(chosenTables);
      // 🐛 बग फ़िक्स: backend हर तालिका से अधिकतम 20,000 पंक्तियां ही लेता है और बता
      // भी देता है कि कौन-सी तालिकाएं काटी गईं (truncated) — पर UI इसे पूरी तरह
      // अनदेखा कर रही थी। नतीजा: एडमिन को लगता कि पूरा बैकअप बन गया, जबकि रिकॉर्ड
      // चुपचाप छूट गए होते — और यह बात तब पता चलती जब असल में restore करना पड़ता,
      // यानी ठीक उस वक़्त जब सुधारने का कोई मौक़ा नहीं बचता।
      if (backup?.meta?.truncated?.length > 0) {
        Alert.alert(
          tt('बैकअप अधूरा है'),
          tt(`इन तालिकाओं में 20,000 से ज़्यादा पंक्तियां हैं, इसलिए सिर्फ़ पहली 20,000 ही ली गईं: ${backup.meta.truncated.join(', ')}\n\nपूरा बैकअप लेने के लिए तकनीकी टीम से सीधे database dump लेने को कहें।`)
        );
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

      // 🔒 सुरक्षा फ़िक्स: बैकअप फ़ाइल पहले सादे (unencrypted) JSON के रूप में लिखकर
      // OS के share-sheet से भेजी जाती थी — यानी WhatsApp/Gmail/Drive के ज़रिए किसी
      // तीसरी सेवा के सर्वर तक, फ़ोन की gallery में, और cloud-backup में भी पहुँच
      // जाती। उस फ़ाइल में हर नागरिक का नाम, मोबाइल व पता (सादे रूप में) और हर खाते
      // का password_hash तक होता है। अब वह पहले admin के अपने लॉगिन-पासवर्ड से
      // encrypt होती है — फ़ाइल आगे भेज दी जाए या फ़ोन खो जाए, तब भी बिना पासवर्ड
      // पढ़ी नहीं जा सकती।
      //
      // ⚠️ पासवर्ड यहाँ अलग से नहीं पूछा जाता — वही लॉगिन पासवर्ड इस्तेमाल होता है,
      //    जो restore के समय वैसे भी दोबारा माँगा जाता है। इससे एक और पासवर्ड याद
      //    रखने का बोझ नहीं पड़ता, और भूल जाने पर बैकअप बेकार होने का ख़तरा भी नहीं।
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(backup), password).toString();
      const envelope = {
        meta: { app: 'ShaktiCop', encrypted: true, createdAt: new Date().toISOString() },
        payload: encrypted,
      };
      const uri = `${FileSystem.documentDirectory}shaktikop-backup-${stamp}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(envelope), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/json' });
      } else {
        Alert.alert(tt('फ़ाइल तैयार'), uri);
      }
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  // ---------- फ़ाइल चुनें ----------
  const pickFile = async () => {
    if (!PICKER_AVAILABLE) {
      return Alert.alert(
        tt('उपलब्ध नहीं'),
        tt('फ़ाइल चुनने की सुविधा इस build में नहीं है। कृपया expo-document-picker जोड़कर नई APK बनाएं।')
      );
    }
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri);
      let parsed = JSON.parse(text);

      // 🔒 नई (encrypted) फ़ाइल — खोलने के लिए वही पासवर्ड चाहिए जिससे बैकअप बना था
      if (parsed?.meta?.encrypted && parsed?.payload) {
        if (!password) {
          return Alert.alert(
            tt('पासवर्ड चाहिए'),
            tt('यह बैकअप फ़ाइल सुरक्षित (encrypted) है। नीचे "पासवर्ड" वाले खाने में अपना लॉगिन पासवर्ड भरकर फिर से फ़ाइल चुनें।')
          );
        }
        try {
          const plain = CryptoJS.AES.decrypt(parsed.payload, password).toString(CryptoJS.enc.Utf8);
          if (!plain) throw new Error('empty');
          parsed = JSON.parse(plain);
        } catch (e) {
          return Alert.alert(
            tt('पासवर्ड ग़लत है'),
            tt('इस फ़ाइल को खोला नहीं जा सका। वही पासवर्ड डालें जो बैकअप बनाते समय आपके खाते का था।')
          );
        }
      }

      if (parsed?.meta?.app !== 'ShaktiCop') {
        return Alert.alert(tt('गलत फ़ाइल'), tt('यह ShaktiCop की बैकअप फ़ाइल नहीं लगती।'));
      }
      setFile({ name: asset.name, backup: parsed });
      setPreview(null);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('फ़ाइल पढ़ी नहीं जा सकी।'));
    }
  };

  // ---------- पहले जाँचें (dry run) ----------
  const doPreview = async () => {
    if (!file) return;
    setRestoreBusy(true);
    try {
      const r = await restoreBackup({ backup: file.backup, mode, dryRun: true });
      setPreview(r);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setRestoreBusy(false);
  };

  // ---------- असली पुनर्स्थापन ----------
  const doRestore = async () => {
    if (!password.trim()) {
      return Alert.alert(tt('पासवर्ड चाहिए'), tt('पुष्टि हेतु अपना पासवर्ड दर्ज करें।'));
    }
    setRestoreBusy(true);
    try {
      const r = await restoreBackup({ backup: file.backup, mode, password: password.trim() });
      setConfirmOpen(false);
      setPassword('');
      setFile(null);
      setPreview(null);
      await load();
      Alert.alert(
        tt('पुनर्स्थापन पूर्ण'),
        `${r.restored} ${tt('पंक्तियां वापस लाई गईं।')}${r.skippedAdmins ? '\n\n' + tt('एडमिन खाते सुरक्षा कारणों से नहीं बदले गए।') : ''}`
      );
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setRestoreBusy(false);
  };

  if (loading) {
    return (
      <LoadingView />
    );
  }

  const groups = {};
  (stats?.tables || []).forEach((t) => {
    (groups[t.group] = groups[t.group] || []).push(t);
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 50 }}>
      {/* ⚠️ चेतावनी सबसे ऊपर — यह फ़ाइल असल में क्या है, यह साफ़ होना चाहिए */}
      <View style={styles.warnBox}>
        <Ionicons name="shield-half" size={18} color={colors.alert} />
        <Text style={styles.warnText}>
          {tt('बैकअप फ़ाइल में हर नागरिक का नाम, मोबाइल, पता और शिकायत का पूरा विवरण होता है। इसे कभी WhatsApp, ईमेल या किसी निजी डिवाइस पर न भेजें — सिर्फ़ विभाग के सुरक्षित संग्रह में रखें।')}
        </Text>
      </View>

      {/* ---------- बैकअप ---------- */}
      <Text style={styles.h2}>{tt('बैकअप बनाएं')}</Text>
      <View style={styles.summaryRow}>
        <View style={styles.sumCard}>
          <Text style={styles.sumNum}>{chosenTables.length}</Text>
          <Text style={styles.sumLabel}>{tt('तालिकाएं चुनीं')}</Text>
        </View>
        <View style={styles.sumCard}>
          <Text style={styles.sumNum}>{chosenRows.toLocaleString('en-IN')}</Text>
          <Text style={styles.sumLabel}>{tt('कुल पंक्तियां')}</Text>
        </View>
      </View>

      {Object.keys(groups).map((g) => (
        <View key={g} style={styles.card}>
          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>{tt(GROUP_LABEL[g] || g)}</Text>
            <TouchableOpacity
              onPress={() => {
                const allOn = groups[g].every((t) => selected[t.name]);
                const next = { ...selected };
                groups[g].forEach((t) => {
                  next[t.name] = !allOn;
                });
                setSelected(next);
              }}
            >
              <Text style={styles.toggleAll}>
                {groups[g].every((t) => selected[t.name]) ? tt('सब हटाएं') : tt('सब चुनें')}
              </Text>
            </TouchableOpacity>
          </View>
          {groups[g].map((t) => (
            <TouchableOpacity
              key={t.name}
              style={styles.tableRow}
              onPress={() => setSelected({ ...selected, [t.name]: !selected[t.name] })}
            >
              <Ionicons
                name={selected[t.name] ? 'checkbox' : 'square-outline'}
                size={19}
                color={selected[t.name] ? colors.sage : colors.inkLight}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.tableLabel}>
                  {tt(t.label)}
                  {t.sensitive ? <Text style={styles.sensitive}> · {tt('संवेदनशील')}</Text> : null}
                </Text>
                <Text style={styles.tableName}>{t.name}</Text>
              </View>
              <Text style={styles.rowCount}>{t.rows.toLocaleString('en-IN')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <PrimaryButton
        title={busy ? tt('बैकअप बन रहा है…') : tt('बैकअप बनाएं व सुरक्षित करें')}
        onPress={doBackup}
        loading={busy}
      />

      {/* ---------- पुनर्स्थापन ---------- */}
      <Text style={[styles.h2, { marginTop: 26 }]}>{tt('पुनर्स्थापन (Restore)')}</Text>
      <View style={styles.dangerBox}>
        <Ionicons name="warning" size={17} color="#8C1A0F" />
        <Text style={styles.dangerText}>
          {tt('पुनर्स्थापन डेटा बदल देता है और इसे वापस नहीं किया जा सकता। पहले "जाँचें" दबाकर देखें कि क्या-क्या बदलेगा। एडमिन खाते कभी नहीं बदले जाते, ताकि आप बाहर न हो जाएं।')}
        </Text>
      </View>

      <View style={styles.card}>
        <SecondaryButton
          title={file ? file.name : tt('बैकअप फ़ाइल चुनें')}
          onPress={pickFile}
        />

        {file && (
          <>
            <Text style={styles.metaLine}>
              {tt('बनाई गई')}: {formatDateTime(file.backup.meta.createdAt)} · {file.backup.meta.createdBy}
            </Text>

            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'merge' && styles.modeBtnActive]}
                onPress={() => setMode('merge')}
              >
                <Text style={[styles.modeText, mode === 'merge' && styles.modeTextActive]}>
                  {tt('जोड़ें (सुरक्षित)')}
                </Text>
                <Text style={styles.modeHint}>{tt('मौजूदा डेटा नहीं हटेगा')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'replace' && styles.modeBtnDanger]}
                onPress={() => setMode('replace')}
              >
                <Text style={[styles.modeText, mode === 'replace' && styles.modeTextActive]}>
                  {tt('बदलें (ख़तरनाक)')}
                </Text>
                <Text style={styles.modeHint}>{tt('मौजूदा डेटा हट जाएगा')}</Text>
              </TouchableOpacity>
            </View>

            <SecondaryButton
              title={restoreBusy ? tt('जाँच रहे हैं…') : tt('पहले जाँचें — क्या बदलेगा?')}
              onPress={doPreview}
              loading={restoreBusy}
              style={{ marginTop: 10 }}
            />

            {preview && (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>{tt('जाँच का नतीजा')}</Text>
                {preview.report.map((r) => (
                  <View key={r.table} style={styles.previewRow}>
                    <Text style={styles.previewTable}>{r.table}</Text>
                    <Text style={styles.previewNum}>
                      +{r.incoming}
                      {r.willDelete > 0 ? <Text style={{ color: colors.alert }}> −{r.willDelete}</Text> : null}
                    </Text>
                  </View>
                ))}
                {preview.skippedAdmins && (
                  <Text style={styles.previewNote}>{tt('एडमिन खाते छोड़े गए (सुरक्षा हेतु)')}</Text>
                )}
                <PrimaryButton
                  title={tt('पुनर्स्थापन शुरू करें')}
                  onPress={() => setConfirmOpen(true)}
                  style={{ marginTop: 12 }}
                />
              </View>
            )}
          </>
        )}
      </View>

      {/* पासवर्ड की पुष्टि */}
      <Modal visible={confirmOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Ionicons name="lock-closed" size={30} color={colors.alert} style={{ alignSelf: 'center' }} />
            <Text style={styles.modalTitle}>{tt('अंतिम पुष्टि')}</Text>
            <Text style={styles.modalMsg}>
              {mode === 'replace'
                ? tt('चुनी गई तालिकाओं का मौजूदा डेटा हट जाएगा और बैकअप वाला डेटा आ जाएगा। यह वापस नहीं किया जा सकता।')
                : tt('बैकअप का डेटा मौजूदा डेटा में जोड़ा जाएगा। पहले से मौजूद पंक्तियां वैसी ही रहेंगी।')}
            </Text>
            <TextInput
              style={styles.pwInput}
              placeholder={tt('अपना पासवर्ड दर्ज करें')}
              secureTextEntry
              maxLength={16}
              value={password}
              onChangeText={setPassword}
            />
            <PrimaryButton
              title={restoreBusy ? tt('चल रहा है…') : tt('हाँ, पुनर्स्थापित करें')}
              onPress={doRestore}
              loading={restoreBusy}
            />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmOpen(false)}>
              <Text style={styles.cancelText}>{tt('रद्द करें')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  warnBox: { flexDirection: 'row', gap: 9, backgroundColor: '#FFF6F4', borderRadius: radius.md, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: colors.alert },
  warnText: { flex: 1, fontSize: 11.5, color: colors.inkNavy, lineHeight: 17 },
  h2: { fontSize: 15, fontWeight: '800', color: colors.inkNavy, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', gap: 9, marginBottom: 12 },
  sumCard: { flex: 1, backgroundColor: colors.inkNavy, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  sumNum: { fontSize: 20, fontWeight: '800', color: colors.white },
  sumLabel: { fontSize: 10.5, color: '#C9D6E4', marginTop: 2 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  groupTitle: { fontSize: 12.5, fontWeight: '800', color: colors.inkNavy },
  toggleAll: { fontSize: 11.5, fontWeight: '700', color: colors.shaktiMaroon },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F2EFE9' },
  tableLabel: { fontSize: 12.5, color: colors.inkNavy, fontWeight: '600' },
  sensitive: { fontSize: 10, color: colors.alert, fontWeight: '700' },
  tableName: { fontSize: 10, color: colors.inkLight },
  rowCount: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey },
  dangerBox: { flexDirection: 'row', gap: 9, backgroundColor: '#FFF1EE', borderRadius: radius.md, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#8C1A0F' },
  dangerText: { flex: 1, fontSize: 11.5, color: colors.inkNavy, lineHeight: 17 },
  metaLine: { fontSize: 11, color: colors.inkLight, marginTop: 8 },
  modeRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  modeBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: 10, alignItems: 'center' },
  modeBtnActive: { borderColor: colors.sage, backgroundColor: '#F4F9F6' },
  modeBtnDanger: { borderColor: colors.alert, backgroundColor: '#FFF6F4' },
  modeText: { fontSize: 12, fontWeight: '800', color: colors.inkGrey },
  modeTextActive: { color: colors.inkNavy },
  modeHint: { fontSize: 9.5, color: colors.inkLight, marginTop: 2, textAlign: 'center' },
  previewBox: { backgroundColor: colors.sand, borderRadius: radius.md, padding: 11, marginTop: 12 },
  previewTitle: { fontSize: 12.5, fontWeight: '800', color: colors.inkNavy, marginBottom: 6 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  previewTable: { fontSize: 11.5, color: colors.inkGrey },
  previewNum: { fontSize: 11.5, fontWeight: '700', color: colors.sage },
  previewNote: { fontSize: 10.5, color: colors.inkLight, fontStyle: 'italic', marginTop: 6 },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,42,68,0.55)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 20 },
  modalTitle: { fontSize: 16.5, fontWeight: '800', color: colors.inkNavy, textAlign: 'center', marginTop: 8 },
  modalMsg: { fontSize: 12.5, color: colors.inkGrey, textAlign: 'center', marginVertical: 12, lineHeight: 18 },
  pwInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 12 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 13, fontWeight: '700', color: colors.inkGrey },
});
