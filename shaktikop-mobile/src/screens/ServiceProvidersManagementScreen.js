import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import SafePicker from '../components/SafePicker';
import { useApp } from '../context/AppContext';
import { SERVICE_TYPES } from '../data/serviceRequests';
import { DISTRICTS } from '../data/districts';
import { validateName, validateMobile, validateEmail, sanitizeNameInput, sanitizeMobileInput } from '../utils/validators';

export default function ServiceProvidersManagementScreen() {
  const { user, fetchServiceProviders, createServiceProvider, updateServiceProvider, deleteServiceProvider, districtsVersion } = useApp();
  const isSuperAdmin = user?.adminRole === 'super_admin';
  // 🐛 बग फ़िक्स (गंभीर — वही समस्या जो साइड-मेनू श्रेणियों में मिली थी): पहले यह
  // dropdown-सूचियां module-level (component के बाहर) बनती थीं — भाषा बदलने पर
  // कभी दोबारा नहीं बनतीं, और service-type/ज़िले के नाम पर tt() लगा ही नहीं था।
  const TYPE_OPTIONS = [
    { label: tt('सभी सेवाओं के लिए'), value: '' },
    ...Object.values(SERVICE_TYPES).map((s) => ({ label: `${s.emoji} ${tt(s.label)}`, value: s.key })),
  ];
  const DISTRICT_OPTIONS = [{ label: tt('सभी ज़िलों के लिए'), value: '' }, ...DISTRICTS.map((d) => ({ label: tt(d), value: d }))];
  // 🆕 SHO भी अब काउंसलर/प्रशिक्षक ID बना/बदल सकते हैं — अपॉइंटमेंट भी वही शेड्यूल करते हैं
  const isSHO = user?.role === 'officer' && user?.rank === 'SHO';
  const canManage = isSuperAdmin || isSHO;

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [name, setName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [designation, setDesignation] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [district, setDistrict] = useState('');
  const [policeStation, setPoliceStation] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [venue, setVenue] = useState('');
  const [otherDetails, setOtherDetails] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setFatherName('');
    setDesignation('');
    setServiceType('');
    setDistrict('');
    setPoliceStation('');
    setMobile('');
    setEmail('');
    setVenue('');
    setOtherDetails('');
    setPassword('');
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchServiceProviders({ includeInactive: true });
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      // 403 (super_admin नहीं) या टेबल न बनी हो — सूची खाली रहेगी
    }
    setLoading(false);
  }, [fetchServiceProviders]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (item) => {
    setEditingId(item.id);
    setName(item.name || '');
    setFatherName(item.fatherName || '');
    setDesignation(item.designation || '');
    setServiceType(item.serviceType || '');
    setDistrict(item.district || '');
    setPoliceStation(item.policeStation || '');
    setMobile(item.mobile || '');
    setEmail(item.email || '');
    setVenue(item.venue || '');
    setOtherDetails(item.otherDetails || '');
    setShowForm(true);
  };

  const submit = async () => {
    const nameErr = validateName(name);
    if (nameErr) {
      Alert.alert(tt('अमान्य नाम'), tt(nameErr));
      return;
    }
    // ⚠️ काउंसलर को खुद लॉगिन करना है, इसलिए मोबाइल/ईमेल/पासवर्ड — नई ID बनाते
    // समय तीनों ज़रूरी हैं (edit करते समय पासवर्ड बदलने की ज़रूरत नहीं)
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
    if (!editingId && (!password || password.length < 6)) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('पासवर्ड कम से कम 6 अक्षर का होना चाहिए — इसी से काउंसलर लॉगिन करेगा।'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        fatherName: fatherName.trim() || null,
        designation: designation.trim() || null,
        serviceType: serviceType || null,
        district: district || null,
        policeStation: policeStation.trim() || null,
        mobile: mobile.trim(),
        email: email.trim(),
        venue: venue.trim() || null,
        otherDetails: otherDetails.trim() || null,
      };
      if (editingId) {
        await updateServiceProvider(editingId, payload);
      } else {
        await createServiceProvider({ ...payload, password });
      }
      resetForm();
      setShowForm(false);
      await load();
      Alert.alert(
        tt('सुरक्षित हुआ'),
        editingId ? tt('बदलाव सुरक्षित हो गए।') : tt('काउंसलर ID बन गई — अब वे इसी मोबाइल/ईमेल व पासवर्ड से लॉगिन कर सकते हैं।')
      );
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const toggleActive = async (item) => {
    try {
      if (item.isActive) {
        await deleteServiceProvider(item.id);
      } else {
        await updateServiceProvider(item.id, { isActive: true });
      }
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
  };

  if (!canManage) {
    return (
      <View style={styles.container}>
        <View style={styles.restrictedBox}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.inkLight} />
          <Text style={styles.restrictedText}>{tt('यह सेक्शन सिर्फ़ Super Admin या SHO के लिए है।')}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('काउंसलर / प्रशिक्षक सूची')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (showForm) {
              resetForm();
            }
            setShowForm((s) => !s);
          }}
        >
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        {tt('यहाँ जोड़ा गया नाम "सेवा अनुरोध" प्रबंधन स्क्रीन में सत्र तय करते समय dropdown में दिखेगा — टाइप करने की ज़रूरत नहीं, वर्तनी की गलती नहीं होगी। पुराना नाम "निष्क्रिय" किया जा सकता है (पूरी तरह हटाया नहीं जाता)।')}
      </Text>

      {showForm && (
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder={tt('नाम')} value={name} onChangeText={(t) => setName(sanitizeNameInput(t))} maxLength={80} />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            placeholder={tt('पिता/पति का नाम (वैकल्पिक)')}
            value={fatherName}
            onChangeText={(t) => setFatherName(sanitizeNameInput(t))}
            maxLength={80}
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            placeholder={tt('पदनाम (जैसे — काउंसलिंग साइकोलॉजिस्ट)')}
            value={designation}
            onChangeText={setDesignation}
            maxLength={100}
          />

          <Text style={styles.label}>{tt('किस सेवा के लिए')}</Text>
          <View style={styles.pickerWrap}>
            <SafePicker selectedValue={serviceType} onValueChange={setServiceType} items={TYPE_OPTIONS} />
          </View>

          <Text style={styles.label}>{tt('ज़िला')}</Text>
          <View style={styles.pickerWrap}>
            <SafePicker key={`d-${districtsVersion}`} selectedValue={district} onValueChange={setDistrict} items={DISTRICT_OPTIONS} />
          </View>

          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            placeholder={tt('थाना (वैकल्पिक)')}
            value={policeStation}
            onChangeText={setPoliceStation}
            maxLength={100}
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            placeholder={tt('मोबाइल नंबर (10 अंक, आवश्यक — इसी से लॉगिन होगा)')}
            value={mobile}
            onChangeText={(t) => setMobile(sanitizeMobileInput(t))}
            maxLength={10}
            keyboardType="phone-pad"
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            placeholder={tt('ईमेल आईडी (आवश्यक)')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            maxLength={254}
            keyboardType="email-address"
          />
          {!editingId && (
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder={tt('पासवर्ड (8-16 अक्षर — काउंसलर इसी से लॉगिन करेगा)')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              maxLength={16}
            />
          )}
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            placeholder={tt('सामान्य स्थान (वैकल्पिक)')}
            value={venue}
            onChangeText={setVenue}
            maxLength={150}
          />
          <TextInput
            style={[styles.input, { marginTop: 10, minHeight: 70, textAlignVertical: 'top' }]}
            placeholder={tt('अन्य विवरण (वैकल्पिक)')}
            value={otherDetails}
            onChangeText={setOtherDetails}
            multiline
            maxLength={1000}
          />

          <PrimaryButton
            title={busy ? tt('सुरक्षित हो रहा है…') : editingId ? tt('बदलाव सुरक्षित करें') : tt('काउंसलर जोड़ें')}
            onPress={submit}
            style={{ marginTop: 14 }}
            loading={busy}
          />
        </View>
      )}

      {loading ? (
        <Text style={styles.hint}>{tt('लोड हो रहा है…')}</Text>
      ) : list.length === 0 ? (
        <Text style={styles.hint}>{tt('अभी कोई काउंसलर नहीं जोड़ा गया।')}</Text>
      ) : (
        list.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowName, !item.isActive && styles.rowNameInactive]}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                {[item.designation, item.serviceType ? tt(SERVICE_TYPES[item.serviceType]?.label || item.serviceType) : tt('सभी सेवाएं'), item.district || tt('सभी ज़िले'), item.policeStation]
                  .filter(Boolean)
                  .join(' · ')}
                {!item.isActive ? ` · ${tt('निष्क्रिय')}` : ''}
              </Text>
              {item.fatherName ? <Text style={styles.rowMeta}>{tt('पिता/पति का नाम')}: {item.fatherName}</Text> : null}
              {item.mobile ? <Text style={styles.rowMeta}>📞 {item.mobile}{item.email ? ` · ✉️ ${item.email}` : ''}</Text> : null}
              {item.createdByName ? (
                <Text style={styles.rowMetaFaint}>
                  {tt('बनाई')}: {item.createdByName} ({item.createdByRole})
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => openEdit(item)} style={styles.editBtn}>
              <Ionicons name="create-outline" size={18} color={colors.inkGrey} />
            </TouchableOpacity>
            <Switch value={item.isActive} onValueChange={() => toggleActive(item)} trackColor={{ true: colors.sage }} />
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  addBtn: { backgroundColor: colors.shaktiMaroon, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11.5, color: colors.inkLight, marginTop: 6, marginBottom: 16, lineHeight: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  label: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey, marginBottom: 5, marginTop: 12 },
  pickerWrap: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.white, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  rowName: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  rowNameInactive: { color: colors.inkLight, textDecorationLine: 'line-through' },
  rowMeta: { fontSize: 11, color: colors.inkGrey, marginTop: 2 },
  rowMetaFaint: { fontSize: 9.5, color: colors.inkLight, marginTop: 2, fontStyle: 'italic' },
  editBtn: { padding: 6 },
  restrictedBox: { alignItems: 'center', paddingTop: 80 },
  restrictedText: { fontSize: 13, color: colors.inkLight, marginTop: 12 },
});
