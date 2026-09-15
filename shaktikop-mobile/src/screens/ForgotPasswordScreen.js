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
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';
import { useResendCooldown } from '../hooks/useResendCooldown';
import PoliceLogoIcon from '../components/PoliceLogoIcon';
import { sanitizeMobileInput } from '../utils/validators';

export default function ForgotPasswordScreen({ navigation }) {
  const { forgotPasswordRequestOtp, forgotPasswordReset } = useApp();
  const [step, setStep] = useState('mobile'); // 'mobile' | 'reset'
  const [busy, setBusy] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState('');
  const resend = useResendCooldown();

  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const sendOtp = async () => {
    if (!/^[0-9]{10}$/.test(mobile)) {
      Alert.alert(tt('मान्य मोबाइल नंबर दें'), tt('10 अंकों का मोबाइल नंबर दर्ज करें।'));
      return;
    }
    setBusy(true);
    try {
      const res = await forgotPasswordRequestOtp(mobile);
      setStep('reset');
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
      const res = await forgotPasswordRequestOtp(mobile);
      resend.startCooldown();
      if (res.devOtp) setDevOtpHint(res.devOtp);
      Alert.alert(tt('OTP दोबारा भेजा गया'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const resetPassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert(tt('पासवर्ड छोटा है'), tt('कम से कम 6 अक्षर का पासवर्ड दें।'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(tt('पासवर्ड मेल नहीं खाता'), tt('दोनों पासवर्ड एक जैसे होने चाहिए।'));
      return;
    }
    setBusy(true);
    try {
      await forgotPasswordReset(mobile, otp, newPassword);
      Alert.alert(tt('सफल'), tt('पासवर्ड बदल दिया गया है, अब लॉगिन करें।'), [
        { text: tt('ठीक है'), onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.sand }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <PoliceLogoIcon size={54} />
        </View>
        <Text style={styles.h1}>{tt('पासवर्ड भूल गए?')}</Text>
        <Text style={styles.sub}>{tt('अपना रजिस्टर्ड मोबाइल नंबर दें, हम OTP भेजेंगे।')}</Text>

        {step === 'mobile' && (
          <View style={styles.card}>
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
            <PrimaryButton title={busy ? tt('भेजा जा रहा है…') : 'OTP भेजें'} onPress={sendOtp}  loading={busy} />
          </View>
        )}

        {step === 'reset' && (
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
            <TouchableOpacity onPress={resendOtp} disabled={!resend.canResend || busy} style={{ marginBottom: 14, alignItems: 'center' }}>
              <Text style={[styles.resendText, !resend.canResend && styles.resendTextDisabled]}>
                {resend.canResend ? 'OTP नहीं मिला? दोबारा भेजें' : `दोबारा भेजें (${resend.secondsLeft}s)`}
              </Text>
            </TouchableOpacity>
            <Field label={tt('नया पासवर्ड')}>
              <TextInput style={styles.input} placeholder={tt('8-16 अक्षर')} secureTextEntry maxLength={16} value={newPassword} onChangeText={setNewPassword} />
            </Field>
            <Field label={tt('नया पासवर्ड दोबारा')}>
              <TextInput style={styles.input} placeholder={tt('पासवर्ड दोबारा')} secureTextEntry maxLength={16} value={confirmPassword} onChangeText={setConfirmPassword} />
            </Field>
            <PrimaryButton title={busy ? tt('सुरक्षित हो रहा है…') : tt('पासवर्ड बदलें')} onPress={resetPassword}  loading={busy} />
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
  wrap: { flexGrow: 1, padding: 20, paddingTop: 60, paddingBottom: 50 },
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
  resendText: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
  resendTextDisabled: { color: colors.inkLight },
});
