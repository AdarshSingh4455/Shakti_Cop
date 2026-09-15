import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import SafePicker from '../components/SafePicker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { DISTRICTS, stationsForDistrict } from '../data/districts';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';
import { validateName, validateMobile, validateEmail, sanitizeNameInput, sanitizeMobileInput } from '../utils/validators';

// साइड मेनू में DSP/ASP/SSP को कौन-कौन से आइटम दिख सकते हैं — Super Admin यहीं से तय करता है
const MENU_PERMISSION_ITEMS = [
  { key: 'allComplaints', label: 'सभी शिकायतें व श्रेणी-अनुसार सूचियां' },
  { key: 'analytics', label: 'विश्लेषण डैशबोर्ड (KPIs व Trends)' },
  { key: 'leaderboard', label: 'अधिकारी परफ़ॉर्मेंस Leaderboard' },
  { key: 'safeTravel', label: 'सुरक्षित यात्रा (SOS)' },
  { key: 'homeBanners', label: 'Home बैनर प्रबंधन' },
  { key: 'contentManagement', label: 'योजना/हेल्पलाइन प्रबंधन' },
  { key: 'qrScanner', label: 'QR स्कैन करें' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'activityLogs', label: 'गतिविधि लॉग' },
  { key: 'reportSchedules', label: 'Scheduled Reports' },
  { key: 'locationData', label: 'ज़िला/थाना सूची' },
  { key: 'categoriesManagement', label: 'शिकायत श्रेणियां' },
  { key: 'faqManagement', label: 'FAQ / मदद प्रबंधन' },
  { key: 'atr', label: 'कार्यवाही आख्या (ATR)' },
  { key: 'serviceRequests', label: 'सहायता सेवा प्रबंधन (काउंसलिंग/कानूनी सहायता आदि)' },
];

