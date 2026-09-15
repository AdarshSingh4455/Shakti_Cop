import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { OFFICER_DESIGNATIONS } from '../data/constants';
import { useApp } from '../context/AppContext';
import { validateName, validateMobile, validateEmail, sanitizeNameInput, sanitizeMobileInput } from '../utils/validators';

export default function CreateOfficerScreen({ navigation }) {
  const { createSubordinateOfficer } = useApp();
  const [name, setName] = useState('');
  const [pno, setPno] = useState('');
  const [designation, setDesignation] = useState('उप निरीक्षक');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !pno.trim() || !password.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('नाम, PNO और पासवर्ड आवश्यक हैं।'));
      return;
    }
    const nameErr = validateName(name);
    if (nameErr) return Alert.alert(tt('अमान्य नाम'), tt(nameErr));
    if (mobile.trim()) {
      const mobileErr = validateMobile(mobile, { required: false });
      if (mobileErr) return Alert.alert(tt('अमान्य मोबाइल नंबर'), tt(mobileErr));
    }
    if (email.trim()) {
      const emailErr = validateEmail(email, { required: false });
      if (emailErr) return Alert.alert(tt('अमान्य ईमेल'), tt(emailErr));
    }
    setBusy(true);
    try {
      await createSubordinateOfficer({
        name: name.trim(),
        pno: pno.trim(),
        designation: designation.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        password,
      });
      Alert.alert(tt('जांचकर्ता जुड़ गया'), `${name} को नया SI बनाया गया — अब वो login कर सकते हैं।`);
      navigation.goBack();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('नया जांचकर्ता (SI) जोड़ें')}</Text>
      <Text style={styles.hint}>{tt('यह अपने आप आपके थाने में बनेगा — अलग से थाना/ज़िला चुनने की ज़रूरत नहीं।')}</Text>

      <View style={styles.card}>
        <Field label={tt('पूरा नाम')}>
          <TextInput style={styles.input} value={name} onChangeText={(t) => setName(sanitizeNameInput(t))} maxLength={80} />
        </Field>
        <Field label={tt('PNO (पुलिस नंबर)')}>
          <TextInput style={styles.input} value={pno} onChangeText={setPno} placeholder={tt('जैसे — UP-9101')} maxLength={20} />
        </Field>
        <Field label={tt('पदनाम (Designation)')}>
          <TextInput style={styles.input} value={designation} onChangeText={setDesignation} placeholder={tt('जैसे — उप निरीक्षक')} maxLength={100} />
          <View style={styles.chipRow}>
            {OFFICER_DESIGNATIONS.map((d) => (
              <TouchableOpacity key={d} style={[styles.chip, designation === d && styles.chipActive]} onPress={() => setDesignation(d)}>
                <Text style={[styles.chipText, designation === d && styles.chipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>
        <Field label={tt('मोबाइल नंबर')}>
          <TextInput style={styles.input} value={mobile} onChangeText={(t) => setMobile(sanitizeMobileInput(t))} keyboardType="number-pad" maxLength={10} />
        </Field>
        <Field label={tt('ईमेल (वैकल्पिक)')}>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" maxLength={254} />
        </Field>
        <Field label={tt('पासवर्ड')}>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry maxLength={16} placeholder={tt('8-16 अक्षर')} />
        </Field>
      </View>

      <PrimaryButton title={busy ? tt('जोड़ा जा रहा है…') : tt('जांचकर्ता जोड़ें')} onPress={submit}  loading={busy} />
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { backgroundColor: colors.sand, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  chipActive: { backgroundColor: colors.shaktiMaroon },
  chipText: { fontSize: 10.5, color: colors.inkGrey, fontWeight: '600' },
  chipTextActive: { color: colors.white },
});
