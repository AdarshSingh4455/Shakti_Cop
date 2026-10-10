import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, TextInput, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert } from 'react-native';
import SafePicker from '../components/SafePicker';
import { colors, radius } from '../theme/colors';
import { DISTRICTS, stationsForDistrict } from '../data/districts';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';
import { validateName, validateMobile, validateEmail, sanitizeNameInput, sanitizeMobileInput } from '../utils/validators';

const RANKS = [
  { key: 'SI', label: 'SI (जांच अधिकारी)', desc: 'शिकायतों की जांच करता है' },
  { key: 'SHO', label: 'SHO (थाना प्रभारी)', desc: 'जांच के साथ-साथ मामले नियुक्त भी कर सकता है' },
];

export default function OfficerFormScreen({ route, navigation }) {
  const officer = route.params?.officer || null;
  const isEdit = !!officer;
  const { createOfficerAdmin, updateOfficerAdmin, updateOfficerPerms, updateOfficerRank, transferOfficerAdmin, districtsVersion, user, adminProfile } = useApp();

  const currentRole = user?.adminRole || adminProfile?.adminRole;
  const isDistrictAdmin = currentRole === 'district_admin';
  const scopedDistrict = user?.district || adminProfile?.district;
  const defaultDistrict = isDistrictAdmin && scopedDistrict ? scopedDistrict : (officer?.district || DISTRICTS[0]);

  const [name, setName] = useState(officer?.name || '');
  const [badgeId, setBadgeId] = useState(officer?.badgeId || '');
  const [mobile, setMobile] = useState(officer?.mobile || '');
  const [email, setEmail] = useState(officer?.email || '');
  const [password, setPassword] = useState('');
  const [district, setDistrictRaw] = useState(officer?.district || defaultDistrict);
  const [station, setStation] = useState(officer?.station || stationsForDistrict(officer?.district || defaultDistrict)[0]);
  const [rank, setRank] = useState(officer?.rank || 'SI');
  const [canReject, setCanReject] = useState(officer?.permissions?.canReject ?? true);
  const [canTransfer, setCanTransfer] = useState(officer?.permissions?.canTransfer ?? false);
  const [busy, setBusy] = useState(false);
  // ट्रांसफ़र मोड — edit करते समय थाना/ज़िला अलग से, साफ़ चेतावनी के साथ बदलता है
  // (पुरानी ID निष्क्रिय होकर नए थाने के लिए नई ID बनती है — साधारण edit से station/district नहीं बदलता)
  const [transferMode, setTransferMode] = useState(false);
  const [transferDistrict, setTransferDistrict] = useState(officer?.district || defaultDistrict);
  const [transferStation, setTransferStation] = useState(officer?.station || stationsForDistrict(officer?.district || defaultDistrict)[0]);

  // ज़िला बदलने पर उसी ज़िले का पहला थाना अपने-आप चुन लें (पुराने ज़िले का थाना ग़लती से न रह जाए)
  const setDistrict = (d) => {
    setDistrictRaw(d);
    setStation(stationsForDistrict(d)[0]);
  };

  const submit = async () => {
    if (!name.trim() || (!isEdit && (!badgeId.trim() || !password))) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('नाम, PNO और पासवर्ड आवश्यक हैं (नए अधिकारी के लिए)।'));
      return;
    }
    const nameErr = validateName(name);
    if (nameErr) return Alert.alert(tt('अमान्य नाम'), tt(nameErr));
    // मोबाइल हमेशा जाँचें (दिया गया हो तो सही 10 अंकों का हो)
    const mobileErr = validateMobile(mobile, { required: true });
    if (mobileErr) return Alert.alert(tt('अमान्य मोबाइल नंबर'), tt(mobileErr));
    // ⚠️ SHO लॉगिन ईमेल/मोबाइल से होता है — SHO रैंक के लिए ईमेल भी अनिवार्य
    if (rank === 'SHO') {
      const emailErr = validateEmail(email);
      if (emailErr) return Alert.alert(tt('अमान्य ईमेल'), tt(emailErr));
    } else if (email.trim()) {
      const emailErr = validateEmail(email, { required: false });
      if (emailErr) return Alert.alert(tt('अमान्य ईमेल'), tt(emailErr));
    }
    setBusy(true);
    try {
      if (isEdit) {
        // ⚠️ station/district यहां से नहीं भेजे जाते — वे सिर्फ़ ट्रांसफ़र (नीचे बटन) से बदलते हैं
        await updateOfficerAdmin(officer.id, { name: name.trim(), mobile: mobile.trim() });
        await updateOfficerPerms(officer.id, { canReject, canTransfer });
        if (rank !== officer.rank) await updateOfficerRank(officer.id, rank);
      } else {
        const finalDistrict = isDistrictAdmin && scopedDistrict ? scopedDistrict : district.trim();
        await createOfficerAdmin({
          name: name.trim(),
          badgeId: badgeId.trim(),
          mobile: mobile.trim(),
          email: email.trim(),
          password,
          station: station.trim(),
          district: finalDistrict,
          rank,
        });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const confirmTransfer = () => {
    Alert.alert(
      tt('ट्रांसफ़र की पुष्टि करें'),
      tt(`${officer.name} की मौजूदा ID निष्क्रिय हो जाएगी और "${transferStation}" (${transferDistrict}) के लिए एक नई सक्रिय ID बनेगी। यह वापस नहीं हो सकता — जारी रखें?`),
      [
        { text: tt('रद्द करें'), style: 'cancel' },
        {
          text: tt('ट्रांसफ़र करें'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await transferOfficerAdmin(officer.id, { station: transferStation.trim(), district: transferDistrict.trim() });
              Alert.alert(tt('ट्रांसफ़र हो गया'), tt('नए थाने के लिए नई ID बन गई है, पुरानी ID निष्क्रिय कर दी गई है।'));
              navigation.goBack();
            } catch (e) {
              Alert.alert(tt('त्रुटि'), e.message);
            }
            setBusy(false);
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{isEdit ? 'अधिकारी संपादित करें' : 'नया अधिकारी जोड़ें'}</Text>
      <View style={styles.card}>
        <Field label={tt('पूरा नाम')}>
          <TextInput style={styles.input} value={name} onChangeText={(t) => setName(sanitizeNameInput(t))} maxLength={80} />
        </Field>
        <Field label="PNO">
          <TextInput style={styles.input} value={badgeId} onChangeText={setBadgeId} editable={!isEdit} placeholder={tt('जैसे — 200953125')} keyboardType="number-pad" maxLength={15} />
          <Text style={styles.pnoHint}>{tt('PNO 9 अंकों का नंबर होता है (जैसे — 200953125)')}</Text>
        </Field>
        {!isEdit && (
          <Field label={tt('पासवर्ड')}>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry maxLength={16} placeholder={tt('8-16 अक्षर')} />
          </Field>
        )}
        <Field label={`${tt('मोबाइल नंबर')} *`}>
          <TextInput style={styles.input} value={mobile} onChangeText={(t) => setMobile(sanitizeMobileInput(t))} keyboardType="number-pad" maxLength={10} placeholder={tt('10 अंकों का मोबाइल नंबर')} />
        </Field>
        <Field label={rank === 'SHO' ? `${tt('ईमेल')} *` : `${tt('ईमेल')} (${tt('वैकल्पिक')})`}>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={tt('इसी से लॉगिन होगा')} maxLength={254} />
        </Field>
        <Field label={tt('ज़िला')}>
          <View style={styles.pickerWrap}>
            <SafePicker
              key={`d-${districtsVersion}`}
              selectedValue={isDistrictAdmin && scopedDistrict ? scopedDistrict : district}
              onValueChange={setDistrict}
              items={isDistrictAdmin && scopedDistrict ? [scopedDistrict] : DISTRICTS}
              enabled={!isEdit && !isDistrictAdmin}
            />
          </View>
          {isDistrictAdmin && scopedDistrict && (
            <Text style={styles.pnoHint}>{tt(`आपका अधिकार क्षेत्र: ${scopedDistrict} (निर्धारित)`)}</Text>
          )}
          {isEdit && !isDistrictAdmin && <Text style={styles.pnoHint}>{tt('ज़िला/थाना बदलने के लिए नीचे "ट्रांसफ़र करें" इस्तेमाल करें')}</Text>}
        </Field>
        <Field label={tt('थाना')}>
          <View style={styles.pickerWrap}>
            <SafePicker key={`s-${district}-${districtsVersion}`} selectedValue={station} onValueChange={setStation} items={stationsForDistrict(isDistrictAdmin && scopedDistrict ? scopedDistrict : district)} enabled={!isEdit} />
          </View>
        </Field>
      </View>

      {isEdit && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('ट्रांसफ़र (Transfer)')}</Text>
          <Text style={styles.pnoHint}>{tt('नया ज़िला/थाना चुनें — पुरानी ID निष्क्रिय होकर नई ID बनेगी।')}</Text>
          {!transferMode ? (
            <TouchableOpacity style={styles.rankRow} onPress={() => setTransferMode(true)}>
              <Text style={[styles.rankLabel, { color: colors.sage }]}>{tt('ट्रांसफ़र शुरू करें')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Field label={tt('नया ज़िला')}>
                <View style={styles.pickerWrap}>
                  <SafePicker
                    key={`td-${districtsVersion}`}
                    selectedValue={isDistrictAdmin && scopedDistrict ? scopedDistrict : transferDistrict}
                    onValueChange={(d) => { setTransferDistrict(d); setTransferStation(stationsForDistrict(d)[0]); }}
                    items={isDistrictAdmin && scopedDistrict ? [scopedDistrict] : DISTRICTS}
                    enabled={!isDistrictAdmin}
                  />
                </View>
                {isDistrictAdmin && (
                  <Text style={styles.pnoHint}>{tt('ज़िला व्यवस्थापक केवल अपने ज़िले के अंतर्गत थाना स्थानांतरण कर सकते हैं')}</Text>
                )}
              </Field>
              <Field label={tt('नया थाना')}>
                <View style={styles.pickerWrap}>
                  <SafePicker selectedValue={transferStation} onValueChange={setTransferStation} items={stationsForDistrict(isDistrictAdmin && scopedDistrict ? scopedDistrict : transferDistrict)} />
                </View>
              </Field>
              <PrimaryButton title={tt('ट्रांसफ़र की पुष्टि करें')} onPress={confirmTransfer} loading={busy} />
            </>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('रैंक (Rank)')}</Text>
        {RANKS.map((r) => (
          <TouchableOpacity key={r.key} style={styles.rankRow} onPress={() => setRank(r.key)}>
            <View style={[styles.radioOuter, rank === r.key && styles.radioOuterActive]}>
              {rank === r.key && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rankLabel}>{r.label}</Text>
              <Text style={styles.rankDesc}>{r.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {isEdit && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('अनुमतियां (Permissions)')}</Text>
          <View style={styles.permRow}>
            <Text style={styles.permLabel}>{tt('शिकायत अस्वीकृत कर सकें')}</Text>
            <Switch value={canReject} onValueChange={setCanReject} trackColor={{ true: colors.sage }} />
          </View>
          <View style={styles.permRow}>
            <Text style={styles.permLabel}>{tt('शिकायत दूसरे अधिकारी को स्थानांतरित कर सकें')}</Text>
            <Switch value={canTransfer} onValueChange={setCanTransfer} trackColor={{ true: colors.sage }} />
          </View>
        </View>
      )}

      <PrimaryButton title={busy ? tt('सुरक्षित हो रहा है…') : isEdit ? tt('बदलाव सुरक्षित करें') : tt('अधिकारी जोड़ें')} onPress={submit}  loading={busy} />
    </ScrollView>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 17, fontWeight: '700', color: colors.inkNavy, marginBottom: 14 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 14,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.inkNavy, marginBottom: 12 },
  field: { marginBottom: 14 },
  label: { fontSize: 12.5, fontWeight: '600', color: colors.inkGrey, marginBottom: 6 },
  pickerWrap: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  pnoHint: { fontSize: 10.5, color: colors.inkLight, marginTop: 4 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14.5,
    color: colors.inkNavy,
  },
  permRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  permLabel: { fontSize: 13, color: colors.inkGrey, flex: 1, marginRight: 10 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: colors.shaktiMaroon },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.shaktiMaroon },
  rankLabel: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  rankDesc: { fontSize: 11, color: colors.inkGrey, marginTop: 2 },
});
