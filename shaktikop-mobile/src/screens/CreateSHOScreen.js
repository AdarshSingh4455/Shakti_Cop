import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';
import { validateName, validateMobile, validateEmail, sanitizeNameInput, sanitizeMobileInput } from '../utils/validators';

export default function CreateSHOScreen({ navigation }) {
  const { user, createSHOByDSP } = useApp();
  const canCreate = user?.adminRole === 'super_admin' || (user?.adminRole === 'monitor' && user?.rank === 'DSP');
  const circleStations = user?.circleStations || [];
  const [name, setName] = useState('');
  const [pno, setPno] = useState('');
  const [station, setStation] = useState(circleStations[0] || '');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!canCreate) {
    return (
      <View style={styles.container}>
        <View style={styles.restrictedBox}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.inkLight} />
          <Text style={styles.restrictedText}>{tt('यह सेक्शन सिर्फ़ DSP और Super Admin के लिए है।')}</Text>
        </View>
      </View>
    );
  }

  const submit = async () => {
    if (!name.trim() || !pno.trim() || !password.trim() || !station) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('नाम, PNO, थाना और पासवर्ड आवश्यक हैं।'));
      return;
    }
    // ⚠️ SHO का लॉगिन ईमेल/मोबाइल से होता है — इसलिए अब दोनों अनिवार्य हैं
    const nameErr = validateName(name);
    if (nameErr) return Alert.alert(tt('अमान्य नाम'), tt(nameErr));
    const mobileErr = validateMobile(mobile);
    if (mobileErr) return Alert.alert(tt('अमान्य मोबाइल नंबर'), tt(mobileErr));
    const emailErr = validateEmail(email);
    if (emailErr) return Alert.alert(tt('अमान्य ईमेल'), tt(emailErr));
    setBusy(true);
    try {
      await createSHOByDSP({
        name: name.trim(),
        pno: pno.trim(),
        station,
        mobile: mobile.trim(),
        email: email.trim(),
        password,
        designation: 'थाना प्रभारी',
      });
      Alert.alert(tt('SHO जुड़ गया'), `${name} को ${station} थाने का SHO बनाया गया।`);
      navigation.goBack();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('नया SHO (थाना प्रभारी) जोड़ें')}</Text>
      <Text style={styles.hint}>{tt('सिर्फ़ आपके सर्किल के थानों में से चुन सकते हैं।')}</Text>

      <View style={styles.card}>
        <Field label={tt('पूरा नाम')}>
          <TextInput style={styles.input} value={name} onChangeText={(t) => setName(sanitizeNameInput(t))} maxLength={80} />
        </Field>
        <Field label={tt('PNO (पुलिस नंबर)')}>
          <TextInput style={styles.input} value={pno} onChangeText={setPno} placeholder={tt('जैसे — UP-9201')} maxLength={20} />
        </Field>

        <Text style={styles.label}>{tt('थाना (अपने सर्किल में से चुनें)')}</Text>
        <View style={styles.stationRow}>
          {circleStations.length === 0 ? (
            <Text style={styles.noStations}>{tt('आपके सर्किल में कोई थाना नहीं जोड़ा गया — Super Admin से संपर्क करें।')}</Text>
          ) : (
            circleStations.map((s) => (
              <TouchableOpacity key={s} style={[styles.stationChip, station === s && styles.stationChipActive]} onPress={() => setStation(s)}>
                <Text style={[styles.stationChipText, station === s && styles.stationChipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <Field label={`${tt('मोबाइल नंबर')} *`}>
          <TextInput style={styles.input} value={mobile} onChangeText={(t) => setMobile(sanitizeMobileInput(t))} keyboardType="number-pad" maxLength={10} placeholder={tt('10 अंकों का मोबाइल नंबर')} />
        </Field>
        <Field label={`${tt('ईमेल')} *`}>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={tt('इसी से लॉगिन होगा')} maxLength={254} />
        </Field>
        <Field label={tt('पासवर्ड')}>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry maxLength={16} placeholder={tt('8-16 अक्षर')} />
        </Field>
      </View>

      <PrimaryButton title={busy ? tt('जोड़ा जा रहा है…') : 'SHO जोड़ें'} onPress={submit}  loading={busy} />
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
  h2: { fontSize: 17, fontWeight: '700', color: colors.inkNavy, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.inkGrey, marginBottom: 16, lineHeight: 17 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { fontSize: 12.5, fontWeight: '600', color: colors.inkGrey, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14.5, color: colors.inkNavy },
  stationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  stationChip: { backgroundColor: colors.sand, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  stationChipActive: { backgroundColor: colors.shaktiMaroon },
  stationChipText: { fontSize: 12, fontWeight: '600', color: colors.inkGrey },
  stationChipTextActive: { color: colors.white },
  noStations: { fontSize: 12, color: colors.alert, lineHeight: 17 },
  restrictedBox: { alignItems: 'center', paddingTop: 80 },
  restrictedText: { fontSize: 13, color: colors.inkLight, marginTop: 12, textAlign: 'center', paddingHorizontal: 30 },
});
