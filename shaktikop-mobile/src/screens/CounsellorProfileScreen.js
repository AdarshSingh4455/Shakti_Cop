import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';
import { validateName, validateMobile, validateEmail, sanitizeNameInput, sanitizeMobileInput } from '../utils/validators';

export default function CounsellorProfileScreen() {
  const { user, updateMyProviderProfile, updateMyProviderPhoto, changeCounsellorPassword } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [fatherName, setFatherName] = useState(user?.fatherName || '');
  const [designation, setDesignation] = useState(user?.designation || '');
  const [policeStation, setPoliceStation] = useState(user?.policeStation || '');
  const [mobile, setMobile] = useState(user?.mobile || '');
  const [email, setEmail] = useState(user?.email || '');
  const [venue, setVenue] = useState(user?.venue || '');
  const [otherDetails, setOtherDetails] = useState(user?.otherDetails || '');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const savePassword = async () => {
    if (!currentPassword || !newPassword) {
      return Alert.alert(tt('जानकारी अधूरी है'), tt('मौजूदा और नया — दोनों पासवर्ड भरें।'));
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert(tt('पासवर्ड मेल नहीं खाते'), tt('नया पासवर्ड दोनों जगह एक जैसा लिखें।'));
    }
    setPwdBusy(true);
    try {
      await changeCounsellorPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // सर्वर पासवर्ड बदलते ही सभी सत्र रद्द कर देता है — यह साफ़ बताना ज़रूरी है,
      // वरना अगली बार ऐप खुलने पर अचानक लॉगआउट मिलना गड़बड़ लगेगा
      Alert.alert(tt('पासवर्ड बदल गया'), tt('सुरक्षा के लिए सभी डिवाइस से लॉगआउट हो गया — कृपया नए पासवर्ड से दोबारा लॉगिन करें।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPwdBusy(false);
  };

  const initials = (user?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(tt('अनुमति चाहिए'), tt('फोटो चुनने के लिए गैलरी एक्सेस की अनुमति दें।'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, aspect: [1, 1], allowsEditing: true, base64: true });
    if (result.canceled) return;
    setPhotoBusy(true);
    try {
      const asset = result.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      const dataUri = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
      await updateMyProviderPhoto(dataUri);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPhotoBusy(false);
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await updateMyProviderPhoto(null);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPhotoBusy(false);
  };

  const save = async () => {
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
    const emailErr = validateEmail(email);
    if (emailErr) {
      Alert.alert(tt('अमान्य ईमेल'), tt(emailErr));
      return;
    }
    setBusy(true);
    try {
      await updateMyProviderProfile({
        name: name.trim(),
        fatherName: fatherName.trim() || null,
        designation: designation.trim() || null,
        policeStation: policeStation.trim() || null,
        mobile: mobile.trim(),
        email: email.trim(),
        venue: venue.trim() || null,
        otherDetails: otherDetails.trim() || null,
      });
      Alert.alert(tt('सुरक्षित हुआ'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('मेरी प्रोफ़ाइल')}</Text>

      <View style={[styles.card, { alignItems: 'center' }]}>
        <TouchableOpacity onPress={pickPhoto} disabled={photoBusy}>
          {user?.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={13} color={colors.white} />
          </View>
        </TouchableOpacity>
        <Text style={styles.photoHint}>{photoBusy ? tt('सुरक्षित हो रहा है…') : tt('फ़ोटो बदलने के लिए दबाएं')}</Text>
        {user?.photoUrl ? (
          <TouchableOpacity onPress={removePhoto} disabled={photoBusy}>
            <Text style={styles.removePhotoText}>{tt('फ़ोटो हटाएं')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.card}>
        <Field label={tt('पूरा नाम')}>
          <TextInput style={styles.input} value={name} onChangeText={(t) => setName(sanitizeNameInput(t))} maxLength={80} />
        </Field>
        <Field label={tt('पिता/पति का नाम (वैकल्पिक)')}>
          <TextInput style={styles.input} value={fatherName} onChangeText={(t) => setFatherName(sanitizeNameInput(t))} maxLength={80} />
        </Field>
        <Field label={tt('पदनाम (जैसे — काउंसलिंग साइकोलॉजिस्ट)')}>
          <TextInput style={styles.input} value={designation} onChangeText={setDesignation} maxLength={100} />
        </Field>
        <Field label={tt('थाना (वैकल्पिक)')}>
          <TextInput style={styles.input} value={policeStation} onChangeText={setPoliceStation} maxLength={100} />
        </Field>
        <Field label={`${tt('मोबाइल नंबर')} *`}>
          <TextInput style={styles.input} value={mobile} onChangeText={(t) => setMobile(sanitizeMobileInput(t))} keyboardType="phone-pad" maxLength={10} />
        </Field>
        <Field label={`${tt('ईमेल')} *`}>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" maxLength={254} />
        </Field>
        <Field label={tt('सामान्य स्थान (वैकल्पिक)')}>
          <TextInput style={styles.input} value={venue} onChangeText={setVenue} maxLength={150} />
        </Field>
        <Field label={tt('अन्य विवरण (वैकल्पिक)')}>
          <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} value={otherDetails} onChangeText={setOtherDetails} multiline maxLength={1000} />
        </Field>

        <PrimaryButton title={busy ? tt('सुरक्षित हो रहा है…') : tt('सुरक्षित करें')} onPress={save} style={{ marginTop: 14 }} loading={busy} />
      </View>

      {/* 🆕 पासवर्ड बदलने की सुविधा — backend endpoint, API और context सब पहले ही जुड़
          चुके थे, पर कोई स्क्रीन उन्हें इस्तेमाल ही नहीं कर रही थी। यानी काउंसलर के
          पास अपना पासवर्ड बदलने का कोई रास्ता नहीं था — वही शुरुआती पासवर्ड (जो
          Super Admin/SHO ने बनाकर अक्सर किसी संदेश से भेजा) हमेशा चलता रहता।
          काउंसलर पीड़िताओं के परामर्श-सत्र देखते हैं, इसलिए उनके खाते की सुरक्षा भी
          उतनी ही ज़रूरी है। */}
      <View style={styles.card}>
        <Text style={styles.pwdHeading}>{tt('पासवर्ड बदलें')}</Text>
        <Field label={tt('मौजूदा पासवर्ड')}>
          <TextInput style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" maxLength={16} />
        </Field>
        <Field label={tt('नया पासवर्ड')}>
          <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" maxLength={16} />
        </Field>
        <Field label={tt('नया पासवर्ड दोबारा')}>
          <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" maxLength={16} />
        </Field>
        <PrimaryButton
          title={pwdBusy ? tt('बदला जा रहा है…') : tt('पासवर्ड बदलें')}
          onPress={savePassword}
          style={{ marginTop: 14 }}
          loading={pwdBusy}
        />
      </View>
    </ScrollView>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginBottom: 14 },
  // 🐛 यह style पहले से इस्तेमाल हो रही थी ("मेरी प्रोफ़ाइल" शीर्षक पर) पर परिभाषित
  // कहीं नहीं थी — यानी वह शीर्षक बिना किसी style के, सादे टेक्स्ट जैसा दिख रहा था
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginBottom: 12 },
  pwdHeading: { fontSize: 15, fontWeight: '800', color: colors.inkNavy, marginBottom: 10 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  label: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey, marginBottom: 5 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, color: colors.inkNavy },
  avatarImg: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: colors.shaktiMaroonWash },
  avatarFallback: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.shaktiMaroon, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 28, fontWeight: '800' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.shaktiMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  photoHint: { fontSize: 11.5, color: colors.inkLight, marginTop: 10 },
  removePhotoText: { fontSize: 11.5, color: colors.alert, fontWeight: '700', marginTop: 6 },
});
