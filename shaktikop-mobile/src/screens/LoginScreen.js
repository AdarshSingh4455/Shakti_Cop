import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import PoliceLogoIcon from '../components/PoliceLogoIcon';
import { useApp } from '../context/AppContext';
import { useLocale } from '../context/LocaleContext';
import { useResendCooldown } from '../hooks/useResendCooldown';
import { sanitizeMobileInput } from '../utils/validators';

export default function LoginScreen({ navigation, route }) {
  const mode = route?.params?.mode || 'citizen'; // 'citizen' | 'staff'
  const { loginCitizen, staffRequestOtp, loginStaff, loginCounsellor } = useApp();
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const resend = useResendCooldown();

  // नागरिक
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');

  // स्टाफ़ (एकीकृत — अधिकारी/एडमिन दोनों) — अब मोबाइल और ईमेल अलग-अलग textbox में, दोनों में से एक भरना ज़रूरी
  const [staffMobile, setStaffMobile] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [identifier, setIdentifier] = useState(''); // OTP भेजते समय जो भी भरा था, वही यहाँ याद रहता है
  const [staffOtpSent, setStaffOtpSent] = useState(false);
  const [staffOtp, setStaffOtp] = useState('');
  const [staffDevOtpHint, setStaffDevOtpHint] = useState('');
  // 🆕 "स्टाफ़ लॉगिन" पेज के अंदर ही — 'otp' (अधिकारी/एडमिन) या 'password' (काउंसलर/प्रशिक्षक)
  const [staffAuthType, setStaffAuthType] = useState('otp');

  // 🆕 काउंसलर/प्रशिक्षक — मोबाइल/ईमेल + पासवर्ड से (OTP नहीं, direct login)
  const [counsellorIdentifier, setCounsellorIdentifier] = useState('');
  const [counsellorPassword, setCounsellorPassword] = useState('');

  const counsellorSubmit = async () => {
    if (!counsellorIdentifier.trim() || !counsellorPassword) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('मोबाइल/ईमेल और पासवर्ड दर्ज करें।'));
      return;
    }
    setBusy(true);
    try {
      await loginCounsellor(counsellorIdentifier.trim(), counsellorPassword);
    } catch (e) {
      Alert.alert(tt('लॉगिन असफल'), e.message);
    }
    setBusy(false);
  };

  const citizenSubmit = async () => {
    if (!/^[0-9]{10}$/.test(mobile) || !password) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('मान्य मोबाइल नंबर और पासवर्ड दर्ज करें।'));
      return;
    }
    setBusy(true);
    try {
      await loginCitizen(mobile, password);
    } catch (e) {
      Alert.alert(tt('लॉगिन असफल'), e.message);
    }
    setBusy(false);
  };

  const sendStaffOtp = async () => {
    const mobileEntered = staffMobile.trim();
    const emailEntered = staffEmail.trim();

    if (!mobileEntered && !emailEntered) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('मोबाइल नंबर या ईमेल आईडी — दोनों में से कोई एक भरें।'));
      return;
    }
    if (mobileEntered && emailEntered) {
      Alert.alert(tt('सिर्फ़ एक भरें'), tt('मोबाइल नंबर और ईमेल — दोनों एक साथ न भरें, सिर्फ़ एक चुनें।'));
      return;
    }

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEntered);
    const isMobile = /^[0-9]{10}$/.test(mobileEntered);
    if (mobileEntered && !isMobile) {
      Alert.alert(tt('अमान्य मोबाइल नंबर'), tt('10 अंकों का सही मोबाइल नंबर दर्ज करें।'));
      return;
    }
    if (emailEntered && !isEmail) {
      Alert.alert(tt('अमान्य ईमेल'), tt('सही ईमेल आईडी दर्ज करें।'));
      return;
    }

    const chosenIdentifier = mobileEntered || emailEntered;
    setBusy(true);
    try {
      const res = await staffRequestOtp(chosenIdentifier);
      setIdentifier(chosenIdentifier);
      setStaffOtpSent(true);
      resend.startCooldown();
      if (res.devOtp) setStaffDevOtpHint(res.devOtp);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const resendStaffOtp = async () => {
    setBusy(true);
    try {
      const res = await staffRequestOtp(identifier);
      resend.startCooldown();
      if (res.devOtp) setStaffDevOtpHint(res.devOtp);
      Alert.alert(tt('OTP दोबारा भेजा गया'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const verifyStaffOtp = async () => {
    setBusy(true);
    try {
      await loginStaff(identifier, staffOtp);
    } catch (e) {
      Alert.alert(tt('लॉगिन असफल'), e.message);
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.sand }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <PoliceLogoIcon size={64} />
          <Text style={styles.h1}>ShaktiCop</Text>
          <Text style={styles.en}>{mode === 'citizen' ? 'नागरिक लॉगिन' : 'स्टाफ़ लॉगिन'}</Text>
        </View>

        {mode === 'citizen' && (
          <>
            <Field label={tt('मोबाइल नंबर')}>
              <TextInput
                style={styles.input}
                placeholder={tt('10 अंकों का मोबाइल नंबर')}
                keyboardType="number-pad"
                maxLength={10}
                value={mobile}
                onChangeText={(t) => setMobile(sanitizeMobileInput(t))}
              />
            </Field>
            <Field label={tt('पासवर्ड')}>
              <TextInput style={styles.input} placeholder={tt('पासवर्ड')} secureTextEntry maxLength={16} value={password} onChangeText={setPassword} />
            </Field>
            <PrimaryButton title={busy ? tt('लॉगिन हो रहा है…') : tt('लॉगिन करें')} onPress={citizenSubmit}  loading={busy} />

            <View style={styles.linkRow}>
              <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                <Text style={styles.link}>{t('पासवर्ड भूल गए?')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
                <Text style={styles.link}>{t('नया खाता बनाएं (साइनअप)')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {mode === 'staff' && (
          <View style={styles.authTypeRow}>
            <TouchableOpacity
              style={[styles.authTypeChip, staffAuthType === 'otp' && styles.authTypeChipActive]}
              onPress={() => setStaffAuthType('otp')}
            >
              <Text style={[styles.authTypeChipText, staffAuthType === 'otp' && styles.authTypeChipTextActive]}>
                {tt('अधिकारी/एडमिन')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.authTypeChip, staffAuthType === 'password' && styles.authTypeChipActive]}
              onPress={() => setStaffAuthType('password')}
            >
              <Text style={[styles.authTypeChipText, staffAuthType === 'password' && styles.authTypeChipTextActive]}>
                {tt('काउंसलर/प्रशिक्षक')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'staff' && staffAuthType === 'password' && (
          <>
            <Field label={tt('मोबाइल या ईमेल')}>
              <TextInput
                style={styles.input}
                placeholder={tt('मोबाइल नंबर या ईमेल आईडी')}
                autoCapitalize="none"
                value={counsellorIdentifier}
                onChangeText={setCounsellorIdentifier}
                maxLength={254}
              />
            </Field>
            <Field label={tt('पासवर्ड')}>
              <TextInput style={styles.input} placeholder={tt('पासवर्ड')} secureTextEntry maxLength={16} value={counsellorPassword} onChangeText={setCounsellorPassword} />
            </Field>
            <PrimaryButton title={busy ? tt('लॉगिन हो रहा है…') : tt('लॉगिन करें')} onPress={counsellorSubmit} loading={busy} />
          </>
        )}

        {mode === 'staff' && staffAuthType === 'otp' && !staffOtpSent && (
          <>
            <Field label={tt('मोबाइल नंबर')}>
              <TextInput
                style={styles.input}
                placeholder={tt('10 अंकों का मोबाइल नंबर')}
                keyboardType="number-pad"
                maxLength={10}
                value={staffMobile}
                onChangeText={(v) => {
                  setStaffMobile(sanitizeMobileInput(v));
                  if (v) setStaffEmail('');
                }}
              />
            </Field>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>{t('या')}</Text>
              <View style={styles.orLine} />
            </View>

            <Field label={tt('ईमेल आईडी')}>
              <TextInput
                style={styles.input}
                placeholder={tt('आपकी ईमेल आईडी')}
                autoCapitalize="none"
                keyboardType="email-address"
                maxLength={254}
                value={staffEmail}
                onChangeText={(v) => {
                  setStaffEmail(v);
                  if (v) setStaffMobile('');
                }}
              />
            </Field>

            <Text style={styles.hint}>
              {tt('दोनों में से कोई एक भरना ज़रूरी है — मोबाइल नंबर भरने पर OTP मोबाइल पर आएगा, ईमेल भरने पर OTP ईमेल पर आएगा।')}
            </Text>
            <PrimaryButton title={busy ? '…' : t('OTP भेजें')} onPress={sendStaffOtp} style={{ marginTop: 10 }}  loading={busy} />
          </>
        )}

        {mode === 'staff' && staffAuthType === 'otp' && staffOtpSent && (
          <>
            <Field label={`${t('OTP दर्ज करें')} (${identifier})`}>
              <TextInput
                style={styles.input}
                placeholder={tt('6 अंकों का OTP')}
                keyboardType="number-pad"
                maxLength={6}
                value={staffOtp}
                onChangeText={setStaffOtp}
              />
            </Field>
            {!!staffDevOtpHint && <Text style={styles.devHint}>Dev मोड — OTP है: {staffDevOtpHint}</Text>}
            <PrimaryButton title={busy ? tt('लॉगिन हो रहा है…') : tt('लॉगिन करें')} onPress={verifyStaffOtp}  loading={busy} />
            <TouchableOpacity onPress={resendStaffOtp} disabled={!resend.canResend || busy} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={[styles.link, !resend.canResend && styles.linkDisabled]}>
                {resend.canResend ? 'OTP नहीं मिला? दोबारा भेजें' : `दोबारा भेजें (${resend.secondsLeft}s)`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStaffOtpSent(false); setStaffMobile(''); setStaffEmail(''); }} style={{ marginTop: 10 }}>
              <Text style={styles.link}>{t('नंबर/ईमेल बदलें')}</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={{ marginTop: 20 }}>
          <Text style={styles.backLink}>← {t('वापस')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 26, paddingTop: 50, paddingBottom: 40 },
  hero: { alignItems: 'center', marginBottom: 26 },
  h1: { fontSize: 24, fontWeight: '800', color: colors.inkNavy, marginTop: 12 },
  en: { fontSize: 12, color: colors.shaktiMaroon, letterSpacing: 1, marginTop: 4, fontWeight: '700' },
  field: { marginBottom: 14 },
  label: { fontSize: 12.5, fontWeight: '600', color: colors.inkGrey, marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.inkNavy,
  },
  hint: { fontSize: 11.5, color: colors.inkLight, marginBottom: 4 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4, marginBottom: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 11.5, color: colors.inkLight, fontWeight: '700' },
  authTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 16, backgroundColor: colors.sand, padding: 4, borderRadius: radius.md },
  authTypeChip: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  authTypeChipActive: { backgroundColor: colors.shaktiMaroon },
  authTypeChipText: { fontSize: 12, fontWeight: '700', color: colors.inkGrey },
  authTypeChipTextActive: { color: colors.white },
  devHint: { fontSize: 12, color: colors.sage, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  link: { fontSize: 12.5, color: colors.shaktiMaroon, fontWeight: '700' },
  linkDisabled: { color: colors.inkLight },
  backLink: { fontSize: 13, color: colors.inkGrey, fontWeight: '600', textAlign: 'center' },
  note: { fontSize: 11.5, color: colors.inkLight, textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
