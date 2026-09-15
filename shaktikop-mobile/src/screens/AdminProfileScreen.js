import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

export default function AdminProfileScreen() {
  const { adminProfile, updateAdminName, changeAdminPassword, updateMyAdminPhoto } = useApp();
  const [name, setName] = useState(adminProfile?.name || '');
  const [busyName, setBusyName] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busyPwd, setBusyPwd] = useState(false);

  const initials = (adminProfile?.name || '?')
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
      await updateMyAdminPhoto(dataUri);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPhotoBusy(false);
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await updateMyAdminPhoto(null);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPhotoBusy(false);
  };

  const saveName = async () => {
    if (!name.trim()) {
      Alert.alert(tt('नाम खाली नहीं हो सकता'));
      return;
    }
    setBusyName(true);
    try {
      await updateAdminName(name.trim());
      Alert.alert(tt('सुरक्षित हुआ'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusyName(false);
  };

  const savePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert(tt('पासवर्ड छोटा है'), tt('कम से कम 6 अक्षर का पासवर्ड दें।'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(tt('पासवर्ड मेल नहीं खाता'));
      return;
    }
    setBusyPwd(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert(tt('सफल'), tt('पासवर्ड बदल दिया गया है।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusyPwd(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('एडमिन प्रोफ़ाइल')}</Text>

      <View style={[styles.card, { alignItems: 'center' }]}>
        <TouchableOpacity onPress={pickPhoto} disabled={photoBusy}>
          {adminProfile?.photoUrl ? (
            <Image source={{ uri: adminProfile.photoUrl }} style={styles.avatarImg} />
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
        {adminProfile?.photoUrl ? (
          <TouchableOpacity onPress={removePhoto} disabled={photoBusy}>
            <Text style={styles.removePhotoText}>{tt('फ़ोटो हटाएं')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('नाम')}</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={80} />
        <Text style={styles.hint}>यूज़रनेम: {adminProfile?.username}</Text>
        <PrimaryButton title={busyName ? tt('सुरक्षित हो रहा है…') : tt('नाम सुरक्षित करें')} onPress={saveName} style={{ marginTop: 12 }}  loading={busyName} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('पासवर्ड बदलें')}</Text>
        <Field label={tt('मौजूदा पासवर्ड')}>
          <TextInput style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry maxLength={16} />
        </Field>
        <Field label={tt('नया पासवर्ड')}>
          <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry maxLength={16} />
        </Field>
        <Field label={tt('नया पासवर्ड दोबारा')}>
          <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry maxLength={16} />
        </Field>
        <PrimaryButton title={busyPwd ? tt('सुरक्षित हो रहा है…') : tt('पासवर्ड बदलें')} onPress={savePassword}  loading={busyPwd} />
      </View>
    </ScrollView>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginBottom: 14 },
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
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.inkNavy, marginBottom: 10 },
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
  hint: { fontSize: 11, color: colors.inkLight, marginTop: 8 },
});