export default function ManageAdminsScreen() {
  const { user, fetchAdmins, createDistrictAdmin, deleteAdmin, updateAdminMenuPermissions, districtsVersion } = useApp();
  const isSuperAdmin = user?.adminRole === 'super_admin';
  const isSSP = user?.adminRole === 'monitor' && user?.rank === 'SSP';
  // 🆕 IG/DIG — SSP से भी ऊपर, कई ज़िलों का Range। सिर्फ़ Super Admin ही बना सकता है —
  // इसीलिए यह सिर्फ़ isSuperAdmin वाली सूची में जुड़ा है, SSP वाली सूची में नहीं।
  const monitorRanks = isSuperAdmin ? ['DSP', 'ASP', 'SSP', 'DIG', 'IG'] : ['DSP', 'ASP'];

  const [admins, setAdmins] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [accountType, setAccountType] = useState(isSuperAdmin ? 'district_admin' : 'monitor');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [district, setDistrictRaw] = useState(DISTRICTS[0]);
  const [rank, setRank] = useState(monitorRanks[0]);
  const [circleStations, setCircleStations] = useState([]);
  const [rangeDistricts, setRangeDistricts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [permsEditingId, setPermsEditingId] = useState(null); // किस admin की permissions खुली हैं
  const [permsDraft, setPermsDraft] = useState({});
  const [permsBusy, setPermsBusy] = useState(false);

  // ज़िला बदलने पर पुराने ज़िले के चुने हुए थाने अपने-आप साफ़ हो जाएं (ग़लत ज़िले के थाने न रह जाएं)
  const setDistrict = (d) => {
    setDistrictRaw(d);
    setCircleStations([]);
  };

  const toggleStation = (station) => {
    setCircleStations((prev) => (prev.includes(station) ? prev.filter((s) => s !== station) : [...prev, station]));
  };
  // 🆕 IG/DIG — Range में कौन-कौन से ज़िले शामिल हैं, चुनने के लिए
  const toggleRangeDistrict = (d) => {
    setRangeDistricts((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const load = useCallback(async () => {
    try {
      const data = await fetchAdmins();
      setAdmins(data);
    } catch (e) {
      // SSP को पूरी सूची नहीं मिलती (सिर्फ़ Super Admin को) — चुपचाप छोड़ें
    }
  }, [fetchAdmins]);

  useEffect(() => {
    load();
  }, [load]);

  const addAdmin = async () => {
    if (!name.trim() || !email.trim() || !mobile.trim() || !password.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('नाम, ईमेल आईडी, मोबाइल नंबर और पासवर्ड आवश्यक हैं।'));
      return;
    }
    // ⚠️ DSP/ASP/SSP का लॉगिन ईमेल/मोबाइल से होता है — दोनों अनिवार्य व validated हैं
    const nameErr = validateName(name);
    if (nameErr) return Alert.alert(tt('अमान्य नाम'), tt(nameErr));
    const mobileErr = validateMobile(mobile);
    if (mobileErr) return Alert.alert(tt('अमान्य मोबाइल नंबर'), tt(mobileErr));
    const emailErr = validateEmail(email);
    if (emailErr) return Alert.alert(tt('अमान्य ईमेल'), tt(emailErr));
    const circleStationsClean = circleStations;
    if (accountType === 'monitor' && rank === 'DSP' && circleStationsClean.length === 0) {
      Alert.alert(tt('थाने चुनें'), tt('DSP के लिए कम से कम एक थाना चुनें (सूची से टैप करके)।'));
      return;
    }
    // 🆕 IG/DIG के लिए कम से कम एक ज़िला (Range में) चुनना अनिवार्य
    if (accountType === 'monitor' && ['IG', 'DIG'].includes(rank) && rangeDistricts.length === 0) {
      Alert.alert(tt('ज़िले चुनें'), tt('IG/DIG के लिए कम से कम एक ज़िला (Range में) चुनें (सूची से टैप करके)।'));
      return;
    }
    setBusy(true);
    try {
      await createDistrictAdmin({
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        password,
        adminRole: accountType,
        // 🐛 बग फ़िक्स: पहले IG/DIG के लिए भी यहां एक अकेला district भेज दिया जाता —
        // IG/DIG का असली दायरा rangeDistricts (कई ज़िले) है, single district नहीं
        // 🐛 बग फ़िक्स (गंभीर सुरक्षा): SSP यहाँ से बाहर था — यानी SSP खाता district=null
        // के साथ बनता। backend में SSP का पूरा दायरा district पर ही टिका है
        // (adminScope = { district }) — district न हो तो adminScope खाली रह जाता है,
        // जिसका मतलब है "कोई सीमा नहीं" — यानी SSP को चुपचाप super_admin जैसी पूरे
        // राज्य की दृश्यता मिल जाती। सिर्फ़ IG/DIG के पास सही मायने में कोई एक ज़िला
        // नहीं होता (वे rangeDistricts इस्तेमाल करते हैं)।
        district: accountType === 'district_admin' || (accountType === 'monitor' && !['IG', 'DIG'].includes(rank)) ? district : undefined,
        rank: accountType === 'monitor' ? rank : undefined,
        circleStations: ['DSP', 'ASP', 'SSP'].includes(rank) ? circleStationsClean : undefined,
        rangeDistricts: ['IG', 'DIG'].includes(rank) ? rangeDistricts : undefined,
      });
      setName('');
      setEmail('');
      setMobile('');
      setPassword('');
      setCircleStations([]);
      setRangeDistricts([]);
      setShowForm(false);
      await load();
      Alert.alert(
        tt('खाता बन गया'),
        accountType === 'monitor'
          ? `${rank}: ${tt('नया खाता जोड़ा गया।')}`
          : `${district}: ${tt('नए District-Admin का खाता जोड़ा गया।')}`
      );
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt(e.message));
    }
    setBusy(false);
  };

  const removeAdmin = (a) => {
    Alert.alert(tt('हटाएं?'), `${a.name}`, [
      { text: tt('रद्द करें'), style: 'cancel' },
      {
        text: tt('हटाएं'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAdmin(a.id);
            await load();
          } catch (e) {
            Alert.alert(tt('त्रुटि'), e.message);
          }
        },
      },
    ]);
  };

  // सिर्फ़ Super Admin ही DSP/ASP/SSP की साइड-मेनू permissions बदल सकता है
  const openPerms = (a) => {
    if (permsEditingId === a.id) {
      setPermsEditingId(null);
      return;
    }
    setPermsEditingId(a.id);
    setPermsDraft(a.menuPermissions || {});
  };

  const togglePerm = (key) => {
    setPermsDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const savePerms = async (a) => {
    setPermsBusy(true);
    try {
      await updateAdminMenuPermissions(a.id, permsDraft);
      await load();
      setPermsEditingId(null);
      Alert.alert(tt('सुरक्षित हुआ'), tt('अनुमतियां अपडेट हो गईं — अगले लॉगिन पर साइड मेनू में दिखेंगी।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPermsBusy(false);
  };

  if (!isSuperAdmin && !isSSP) {
    return (
      <View style={styles.container}>
        <View style={styles.restrictedBox}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.inkLight} />
          <Text style={styles.restrictedText}>{tt('यह सेक्शन सिर्फ़ Super Admin और SSP के लिए है।')}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('प्रशासनिक खाते')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((s) => !s)}>
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        {isSSP
          ? 'आप सिर्फ़ DSP/ASP खाते बना सकते हैं — District-Admin या दूसरा SSP नहीं।'
          : 'District-Admin पूरा नियंत्रण रखता है (अपने ज़िले तक)। Monitor (DSP/ASP/SSP) सिर्फ़ देख सकता है, कोई बदलाव नहीं कर सकता।'}
      </Text>

      {showForm && (
        <View style={styles.card}>
          {isSuperAdmin && (
            <View style={styles.typeToggle}>
              <TouchableOpacity style={[styles.typeChip, accountType === 'district_admin' && styles.typeChipActive]} onPress={() => setAccountType('district_admin')}>
                <Text style={[styles.typeChipText, accountType === 'district_admin' && styles.typeChipTextActive]}>District-Admin</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeChip, accountType === 'monitor' && styles.typeChipActive]} onPress={() => setAccountType('monitor')}>
                <Text style={[styles.typeChipText, accountType === 'monitor' && styles.typeChipTextActive]}>Monitor (DSP/ASP/SSP)</Text>
              </TouchableOpacity>
            </View>
          )}

          <TextInput style={styles.input} placeholder={tt('पूरा नाम')} value={name} onChangeText={(t) => setName(sanitizeNameInput(t))} maxLength={80} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('ईमेल आईडी (इसी से लॉगिन होगा)')} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} maxLength={254} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('मोबाइल नंबर (10 अंक, आवश्यक)')} keyboardType="number-pad" maxLength={10} value={mobile} onChangeText={(t) => setMobile(sanitizeMobileInput(t))} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('8-16 अक्षर')} secureTextEntry maxLength={16} value={password} onChangeText={setPassword} />

          {accountType === 'monitor' && (
            <>
              <Text style={styles.smallLabel}>{tt('रैंक')}</Text>
              <View style={styles.pickerWrap}>
                <SafePicker
                  selectedValue={rank}
                  onValueChange={(r) => {
                    setRank(r);
                    // 🐛 बग फ़िक्स: रैंक बदलने पर पहले से चुने हुए थाने/ज़िले साफ़ नहीं होते थे।
                    // जैसे: DSP चुनकर 5 थाने चुने, फिर रैंक ASP कर दी — वे 5 थाने चुपचाप
                    // बने रहते और ASP का दायरा अनजाने में उन्हीं तक सीमित हो जाता (जबकि
                    // ASP के लिए खाली छोड़ना = पूरा ज़िला, जो अक्सर मंशा होती है)।
                    setCircleStations([]);
                    setRangeDistricts([]);
                  }}
                  items={monitorRanks}
                />
              </View>
            </>
          )}

          {accountType === 'monitor' && ['IG', 'DIG'].includes(rank) ? null : (
            <>
              <Text style={styles.smallLabel}>{tt('ज़िला')}</Text>
              <View style={styles.pickerWrap}>
                <SafePicker
                  key={`d-${districtsVersion}`}
                  selectedValue={district}
                  onValueChange={(d) => {
                    setDistrict(d);
                    // 🐛 बग फ़िक्स: ज़िला बदलने पर पहले चुने हुए थाने साफ़ नहीं होते थे — वे
                    // थाने पुराने ज़िले के होते हैं, नए में मौजूद ही नहीं। अब backend भी
                    // इस बेमेल जोड़ी को अस्वीकार करता है (सुरक्षा-जांच), इसलिए साफ़ न करने पर
                    // उपयोगकर्ता को submit करते समय भ्रामक त्रुटि मिलती।
                    setCircleStations([]);
                  }}
                  items={DISTRICTS}
                />
              </View>
            </>
          )}

          {/* 🆕 IG/DIG — SSP से भी ऊपर, Range में कई ज़िले एक साथ। DSP के थाना-चयन जैसा
              ही चिप-आधारित बहु-चयन, बस थानों की जगह पूरे ज़िलों की सूची से। */}
          {accountType === 'monitor' && ['IG', 'DIG'].includes(rank) && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.smallLabel}>{tt('Range के ज़िले (कम से कम एक चुनें)')}</Text>
              <View style={styles.stationChipWrap}>
                {DISTRICTS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.stationChip, rangeDistricts.includes(d) && styles.stationChipActive]}
                    onPress={() => toggleRangeDistrict(d)}
                  >
                    {rangeDistricts.includes(d) && <Ionicons name="checkmark" size={13} color={colors.white} />}
                    <Text style={[styles.stationChipText, rangeDistricts.includes(d) && styles.stationChipTextActive]}>{tt(d)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {rangeDistricts.length > 0 && (
                <Text style={styles.selectedCount}>{rangeDistricts.length} {tt('ज़िले चुने गए')}</Text>
              )}
            </View>
          )}

          {rank === 'DSP' && accountType === 'monitor' && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.smallLabel}>सर्किल के थाने ({district} में से चुनें)</Text>
              <View style={styles.stationChipWrap}>
                {stationsForDistrict(district).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.stationChip, circleStations.includes(s) && styles.stationChipActive]}
                    onPress={() => toggleStation(s)}
                  >
                    {circleStations.includes(s) && <Ionicons name="checkmark" size={13} color={colors.white} />}
                    <Text style={[styles.stationChipText, circleStations.includes(s) && styles.stationChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {circleStations.length > 0 && (
                <Text style={styles.selectedCount}>{circleStations.length} थाने चुने गए</Text>
              )}
            </View>
          )}

          {/* 🆕 ASP/SSP के लिए — पहले हमेशा पूरा ज़िला ही मिलता था, कोई विकल्प नहीं था।
              अब चुन सकते हैं: कुछ भी न चुनें = पूरा ज़िला (पहले जैसा डिफ़ॉल्ट),
              या specific थाने चुनें = सिर्फ़ उन्हीं थानों तक सीमित निगरानी।
              🐛 SSP यहाँ छूट गया था — जबकि backend (middleware/auth.js) SSP के
              circleStations को पहले से ही मान्यता देता है। */}
          {['ASP', 'SSP'].includes(rank) && accountType === 'monitor' && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.smallLabel}>निगरानी का दायरा ({district})</Text>
              <Text style={styles.sspHint}>
                {tt('कुछ भी न चुनें तो पूरे ज़िले की दृश्यता मिलेगी — या नीचे से specific थाने चुनकर सिर्फ़ उन्हीं तक सीमित करें।')}
              </Text>
              <View style={styles.stationChipWrap}>
                {stationsForDistrict(district).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.stationChip, circleStations.includes(s) && styles.stationChipActive]}
                    onPress={() => toggleStation(s)}
                  >
                    {circleStations.includes(s) && <Ionicons name="checkmark" size={13} color={colors.white} />}
                    <Text style={[styles.stationChipText, circleStations.includes(s) && styles.stationChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.selectedCount}>
                {circleStations.length > 0 ? `${circleStations.length} थाने चुने गए — सिर्फ़ इन्हीं तक सीमित` : tt('कोई थाना नहीं चुना — पूरे ज़िले की दृश्यता')}
              </Text>
            </View>
          )}

          <PrimaryButton title={busy ? tt('बनाया जा रहा है…') : tt('खाता बनाएं')} onPress={addAdmin} style={{ marginTop: 14 }}  loading={busy} />
        </View>
      )}

      {admins.length === 0 && isSSP && (
        <Text style={styles.hint}>{tt('पूरी खातों की सूची सिर्फ़ Super Admin को दिखती है — पर आप ऊपर से नए खाते बना सकते हैं।')}</Text>
      )}

      {admins.map((a) => (
        <View key={a.id} style={styles.adminRow}>
          <View style={[styles.roleBadge, a.adminRole === 'super_admin' && styles.roleBadgeSuper, a.adminRole === 'monitor' && styles.roleBadgeMonitor]}>
            <Ionicons name={a.adminRole === 'super_admin' ? 'star' : a.adminRole === 'monitor' ? 'eye' : 'location'} size={14} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminName}>{a.name}</Text>
            <Text style={styles.adminMeta}>
              {a.adminRole === 'super_admin'
                ? 'Super Admin'
                : a.adminRole === 'monitor'
                ? `Monitor · ${a.rank}${
                    ['DSP', 'ASP', 'SSP'].includes(a.rank) && (a.circleStations || []).length > 0
                      ? ` · ${(a.circleStations || []).join(', ')}`
                      : ['IG', 'DIG'].includes(a.rank) && (a.rangeDistricts || []).length > 0
                      ? ` · Range: ${(a.rangeDistricts || []).join(', ')}`
                      : a.district
                      ? ` · ${a.district} (पूरा ज़िला)`
                      : ' · पूरी दृश्यता'
                  }`
                : `District Admin · ${a.district}`}{' '}
              · {a.email || (a.username ? `@${a.username}` : a.mobile || '—')}
            </Text>
          </View>
          {isSuperAdmin && a.adminRole === 'monitor' && (
            <TouchableOpacity onPress={() => openPerms(a)} style={{ marginRight: 4 }}>
              <Ionicons name="key-outline" size={19} color={permsEditingId === a.id ? colors.shaktiMaroon : colors.inkGrey} />
            </TouchableOpacity>
          )}
          {a.adminRole !== 'super_admin' && (
            <TouchableOpacity onPress={() => removeAdmin(a)}>
              <Ionicons name="trash-outline" size={18} color={colors.alert} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {permsEditingId &&
        admins
          .filter((a) => a.id === permsEditingId)
          .map((a) => (
            <View key={`perms-${a.id}`} style={styles.permsCard}>
              <Text style={styles.sectionTitle}>{tt('साइड मेनू अनुमतियां')} — {a.name}</Text>
              <Text style={styles.hint}>
                {tt('जो आइटम यहाँ ON करेंगे, वही इस खाते के साइड मेनू में दिखेगा (अगले लॉगिन पर)। डैशबोर्ड, SOS और सेटिंग्स हमेशा दिखते हैं।')}
              </Text>
              {MENU_PERMISSION_ITEMS.map((item) => (
                <View key={item.key} style={styles.permRow}>
                  <Text style={styles.permLabel}>{tt(item.label)}</Text>
                  <Switch value={!!permsDraft[item.key]} onValueChange={() => togglePerm(item.key)} trackColor={{ true: colors.shaktiMaroon }} />
                </View>
              ))}
              <PrimaryButton title={permsBusy ? tt('सुरक्षित हो रहा है…') : tt('अनुमतियां सुरक्षित करें')} onPress={() => savePerms(a)} style={{ marginTop: 12 }} loading={permsBusy} />
            </View>
          ))}
    </ScrollView>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  addBtn: { backgroundColor: colors.shaktiMaroon, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11.5, color: colors.inkLight, marginTop: 6, marginBottom: 16, lineHeight: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  typeToggle: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeChip: { flex: 1, backgroundColor: colors.sand, borderRadius: radius.sm, paddingVertical: 9, alignItems: 'center' },
  typeChipActive: { backgroundColor: colors.inkNavy },
  typeChipText: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey },
  typeChipTextActive: { color: colors.white },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  smallLabel: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginTop: 14, marginBottom: 8 },
  pickerWrap: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  sspHint: { fontSize: 11.5, color: colors.inkLight, marginTop: 14, fontStyle: 'italic' },
  stationChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stationChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  stationChipActive: { backgroundColor: colors.shaktiMaroon, borderColor: colors.shaktiMaroon },
  stationChipText: { fontSize: 11.5, color: colors.inkGrey, fontWeight: '600' },
  stationChipTextActive: { color: colors.white },
  selectedCount: { fontSize: 10.5, color: colors.sage, fontWeight: '600', marginTop: 8 },
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  roleBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.inkNavy, alignItems: 'center', justifyContent: 'center' },
  roleBadgeSuper: { backgroundColor: colors.marigold },
  roleBadgeMonitor: { backgroundColor: colors.sage },
  adminName: { fontSize: 14, fontWeight: '700', color: colors.inkNavy },
  adminMeta: { fontSize: 11, color: colors.inkGrey, marginTop: 2 },
  restrictedBox: { alignItems: 'center', paddingTop: 80 },
  restrictedText: { fontSize: 13, color: colors.inkLight, marginTop: 12 },
  permsCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginTop: 4, marginBottom: 16, borderWidth: 1.5, borderColor: colors.shaktiMaroonWash },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 6 },
  permRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.sand },
  permLabel: { fontSize: 12.5, color: colors.inkGrey, flex: 1, marginRight: 10 },
});
