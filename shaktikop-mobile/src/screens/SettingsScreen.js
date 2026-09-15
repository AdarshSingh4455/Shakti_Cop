import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { tt, useLocale } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { PrimaryButton } from '../components/Buttons';
import { isBackgroundTrackingActive, stopBackgroundTracking } from '../utils/backgroundLocation';

// ============================================================
// सेटिंग्स — तीनों भूमिकाओं के लिए एक ही स्क्रीन, पर दिखता वही है
// जो उस भूमिका के काम का हो। Super Admin की अलग "ऐप सेटिंग्स"
// स्क्रीन पूरे तंत्र को नियंत्रित करती है — वहाँ से यहाँ लिंक है।
// ============================================================

const NOTIF_KEY = 'shaktikop:notificationsEnabled';

function Section({ title, subtitle, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{tt(title)}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{tt(subtitle)}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ icon, label, hint, right, onPress, danger, last }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[styles.row, last && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={danger ? colors.alert : colors.inkNavy} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.alert }]}>{tt(label)}</Text>
        {hint ? <Text style={styles.rowHint}>{tt(hint)}</Text> : null}
      </View>
      {right !== undefined ? right : onPress ? <Ionicons name="chevron-forward" size={17} color={colors.inkLight} /> : null}
    </Wrap>
  );
}

