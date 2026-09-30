import React, { useState, useEffect } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, TouchableOpacity, Image, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors, radius } from '../theme/colors';
import { DISTRICTS, stationsForDistrict } from '../data/districts';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';
import { validateName, sanitizeNameInput, sanitizeMobileInput } from '../utils/validators';
import { isBiometricLockEnabled, setBiometricLockEnabled, isBiometricAvailable } from '../hooks/useBiometricLock';

export default function ProfileScreen({ navigation }) {
  const { user, updateProfile, updateEmergencyContacts, updateMyPhoto, exportMyData, requestAccountDeletion, fetchMyDeletionRequest, logoutAllDevices, setBiometricLockEnabledLive, districtsVersion } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [fatherName, setFatherName] = useState(user?.fatherName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState(user?.address || '');
  const [district, setDistrict] = useState(user?.district || DISTRICTS[0]);
  const [policeStation, setPoliceStation] = useState(user?.policeStation || stationsForDistrict(user?.district || DISTRICTS[0])[0]);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  // 🆕 Biometric App-Lock — device-only प्राथमिकता, सर्वर पर सेव नहीं होती
  const [bioLockOn, setBioLockOn] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(true);

  useEffect(() => {
    isBiometricLockEnabled().then(setBioLockOn);
    isBiometricAvailable().then(setBioAvailable);
  }, []);

  const toggleBioLock = async (value) => {
    if (value && !bioAvailable) {
      Alert.alert(
        tt('उपलब्ध नहीं'),
        tt('इस डिवाइस पर फ़िंगरप्रिंट/फ़ेस-अनलॉक सेट नहीं है — पहले फ़ोन की Settings में इसे चालू करें, फिर यहां वापस आएं।')
      );
      return;
    }
    setBioLockOn(value);
    await setBiometricLockEnabled(value);
    // 🐛 बग फ़िक्स: पहले सिर्फ़ AsyncStorage में लिखा जाता था — AppGate का अलग
    // hook-instance इसे कभी नहीं जानता था, इसलिए असर सिर्फ़ अगली बार ऐप खोलने पर
    // होता। अब साझा state (AppContext) को भी तुरंत अपडेट करते हैं।
    setBiometricLockEnabledLive(value);
  };

  // 🆕 DPDP Act — पहले से कोई pending अनुरोध हो तो दिखाएं
  useEffect(() => {
    fetchMyDeletionRequest().then(setDeletionRequest).catch(() => {});
  }, []);

  const doExportData = async () => {
    setExportBusy(true);
    try {
      const data = await exportMyData();
      const fileUri = FileSystem.documentDirectory + `shaktikop-mera-data-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: tt('मेरा डेटा') });
      } else {
        Alert.alert(tt('डेटा तैयार है'), fileUri);
      }
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message || tt('डेटा export नहीं हो सका।'));
    }
    setExportBusy(false);
  };

  const doRequestDeletion = () => {
    Alert.alert(
      tt('खाता हटाने का अनुरोध भेजें?'),
      tt('आपकी शिकायतें कानूनी दस्तावेज़ होने के कारण तुरंत नहीं हटतीं — Super Admin समीक्षा के बाद आपकी व्यक्तिगत जानकारी हमेशा के लिए हटा दी जाएगी और खाता निष्क्रिय हो जाएगा।'),
      [
        { text: tt('रद्द करें'), style: 'cancel' },
        {
          text: tt('हां, अनुरोध भेजें'),
          style: 'destructive',
          onPress: async () => {
            setDeletionBusy(true);
            try {
              await requestAccountDeletion('');
              const status = await fetchMyDeletionRequest();
              setDeletionRequest(status);
              Alert.alert(tt('अनुरोध भेज दिया गया'));
            } catch (e) {
              Alert.alert(tt('त्रुटि'), e.message || tt('अनुरोध नहीं भेजा जा सका।'));
            }
            setDeletionBusy(false);
          },
        },
      ]
    );
  };

  const onDistrictChange = (d) => {
    setDistrict(d);
    setPoliceStation(stationsForDistrict(d)[0]);
  };

  const [contacts, setContacts] = useState(
    user?.emergencyContacts?.length ? user.emergencyContacts : [{ name: '', phone: '' }]
  );
  const [contactsBusy, setContactsBusy] = useState(false);

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
      // ⚠️ बग फ़िक्स: पहले डिवाइस की लोकल file:// path सीधे भेजी जाती थी — यह सिर्फ़
      // उसी डिवाइस/सेशन पर काम करती थी, इसलिए दोबारा लॉगिन करने पर या OS द्वारा
      // temp फ़ाइल हटाए जाने पर फ़ोटो ग़ायब हो जाती थी। अब base64 data URI भेजते हैं
      // जो हमेशा, हर डिवाइस पर, हर लॉगिन पर सही दिखेगी।
      const asset = result.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      const dataUri = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
      await updateMyPhoto(dataUri);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPhotoBusy(false);
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await updateMyPhoto(null);
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
    setBusy(true);
    try {
      await updateProfile({ name: name.trim(), fatherName: fatherName.trim(), email: email.trim(), address: address.trim(), district, policeStation });
      Alert.alert(tt('सुरक्षित हुआ'), tt('आपकी प्रोफ़ाइल अपडेट हो गई है।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const updateContact = (idx, field, value) => {
    setContacts((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const addContactRow = () => {
    if (contacts.length >= 3) {
      Alert.alert(tt('अधिकतम 3 संपर्क जोड़े जा सकते हैं'));
      return;
    }
    setContacts((prev) => [...prev, { name: '', phone: '' }]);
  };

  const removeContactRow = (idx) => {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveContacts = async () => {
    const valid = contacts.filter((c) => c.name.trim() && c.phone.trim());
    for (const c of valid) {
      const nameErr = validateName(c.name);
      if (nameErr) {
        Alert.alert(tt('अमान्य नाम'), `${c.name}: ${tt(nameErr)}`);
        return;
      }
      if (!/^[0-9]{10}$/.test(c.phone.trim())) {
        Alert.alert(tt('जानकारी अधूरी है'), `${c.name} के लिए मान्य 10-अंकों का मोबाइल नंबर दें।`);
        return;
      }
    }
    setContactsBusy(true);
    try {
      await updateEmergencyContacts(valid.map((c) => ({ name: c.name.trim(), phone: c.phone.trim() })));
      Alert.alert(tt('सुरक्षित हुआ'), tt('इमरजेंसी संपर्क अपडेट हो गए। SOS दबाने पर इन्हें भी SMS जाएगा।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setContactsBusy(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('मेरी प्रोफ़ाइल')}</Text>

      <View style={[styles.card, { alignItems: 'center' }]}>
        <TouchableOpacity onPress={pickPhoto} disabled={photoBusy}>
          {user?.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={36} color={colors.inkLight} />
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={13} color={colors.white} />
          </View>
        </TouchableOpacity>
        <Text style={styles.hint}>{tt('प्रोफ़ाइल फ़ोटो (वैकल्पिक) — टैप करके बदलें')}</Text>
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
        <Field label={tt('पिता/पति का नाम')}>
          <TextInput style={styles.input} value={fatherName} onChangeText={(t) => setFatherName(sanitizeNameInput(t))} placeholder={tt('वैकल्पिक')} maxLength={80} />
        </Field>
        {/* 🆕 ईमेल यहाँ भी बदला जा सके — साइनअप पर यह वैकल्पिक है, इसलिए जिसने तब
            नहीं दिया वह बाद में जोड़ सके, और जिसका बदल जाए वह सुधार सके। OTP इसी पर
            (मोबाइल के साथ-साथ) आता है, इसलिए इसका सही रहना ज़रूरी है। */}
        <Field label={tt('ईमेल आईडी')}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={tt('वैकल्पिक — OTP यहाँ भी आएगा')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
          />
        </Field>
        <Field label={tt('पता')}>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder={tt('वैकल्पिक')} maxLength={300} />
        </Field>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label={tt('ज़िला')}>
              <View style={styles.pickerWrap}>
                <Picker key={`d-${districtsVersion}`} selectedValue={district} onValueChange={onDistrictChange}>
                  {DISTRICTS.map((d) => (
                    <Picker.Item key={d} label={tt(d)} value={d} />
                  ))}
                </Picker>
              </View>
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={tt('थाना')}>
              <View style={styles.pickerWrap}>
                <Picker key={`s-${district}-${districtsVersion}`} selectedValue={policeStation} onValueChange={setPoliceStation}>
                  {stationsForDistrict(district).map((s) => (
                    <Picker.Item key={s} label={tt(s)} value={s} />
                  ))}
                </Picker>
              </View>
            </Field>
          </View>
        </View>
        <Field label={tt('मोबाइल नंबर')}>
          <View style={[styles.input, styles.readOnly]}>
            <Text style={styles.readOnlyText}>{user?.mobile}</Text>
          </View>
          <Text style={styles.hint}>{tt('मोबाइल नंबर आपकी लॉगिन पहचान है, इसे यहाँ से नहीं बदला जा सकता।')}</Text>
        </Field>
        <PrimaryButton title={busy ? tt('सुरक्षित हो रहा है…') : tt('बदलाव सुरक्षित करें')} onPress={save} style={{ marginTop: 6 }}  loading={busy} />
      </View>

      <View style={styles.card}>
        <View style={styles.emergHeader}>
          <Ionicons name="call" size={16} color={colors.alert} />
          <Text style={styles.sectionTitle}>{tt('इमरजेंसी संपर्क')}</Text>
        </View>
        <Text style={styles.hint}>
          {tt('SOS बटन दबाने पर इन संपर्कों को भी आपकी लाइव लोकेशन के साथ SMS जाएगा (अधिकतम 3)।')}
        </Text>

        {contacts.map((c, idx) => (
          <View key={idx} style={styles.contactRow}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                placeholder={tt('नाम (जैसे — पति, भाई)')}
                value={c.name}
                onChangeText={(v) => updateContact(idx, 'name', sanitizeNameInput(v))}
                maxLength={80}
              />
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder={tt('10 अंकों का मोबाइल नंबर')}
                keyboardType="number-pad"
                maxLength={10}
                value={c.phone}
                onChangeText={(v) => updateContact(idx, 'phone', sanitizeMobileInput(v))}
              />
            </View>
            <TouchableOpacity onPress={() => removeContactRow(idx)} style={styles.removeBtn}>
              <Ionicons name="trash-outline" size={18} color={colors.alert} />
            </TouchableOpacity>
          </View>
        ))}

        {contacts.length < 3 && (
          <TouchableOpacity onPress={addContactRow} style={styles.addRow}>
            <Ionicons name="add-circle-outline" size={18} color={colors.shaktiMaroon} />
            <Text style={styles.addRowText}>{tt('एक और संपर्क जोड़ें')}</Text>
          </TouchableOpacity>
        )}

        <PrimaryButton
          title={contactsBusy ? tt('सुरक्षित हो रहा है…') : tt('इमरजेंसी संपर्क सुरक्षित करें')}
          onPress={saveContacts}
          style={{ marginTop: 14 }}
         loading={contactsBusy} />
      </View>

      {/* 🆕 Biometric App-Lock — फ़ोन किसी और के हाथ लगने पर भी संवेदनशील शिकायत-इतिहास
          फ़िंगरप्रिंट/फ़ेस-अनलॉक के बिना न दिखे */}
      <View style={styles.card}>
        <View style={styles.emergHeader}>
          <Ionicons name="finger-print-outline" size={18} color={colors.inkNavy} />
          <Text style={styles.sectionTitle}>{tt('ऐप सुरक्षा')}</Text>
        </View>
        <View style={styles.bioLockRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bioLockLabel}>{tt('फ़िंगरप्रिंट/फ़ेस-लॉक')}</Text>
            <Text style={styles.hint}>{tt('ऐप हर बार खुलने पर पहचान सत्यापित करेगा — अगर फ़ोन किसी और के हाथ लगे तो भी शिकायत-इतिहास सुरक्षित रहे।')}</Text>
          </View>
          <Switch value={bioLockOn} onValueChange={toggleBioLock} trackColor={{ true: colors.shaktiMaroon }} />
        </View>
        {!bioAvailable && (
          <Text style={styles.bioLockWarning}>
            {tt('इस डिवाइस पर फ़िंगरप्रिंट/फ़ेस-अनलॉक अभी सेट नहीं है।')}
          </Text>
        )}
        {/* 🆕 "किन-किन डिवाइस में लॉगिन है" — देखें व चाहें तो कोई एक डिवाइस अलग से लॉगआउट करें */}
        <TouchableOpacity style={styles.sessionsLink} onPress={() => navigation.navigate('ActiveSessions')}>
          <Ionicons name="phone-portrait-outline" size={16} color={colors.inkNavy} />
          <Text style={styles.sessionsLinkText}>{tt('मेरे लॉगिन डिवाइस देखें')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.inkLight} />
        </TouchableOpacity>
        {/* 🆕 फ़ोन चोरी/खोने या खाता compromise होने के शक़ पर — पहले यह सुविधा सिर्फ़
            अधिकारी/एडमिन की Settings में थी, नागरिक के पास बिल्कुल नहीं थी — जबकि
            नागरिक ही सबसे ज़्यादा इस्तेमाल करते हैं और फ़ोन खोने का जोखिम सबसे ज़्यादा
            उन्हीं पर लागू होता है। */}
        <TouchableOpacity
          style={styles.logoutAllBtn}
          onPress={() => {
            Alert.alert(
              tt('सभी डिवाइस से लॉगआउट करें?'),
              tt('अगर आपका फ़ोन खो गया है या किसी और ने आपके खाते में लॉगिन किया हो सकता है, तो यह हर जगह से एक साथ लॉगआउट कर देगा — यहां सहित।'),
              [
                { text: tt('रद्द करें'), style: 'cancel' },
                { text: tt('हाँ, सभी जगह से'), style: 'destructive', onPress: logoutAllDevices },
              ]
            );
          }}
        >
          <Ionicons name="log-out-outline" size={16} color={colors.alert} />
          <Text style={styles.logoutAllBtnText}>{tt('सभी डिवाइस से लॉगआउट करें')}</Text>
        </TouchableOpacity>
      </View>

      {/* 🆕 DPDP Act — डेटा तक पहुंच व मिटाने का अधिकार */}
      <View style={styles.card}>
        <View style={styles.emergHeader}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.inkNavy} />
          <Text style={styles.sectionTitle}>{tt('मेरी निजता')}</Text>
        </View>
        <Text style={styles.hint}>{tt('अपना पूरा डेटा डाउनलोड करें, या खाता हटाने का अनुरोध भेजें।')}</Text>
        <TouchableOpacity style={styles.privacyBtn} onPress={doExportData} disabled={exportBusy}>
          <Ionicons name="download-outline" size={17} color={colors.inkNavy} />
          <Text style={styles.privacyBtnText}>{exportBusy ? tt('तैयार हो रहा है…') : tt('मेरा डेटा डाउनलोड करें')}</Text>
        </TouchableOpacity>
        {deletionRequest?.status === 'pending' ? (
          <View style={styles.deletionPending}>
            <Ionicons name="time-outline" size={16} color={colors.marigold} />
            <Text style={styles.deletionPendingText}>{tt('खाता हटाने का अनुरोध समीक्षा में है।')}</Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.privacyBtn, styles.dangerBtn]} onPress={doRequestDeletion} disabled={deletionBusy}>
            <Ionicons name="trash-outline" size={17} color={colors.alert} />
            <Text style={[styles.privacyBtnText, { color: colors.alert }]}>{tt('खाता हटाने का अनुरोध करें')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.note}>
        {tt('प्रोफ़ाइल जानकारी तब अपने आप इस्तेमाल होगी जब आप "अपने लिए" शिकायत दर्ज करेंगे।')}
      </Text>
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
  avatarImg: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.sand },
  row2: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  pickerWrap: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  avatarPlaceholder: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border },
  avatarEditBadge: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.shaktiMaroon, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  removePhotoText: { fontSize: 12, color: colors.alert, fontWeight: '700', marginTop: 8 },
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '700', color: colors.inkNavy, marginBottom: 12 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 14,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
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
  readOnly: { backgroundColor: colors.sand, justifyContent: 'center' },
  readOnlyText: { fontSize: 14.5, color: colors.inkGrey },
  hint: { fontSize: 11, color: colors.inkLight, marginTop: 5, marginBottom: 10, lineHeight: 16 },
  note: { fontSize: 12, color: colors.inkLight, textAlign: 'center', marginTop: 4, lineHeight: 18, paddingHorizontal: 10 },
  emergHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  bioLockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  bioLockLabel: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 3 },
  bioLockWarning: { fontSize: 11, color: colors.marigold, marginTop: 10 },
  logoutAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.sand },
  logoutAllBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.alert, textDecorationLine: 'underline' },
  sessionsLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, marginTop: 6, borderTopWidth: 1, borderTopColor: colors.sand },
  sessionsLinkText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.inkNavy },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy },
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  removeBtn: { padding: 10, marginTop: 2 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  addRowText: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
  privacyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.sand,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  dangerBtn: { backgroundColor: '#FBEAEA' },
  privacyBtnText: { fontSize: 13, fontWeight: '700', color: colors.inkNavy },
  deletionPending: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 4 },
  deletionPendingText: { fontSize: 12, color: colors.marigold, fontWeight: '600' },
});
