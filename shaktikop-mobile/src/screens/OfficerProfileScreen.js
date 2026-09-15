import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

const DUTY_OPTIONS = [
  { key: 'उपलब्ध', label: 'उपलब्ध', icon: 'checkmark-circle-outline', color: colors.sage },
  { key: 'अवकाश पर', label: 'अवकाश पर', icon: 'bed-outline', color: colors.marigold },
  { key: 'अन्य ड्यूटी पर', label: 'अन्य ड्यूटी पर', icon: 'briefcase-outline', color: colors.inkNavyLight },
  { key: 'ज़िले से बाहर', label: 'ज़िले से बाहर', icon: 'airplane-outline', color: colors.shaktiMaroon },
];

export default function OfficerProfileScreen() {
  const { user, updateDutyStatus, updateMyOfficerPhoto, changeOfficerPassword } = useApp();
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  // 🆕 पासवर्ड बदलने की सुविधा — Settings में "पासवर्ड बदलें" विकल्प अधिकारी को भी
  // दिखता था और यहीं भेजता था, पर इस स्क्रीन पर पासवर्ड का कोई फ़ील्ड ही नहीं था
  // (यानी विकल्प एक बंद रास्ते पर ले जाता)। बैकएंड endpoint अब मौजूद है, इसलिए
  // यह हिस्सा जोड़ा गया।
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
      await changeOfficerPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // सर्वर पासवर्ड बदलते ही सभी सत्र रद्द कर देता है — उपयोगकर्ता को यह साफ़ बताना
      // ज़रूरी है, वरना अगली बार ऐप खुलने पर अचानक लॉगआउट मिलना गड़बड़ लगेगा
      Alert.alert(tt('पासवर्ड बदल गया'), tt('सुरक्षा के लिए सभी डिवाइस से लॉगआउट हो गया — कृपया नए पासवर्ड से दोबारा लॉगिन करें।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPwdBusy(false);
  };

  const setDuty = async (key) => {
    setBusy(true);
    try {
      await updateDutyStatus(key);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  // 🐛 बग फ़िक्स: OfficerHomeScreen जैसा ही एहतियाती fix — login के ठीक बाद user एक
  // पल के लिए null हो सकता है, और यहाँ कई जगह user.name/photoUrl/badgeId आदि बिना
  // guard के इस्तेमाल होते — इसलिए यह भी उसी तरह सुरक्षित किया।
  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.shaktiMaroon} />
      </View>
    );
  }

  const initials = (user.name || '?')
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
      await updateMyOfficerPhoto(dataUri);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPhotoBusy(false);
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await updateMyOfficerPhoto(null);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPhotoBusy(false);
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
        <InfoRow label={tt('नाम')} value={user.name} />
        <InfoRow label="PNO" value={user.badgeId} />
        <InfoRow label={tt('मोबाइल')} value={user.mobile} />
        <InfoRow label={tt('थाना')} value={user.station || '—'} />
        <InfoRow label={tt('ज़िला')} value={user.district || '—'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('ड्यूटी स्थिति')}</Text>
        <View style={styles.dutyGrid}>
          {DUTY_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={[styles.dutyBtn, user.dutyStatus === d.key && { backgroundColor: d.color, borderColor: d.color }]}
              onPress={() => setDuty(d.key)}
              disabled={busy}
            >
              <Ionicons name={d.icon} size={18} color={user.dutyStatus === d.key ? colors.white : d.color} />
              <Text style={[styles.dutyLabel, user.dutyStatus === d.key && { color: colors.white }]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {user.permissions ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('मेरी अनुमतियां')}</Text>
          <InfoRow label={tt('शिकायत अस्वीकृत कर सकें')} value={user.permissions.canReject ? 'हाँ' : 'नहीं'} />
          <InfoRow label={tt('मामला स्थानांतरित कर सकें')} value={user.permissions.canTransfer ? 'हाँ' : 'नहीं'} />
          <Text style={styles.hint}>{tt('अनुमतियां बदलवाने के लिए एडमिन से संपर्क करें।')}</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('पासवर्ड बदलें')}</Text>
        <Text style={styles.pwdLabel}>{tt('मौजूदा पासवर्ड')}</Text>
        <TextInput style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry maxLength={16} />
        <Text style={styles.pwdLabel}>{tt('नया पासवर्ड')}</Text>
        <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry maxLength={16} />
        <Text style={styles.pwdLabel}>{tt('नया पासवर्ड दोबारा')}</Text>
        <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry maxLength={16} />
        <TouchableOpacity style={[styles.pwdBtn, pwdBusy && { opacity: 0.6 }]} onPress={savePassword} disabled={pwdBusy}>
          <Text style={styles.pwdBtnText}>{pwdBusy ? tt('सुरक्षित हो रहा है…') : tt('पासवर्ड बदलें')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pwdLabel: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: colors.sand, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5 },
  pwdBtn: { backgroundColor: colors.shaktiMaroon, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  pwdBtnText: { color: colors.white, fontWeight: '700', fontSize: 13.5 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
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
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.inkNavy, marginBottom: 12 },
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
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { fontSize: 13, color: colors.inkGrey },
  infoValue: { fontSize: 13, fontWeight: '700', color: colors.inkNavy },
  dutyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dutyBtn: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
  },
  dutyLabel: { fontSize: 12, fontWeight: '700', color: colors.inkNavy, flexShrink: 1 },
  hint: { fontSize: 11, color: colors.inkLight, marginTop: 8 },
});