export default function SettingsScreen({ navigation }) {
  const { role, user, logout, logoutAllDevices, fetchStationPerformance, updateNotificationPreferences } = useApp();
  const { locale, setLocale, availableLocales } = useLocale();

  const [notifOn, setNotifOn] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const isAdmin = role === 'admin';
  const isSuperAdmin = isAdmin && user?.adminRole === 'super_admin';
  const isMonitor = isAdmin && user?.adminRole === 'monitor';
  const isSHO = role === 'officer' && user?.rank === 'SHO';

  // 🆕 SHO — अपने थाने का सारांश
  const [stationPerf, setStationPerf] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 🆕 SHO/अधिकारी — कौन सी push सूचनाएं चाहिए
  const [prefs, setPrefs] = useState(user?.notificationPreferences || { newComplaint: true, sos: true, overdue: true, assigned: true });
  const [prefsBusy, setPrefsBusy] = useState(false);

  useEffect(() => {
    if (isSHO) {
      setStatsLoading(true);
      fetchStationPerformance()
        .then(setStationPerf)
        .catch(() => {})
        .finally(() => setStatsLoading(false));
    }
  }, [isSHO]);

  const togglePref = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setPrefsBusy(true);
    try {
      await updateNotificationPreferences(next);
    } catch (e) {
      setPrefs(prefs); // विफल हो तो वापस पुरानी स्थिति
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPrefsBusy(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const n = await AsyncStorage.getItem(NOTIF_KEY);
        if (n !== null) setNotifOn(n === 'true');
      } catch (e) {
        // ignore
      }
      setTracking(await isBackgroundTrackingActive());
    })();
  }, []);


  const toggleNotif = async (v) => {
    setNotifOn(v);
    try {
      await AsyncStorage.setItem(NOTIF_KEY, String(v));
    } catch (e) {
      // ignore
    }
    if (!v) {
      Alert.alert(
        tt('ध्यान दें'),
        tt('सूचनाएं बंद करने पर भी SOS व आपात अलर्ट आते रहेंगे — ये आपकी सुरक्षा के लिए ज़रूरी हैं।')
      );
    }
  };

  const stopTracking = async () => {
    await stopBackgroundTracking();
    setTracking(false);
    Alert.alert(tt('बंद हो गई'), tt('लोकेशन ट्रैकिंग रोक दी गई है।'));
  };

  const openSystemSettings = () => {
    Linking.openSettings().catch(() => Alert.alert(tt('त्रुटि'), tt('सेटिंग्स नहीं खुल सकीं।')));
  };

  const langLabel =
    (availableLocales || []).find((l) => l.code === locale)?.label || (locale === 'en' ? 'English' : 'हिंदी');

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 50 }}>
      {/* परिचय पट्टी */}
      <View style={styles.headCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>🙏</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headName}>{user?.name || '—'}</Text>
          <Text style={styles.headRole}>
            {role === 'citizen' ? tt('नागरिक') : role === 'officer' ? tt('अधिकारी') : tt('एडमिन')}
            {isSuperAdmin ? ' · Super Admin' : isMonitor ? ` · ${user?.rank || ''}` : ''}
            {user?.district ? ` · ${tt(user.district)}` : ''}
          </Text>
        </View>
      </View>

      {/* ---------- भाषा ---------- */}
      {/* शीर्षक पहले "भाषा व प्रदर्शन" था, क्योंकि यहाँ अक्षरों का आकार बदलने वाला
          विकल्प भी था। वह सुविधा हटा दी गई है, इसलिए अब सिर्फ़ "भाषा"।
          साथ ही इस पंक्ति पर last लगाया गया है — पहले इसके नीचे फ़ॉन्ट वाला हिस्सा
          आता था, इसलिए इसकी नीचे वाली लकीर सही लगती थी; अब यह अकेली पंक्ति है और
          बिना last के एक अधूरी लकीर लटकी दिखती। */}
      <Section title="भाषा">
        <Row
          icon="language-outline"
          label="ऐप की भाषा"
          hint={langLabel}
          onPress={() => setLangOpen(true)}
          last
        />
      </Section>

      {/* 🆕 "किन-किन डिवाइस में लॉगिन है" — पहले सिर्फ़ "सभी डिवाइस से लॉगआउट" ही
          logout-confirmation के अंदर छुपा था, अलग से किसी सूची को देखने का कोई
          रास्ता नहीं था */}
      <Section title="सुरक्षा">
        <Row
          icon="phone-portrait-outline"
          label="मेरे लॉगिन डिवाइस"
          hint="कहां-कहां लॉगिन है देखें, चाहें तो किसी एक को अलग से लॉगआउट करें"
          onPress={() => navigation.navigate('ActiveSessions')}
          last
        />
      </Section>

      {/* ---------- सूचनाएं ---------- */}
      <Section title="सूचनाएं">
        <Row
          icon="notifications-outline"
          label="सूचनाएं चालू रखें"
          hint="शिकायत अपडेट, संदेश व घोषणाएं"
          right={<Switch value={notifOn} onValueChange={toggleNotif} trackColor={{ true: colors.sage }} />}
        />
        <Row
          icon="phone-portrait-outline"
          label="फ़ोन की सूचना सेटिंग खोलें"
          hint="अनुमति यहीं से बदली जा सकती है"
          onPress={openSystemSettings}
          last
        />
      </Section>

      {/* ---------- निजता व सुरक्षा ---------- */}
      <Section title="निजता व सुरक्षा">
        {role === 'citizen' && (
          <Row
            icon="navigate-circle-outline"
            label="लोकेशन ट्रैकिंग"
            hint={tracking ? 'अभी चालू है — पुलिस आपकी लोकेशन देख सकती है' : 'अभी बंद है'}
            right={
              tracking ? (
                <TouchableOpacity style={styles.stopBtn} onPress={stopTracking}>
                  <Text style={styles.stopBtnText}>{tt('बंद करें')}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.offText}>{tt('बंद')}</Text>
              )
            }
          />
        )}
        <Row
          icon="location-outline"
          label="ऐप की अनुमतियां"
          hint="लोकेशन, कैमरा, माइक्रोफ़ोन"
          onPress={openSystemSettings}
        />
        {role === 'citizen' && (
          <Row
            icon="people-outline"
            label="इमरजेंसी संपर्क"
            hint="SOS पर इन्हें भी सूचना जाती है"
            onPress={() => navigation.navigate('CitizenProfile')}
          />
        )}
        <Row
          icon="key-outline"
          label="पासवर्ड बदलें"
          onPress={() =>
            navigation.navigate(
              role === 'citizen' ? 'CitizenProfile' : role === 'officer' ? 'OfficerProfile' : 'AdminProfile'
            )
          }
          last
        />
      </Section>

      {/* ---------- अधिकारी के लिए ---------- */}
      {role === 'officer' && (
        <Section title="ड्यूटी" subtitle="आपकी उपलब्धता के अनुसार ही नए मामले मिलते हैं">
          <Row
            icon="briefcase-outline"
            label="ड्यूटी स्थिति"
            hint={user?.dutyStatus || 'उपलब्ध'}
            onPress={() => navigation.navigate('OfficerProfile')}
            last
          />
        </Section>
      )}

      {/* ---------- SHO — अपने थाने का सारांश ---------- */}
      {isSHO && (
        <Section title="थाने का सारांश" subtitle="आपके पूरे थाने की शिकायतों की स्थिति — एक नज़र में">
          {statsLoading ? (
            <Text style={[styles.rowHint, { padding: 14 }]}>{tt('लोड हो रहा है…')}</Text>
          ) : stationPerf ? (
            <>
              <View style={styles.statGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{stationPerf.total}</Text>
                  <Text style={styles.statLabel}>{tt('कुल')}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: colors.marigold }]}>{stationPerf.pending}</Text>
                  <Text style={styles.statLabel}>{tt('लंबित')}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: colors.sage }]}>{stationPerf.resolved}</Text>
                  <Text style={styles.statLabel}>{tt('निस्तारित')}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: colors.alert }]}>{stationPerf.overdue}</Text>
                  <Text style={styles.statLabel}>{tt('Overdue')}</Text>
                </View>
              </View>
              {stationPerf.avgResolutionHours != null && (
                <Text style={styles.avgResText}>
                  {tt('औसत निस्तारण समय')}: {stationPerf.avgResolutionHours} {tt('घंटे')}
                </Text>
              )}
              {stationPerf.officers?.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.officerListTitle}>{tt('अधिकारी-वार')}</Text>
                  {stationPerf.officers.map((o) => (
                    <View key={o.id} style={styles.officerStatRow}>
                      <Text style={styles.officerStatName} numberOfLines={1}>{o.name} ({o.rank})</Text>
                      <Text style={styles.officerStatNums}>
                        <Text style={{ color: colors.sage, fontWeight: '700' }}>{o.resolved}</Text> निस्तारित ·{' '}
                        <Text style={{ color: colors.marigold, fontWeight: '700' }}>{o.active}</Text> सक्रिय
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={[styles.rowHint, { padding: 14 }]}>{tt('डेटा लोड नहीं हो सका।')}</Text>
          )}
        </Section>
      )}

      {/* ---------- अधिकारी — कौन सी push सूचनाएं चाहिए ---------- */}
      {role === 'officer' && (
        <Section title="सूचना प्राथमिकताएं" subtitle="कौन सी push सूचनाएं फ़ोन पर चाहिए (SOS हमेशा भेजी जाती है, सुरक्षा कारणों से बंद नहीं की जा सकती)">
          <Row
            icon="document-text-outline"
            label="नई शिकायत दर्ज होने पर"
            right={<Switch value={prefs.newComplaint} onValueChange={() => togglePref('newComplaint')} disabled={prefsBusy} trackColor={{ true: colors.sage }} />}
          />
          <Row
            icon="person-add-outline"
            label="मामला नियुक्त होने पर"
            right={<Switch value={prefs.assigned} onValueChange={() => togglePref('assigned')} disabled={prefsBusy} trackColor={{ true: colors.sage }} />}
          />
          <Row
            icon="alarm-outline"
            label="मामला Overdue होने पर"
            right={<Switch value={prefs.overdue} onValueChange={() => togglePref('overdue')} disabled={prefsBusy} trackColor={{ true: colors.sage }} />}
            last
          />
        </Section>
      )}

      {/* ---------- Super Admin — अलग व स्पष्ट ---------- */}
      {isSuperAdmin && (
        <View style={styles.section}>
          <View style={styles.superHead}>
            <Ionicons name="shield-half" size={16} color={colors.white} />
            <Text style={styles.superTitle}>{tt('तंत्र नियंत्रण — सिर्फ़ Super Admin')}</Text>
          </View>
          <Text style={styles.superWarn}>
            {tt('यहाँ किया गया बदलाव पूरे प्रदेश के सभी उपयोगकर्ताओं पर तुरंत लागू होता है।')}
          </Text>
          <View style={[styles.card, styles.superCard]}>
            <Row
              icon="toggle-outline"
              label="ऐप सेटिंग्स (Feature Flags, रखरखाव मोड)"
              hint="पूरे ऐप का व्यवहार नियंत्रित करें"
              onPress={() => navigation.navigate('AppSettingsMenu')}
            />
            <Row
              icon="color-palette-outline"
              label="रूप-रंग व लेआउट"
              hint="रंग, कोने, कार्ड व तालिका की शैली"
              onPress={() => navigation.navigate('Appearance')}
            />
            <Row
              icon="cloud-download-outline"
              label="बैकअप व पुनर्स्थापन"
              hint="डेटाबेस का बैकअप लें या वापस लाएं"
              onPress={() => navigation.navigate('BackupRestore')}
            />
            <Row
              icon="language-outline"
              label="भाषा प्रबंधन"
              hint="नई भाषा जोड़ें व अनुवाद बदलें"
              onPress={() => navigation.navigate('LanguageManagementMenu')}
            />
            <Row
              icon="map-outline"
              label="ज़िला/थाना सूची"
              hint="मास्टर सूची जोड़ें व बदलें"
              onPress={() => navigation.navigate('LocationDataMenu')}
            />
            <Row
              icon="list-outline"
              label="शिकायत श्रेणियां"
              hint="श्रेणी, SLA व फ़ॉर्म फ़ील्ड्स"
              onPress={() => navigation.navigate('CategoriesMenu')}
            />
            <Row
              icon="people-circle-outline"
              label="प्रशासनिक खाते"
              hint="DSP, ASP, SSP व District Admin"
              onPress={() => navigation.navigate('ManageAdmins')}
              last
            />
          </View>
        </View>
      )}

      {/* ---------- एडमिन (Super Admin नहीं) ---------- */}
      {isAdmin && !isSuperAdmin && (
        <Section title="प्रशासन">
          <Row
            icon="settings-outline"
            label="एडमिन सेटिंग्स"
            hint="अपने दायरे की सेटिंग्स"
            onPress={() => navigation.navigate('AdminSettings')}
            last
          />
        </Section>
      )}

      {/* ---------- मदद व जानकारी ---------- */}
      <Section title="मदद व जानकारी">
        <Row
          icon="help-circle-outline"
          label="मदद और सामान्य प्रश्न"
          onPress={() => navigation.navigate(role === 'citizen' ? 'Faq' : 'Faq')}
        />
        <Row
          icon="lock-closed-outline"
          label="गोपनीयता नीति"
          hint="DPDP अधिनियम 2023 के अंतर्गत"
          onPress={() => navigation.navigate('PrivacyPolicy')}
        />
        <Row icon="information-circle-outline" label="ऐप संस्करण" hint={`ShaktiCop ${appVersion}`} />
        <Row
          icon="shield-checkmark-outline"
          label="उत्तर प्रदेश पुलिस — मिशन शक्ति"
          hint="आधिकारिक उत्तर प्रदेश सरकार पहल"
          last
        />
      </Section>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => setLogoutOpen(true)}>
        <Ionicons name="log-out-outline" size={18} color={colors.alert} />
        <Text style={styles.logoutText}>{tt('लॉगआउट')}</Text>
      </TouchableOpacity>

      {/* भाषा चुनें */}
      <Modal visible={langOpen} transparent animationType="slide" onRequestClose={() => setLangOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tt('ऐप की भाषा चुनें')}</Text>
            {(availableLocales?.length ? availableLocales : [{ code: 'hi', label: 'हिंदी' }, { code: 'en', label: 'English' }]).map(
              (l) => (
                <TouchableOpacity
                  key={l.code}
                  style={styles.optionRow}
                  onPress={() => {
                    setLocale(l.code);
                    setLangOpen(false);
                  }}
                >
                  <Ionicons
                    name={locale === l.code ? 'radio-button-on' : 'radio-button-off'}
                    size={19}
                    color={locale === l.code ? colors.shaktiMaroon : colors.inkLight}
                  />
                  <Text style={styles.optionText}>{l.label}</Text>
                </TouchableOpacity>
              )
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setLangOpen(false)}>
              <Text style={styles.cancelText}>{tt('रद्द करें')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* लॉगआउट की पुष्टि */}
      <Modal visible={logoutOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tt('लॉगआउट करें?')}</Text>
            <Text style={styles.modalMsg}>
              {tracking
                ? tt('लोकेशन ट्रैकिंग भी बंद हो जाएगी। दोबारा लॉगिन करके ही शिकायत दर्ज या ट्रैक कर सकेंगे।')
                : tt('दोबारा लॉगिन करके ही शिकायत दर्ज या ट्रैक कर सकेंगे।')}
            </Text>
            <PrimaryButton title={tt('हाँ, लॉगआउट करें')} onPress={logout} />
            {/* 🆕 फ़ोन चोरी/खोने या खाता compromise होने के शक़ पर — एक टैप में सभी डिवाइस से */}
            <TouchableOpacity
              style={styles.logoutAllLink}
              onPress={() => {
                setLogoutOpen(false);
                Alert.alert(
                  tt('सभी डिवाइस से लॉगआउट करें?'),
                  tt('अगर आपका फ़ोन खो गया है या किसी और ने आपके खाते में लॉगिन किया हो सकता है, तो यह हर जगह से एक साथ लॉगआउट कर देगा।'),
                  [
                    { text: tt('रद्द करें'), style: 'cancel' },
                    { text: tt('हाँ, सभी जगह से'), style: 'destructive', onPress: logoutAllDevices },
                  ]
                );
              }}
            >
              <Text style={styles.logoutAllText}>{tt('सभी डिवाइस से लॉगआउट करें')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setLogoutOpen(false)}>
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
  headCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.shaktiMaroon, borderRadius: radius.lg, padding: 14, marginBottom: 16 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22 },
  headName: { fontSize: 15.5, fontWeight: '800', color: colors.white },
  headRole: { fontSize: 11.5, color: '#F0DCE2', marginTop: 2 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.inkNavy, marginBottom: 3, marginLeft: 2 },
  sectionSub: { fontSize: 11, color: colors.inkLight, marginBottom: 6, marginLeft: 2 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F2EFE9' },
  rowLabel: { fontSize: 13.5, color: colors.inkNavy, fontWeight: '600' },
  rowHint: { fontSize: 11, color: colors.inkLight, marginTop: 2 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 14 },
  statBox: { flexBasis: '22%', flexGrow: 1, alignItems: 'center', backgroundColor: colors.sand, borderRadius: radius.sm, paddingVertical: 10 },
  statNum: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  statLabel: { fontSize: 10, color: colors.inkLight, marginTop: 2, fontWeight: '600' },
  avgResText: { fontSize: 11.5, color: colors.inkGrey, paddingBottom: 10 },
  officerListTitle: { fontSize: 11, fontWeight: '700', color: colors.inkLight, marginBottom: 6, textTransform: 'uppercase' },
  officerStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F2EFE9' },
  officerStatName: { fontSize: 12.5, color: colors.inkNavy, fontWeight: '600', flex: 1, marginRight: 8 },
  officerStatNums: { fontSize: 11, color: colors.inkGrey },
  stopBtn: { backgroundColor: colors.alert, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  stopBtnText: { color: colors.white, fontSize: 11.5, fontWeight: '800' },
  offText: { fontSize: 12, color: colors.inkLight, fontWeight: '600' },
  superHead: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.inkNavy, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  superTitle: { fontSize: 12.5, fontWeight: '800', color: colors.white },
  superWarn: { fontSize: 10.5, color: '#B26A00', backgroundColor: '#FFF8E6', paddingHorizontal: 12, paddingVertical: 7, lineHeight: 15 },
  superCard: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderColor: colors.inkNavy, borderWidth: 1.5 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 14, borderWidth: 1.5, borderColor: colors.alert, marginTop: 4 },
  logoutText: { fontSize: 14, fontWeight: '800', color: colors.alert },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,42,68,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18 },
  modalTitle: { fontSize: 15.5, fontWeight: '800', color: colors.inkNavy, marginBottom: 10, textAlign: 'center' },
  modalMsg: { fontSize: 12.5, color: colors.inkGrey, textAlign: 'center', marginBottom: 14, lineHeight: 18 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { flex: 1, fontSize: 13.5, color: colors.inkNavy },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 13, fontWeight: '700', color: colors.inkGrey },
  logoutAllLink: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  logoutAllText: { fontSize: 12.5, fontWeight: '700', color: colors.alert, textDecorationLine: 'underline' },
});
