import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { colors, radius } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';
import { useResendCooldown } from '../hooks/useResendCooldown';
import PoliceLogoIcon from '../components/PoliceLogoIcon';
import { validateName, validateMobile, sanitizeNameInput, sanitizeMobileInput } from '../utils/validators';

export default function SignupScreen({ navigation }) {
  const { signupRequestOtp, signupVerify } = useApp();
  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [busy, setBusy] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState('');
  const resend = useResendCooldown();

  const [name, setName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [address, setAddress] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [agreed, setAgreed] = useState(false);

  const sendOtp = async () => {
    const nameErr = validateName(name);
    if (nameErr) {
      Alert.alert(tt('अमान्य नाम'), tt(nameErr));
      return;
    }
    const mobileErr = validateMobile(mobile);
    if (mobileErr) {
      Alert.alert(tt('अमान्य मोबाइल नंबर'), tt(mobileErr));
      return;
    }
    if (password.length < 6) {
      Alert.alert(tt('पासवर्ड छोटा है'), tt('पासवर्ड कम से कम 6 अक्षर का होना चाहिए।'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(tt('पासवर्ड मेल नहीं खाता'), tt('दोनों पासवर्ड एक जैसे होने चाहिए।'));
      return;
    }
    if (!agreed) {
      Alert.alert(tt('सहमति आवश्यक है'), tt('कृपया आगे बढ़ने के लिए गोपनीयता नीति स्वीकार करें।'));
      return;
    }
    setBusy(true);
    try {
      const res = await signupRequestOtp(mobile, email.trim() || undefined);
      setStep('otp');
      resend.startCooldown();
      if (res.devOtp) setDevOtpHint(res.devOtp);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const resendOtp = async () => {
    setBusy(true);
    try {
      const res = await signupRequestOtp(mobile, email.trim() || undefined);
      resend.startCooldown();
      if (res.devOtp) setDevOtpHint(res.devOtp);
      Alert.alert(tt('OTP दोबारा भेजा गया'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const verifyAndCreate = async () => {
    setBusy(true);
    try {
      await signupVerify({
        mobile,
        otp,
        name: name.trim(),
        fatherName: fatherName.trim(),
        address: address.trim(),
        password,
        email: email.trim() || undefined,
      });
      // सफल होने पर AppContext अपने आप लॉगिन कर देगा, RootNavigator डैशबोर्ड दिखा देगा
    } catch (e) {
      Alert.alert(tt('साइनअप असफल'), e.message);
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.sand }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <PoliceLogoIcon size={54} />
        </View>
        <Text style={styles.h1}>{tt('नागरिक खाता बनाएं')}</Text>
        <Text style={styles.sub}>{tt('आपकी शिकायत दर्ज करने और ट्रैक करने के लिए एक खाता चाहिए।')}</Text>

        {step === 'form' && (
          <View style={styles.card}>
            <Field label={tt('पूरा नाम *')}>
              <TextInput style={styles.input} placeholder={tt('जैसे — सुनीता वर्मा')} value={name} onChangeText={(t) => setName(sanitizeNameInput(t))} maxLength={80} />
            </Field>
            <Field label={tt('पिता/पति का नाम')}>
              <TextInput style={styles.input} placeholder={tt('वैकल्पिक')} value={fatherName} onChangeText={(t) => setFatherName(sanitizeNameInput(t))} maxLength={80} />
            </Field>
            <Field label={tt('पता')}>
              <TextInput style={styles.input} placeholder={tt('वैकल्पिक')} value={address} onChangeText={setAddress} maxLength={300} />
            </Field>
            <Field label={tt('मोबाइल नंबर *')}>
              <TextInput
                style={styles.input}
                placeholder={tt('10 अंकों का मोबाइल नंबर')}
                keyboardType="number-pad"
                maxLength={10}
                value={mobile}
                onChangeText={(t) => setMobile(sanitizeMobileInput(t))}
              />
            </Field>
            {/* 🆕 वैकल्पिक ईमेल — भरने पर OTP मोबाइल के साथ-साथ यहाँ भी आता है।
                यह उन स्थितियों के लिए है जहाँ SMS नहीं पहुँचता: नेटवर्क, DLT-रुकावट,
                या नंबर किसी और के कब्ज़े में होना (घरेलू-हिंसा में यह आम बात है)। */}
            <Field label={tt('ईमेल आईडी (वैकल्पिक)')}>
              <TextInput
                style={styles.input}
                placeholder={tt('OTP यहाँ भी आएगा — SMS न मिले तो काम आएगा')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={254}
                value={email}
                onChangeText={setEmail}
              />
            </Field>
            <Field label={tt('पासवर्ड *')}>
              <TextInput style={styles.input} placeholder={tt('8-16 अक्षर')} secureTextEntry maxLength={16} value={password} onChangeText={setPassword} />
            </Field>
            <Field label={tt('पासवर्ड दोबारा डालें *')}>
              <TextInput style={styles.input} placeholder={tt('पासवर्ड दोबारा')} secureTextEntry maxLength={16} value={confirmPassword} onChangeText={setConfirmPassword} />
            </Field>

            <TouchableOpacity style={styles.consentRow} onPress={() => setAgreed((a) => !a)} activeOpacity={0.8}>
              <Ionicons
                name={agreed ? 'checkbox' : 'square-outline'}
                size={20}
                color={agreed ? colors.sage : colors.inkLight}
              />
              <Text style={styles.consentText}>
                {tt('मैंने')}{' '}
                <Text style={styles.consentLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
                  {tt('गोपनीयता नीति')}
                </Text>{' '}
                {tt('पढ़ ली है और उससे सहमत हूं')}
              </Text>
            </TouchableOpacity>

            <PrimaryButton title={busy ? tt('भेजा जा रहा है…') : 'OTP भेजें'} onPress={sendOtp} style={{ marginTop: 6 }}  loading={busy} />
          </View>
        )}

        {step === 'otp' && (
          <View style={styles.card}>
            <Field label={`OTP दर्ज करें (${mobile} पर भेजा गया)`}>
              <TextInput
                style={styles.input}
                placeholder={tt('6 अंकों का OTP')}
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
              />
            </Field>
            {!!devOtpHint && <Text style={styles.devHint}>Dev मोड — OTP है: {devOtpHint}</Text>}
            <PrimaryButton title={busy ? tt('खाता बन रहा है…') : tt('खाता बनाएं')} onPress={verifyAndCreate}  loading={busy} />
            <TouchableOpacity onPress={resendOtp} disabled={!resend.canResend || busy} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={[styles.resendText, !resend.canResend && styles.resendTextDisabled]}>
                {resend.canResend ? 'OTP नहीं मिला? दोबारा भेजें' : `दोबारा भेजें (${resend.secondsLeft}s)`}
              </Text>
            </TouchableOpacity>
            <SecondaryButton title={tt('जानकारी बदलें')} onPress={() => setStep('form')} style={{ marginTop: 10 }} />
          </View>
        )}

        <SecondaryButton title={tt('वापस लॉगिन पर जाएं')} onPress={() => navigation.goBack()} style={{ marginTop: 16 }} />
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
  wrap: { flexGrow: 1, padding: 20, paddingTop: 50, paddingBottom: 50 },
  h1: { fontSize: 22, fontWeight: '800', color: colors.inkNavy },
  sub: { fontSize: 13, color: colors.inkGrey, marginTop: 6, marginBottom: 20, lineHeight: 19 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18 },
  field: { marginBottom: 14 },
  label: { fontSize: 12.5, fontWeight: '600', color: colors.inkGrey, marginBottom: 6 },
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
  devHint: { fontSize: 12, color: colors.sage, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 4, marginBottom: 14 },
  consentText: { flex: 1, fontSize: 12, color: colors.inkGrey, lineHeight: 18 },
  consentLink: { color: colors.shaktiMaroon, fontWeight: '700', textDecorationLine: 'underline' },
  resendText: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
  resendTextDisabled: { color: colors.inkLight },
});
