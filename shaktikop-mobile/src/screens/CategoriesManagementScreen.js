import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { AVAILABLE_FORM_FIELDS } from '../data/constants';
import { useApp } from '../context/AppContext';

export default function CategoriesManagementScreen() {
  const { user, fetchAdminCategories, createCategory, updateCategoryAdmin, deactivateCategoryAdmin } = useApp();
  const isSuperAdmin = user?.adminRole === 'super_admin';

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#8E2A46');
  const [slaHours, setSlaHours] = useState('48');
  const [requiresVehicle, setRequiresVehicle] = useState(false);
  const [selectedFields, setSelectedFields] = useState(['victim', 'district', 'policeStation', 'incidentLocation', 'description', 'location']);
  const [busy, setBusy] = useState(false);

  const toggleField = (key) => {
    setSelectedFields((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminCategories();
      setList(data);
    } catch (e) {
      // सिर्फ़ super_admin को मिलेगा
    }
    setLoading(false);
  }, [fetchAdminCategories]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!key.trim() || !label.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('key और नाम दोनों आवश्यक हैं।'));
      return;
    }
    if (selectedFields.length === 0) {
      Alert.alert(tt('कोई फ़ील्ड नहीं चुनी'), tt('फॉर्म में दिखाने के लिए कम से कम एक फ़ील्ड चुनें।'));
      return;
    }
    setBusy(true);
    try {
      await createCategory({
        key: key.trim(),
        label: label.trim(),
        description: description.trim(),
        color,
        slaHours: Number(slaHours) || 48,
        requiresVehicleNumber: requiresVehicle,
        fields: selectedFields,
      });
      setKey('');
      setLabel('');
      setDescription('');
      setShowForm(false);
      await load();
      Alert.alert(tt('जुड़ गई'), tt('नई श्रेणी अब पूरे app में दिखेगी।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const toggleActive = async (item) => {
    try {
      if (item.isActive) {
        await deactivateCategoryAdmin(item.id);
      } else {
        await updateCategoryAdmin(item.id, { isActive: true });
      }
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
  };

  if (!isSuperAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.restrictedBox}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.inkLight} />
          <Text style={styles.restrictedText}>{tt('यह सेक्शन सिर्फ़ Super Admin के लिए है।')}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('शिकायत श्रेणियां')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((s) => !s)}>
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        {tt('यहाँ जोड़ी गई श्रेणी तुरंत नागरिक के "नई शिकायत" पेज पर दिखने लगती है। पुरानी श्रेणी को "निष्क्रिय" किया जा सकता है (पूरी तरह हटाया नहीं जाता)।')}
      </Text>

      {showForm && (
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder={tt('key (जैसे — साइबर अपराध)')} value={key} onChangeText={setKey} maxLength={60} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('प्रदर्शित नाम')} value={label} onChangeText={setLabel} maxLength={80} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('विवरण (वैकल्पिक)')} value={description} onChangeText={setDescription} maxLength={1000} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('रंग कोड (जैसे #8E2A46)')} value={color} onChangeText={setColor} autoCapitalize="none" maxLength={20} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('SLA घंटे (जैसे 48)')} value={slaHours} onChangeText={setSlaHours} keyboardType="number-pad" maxLength={5} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{tt('वाहन नंबर फ़ील्ड चाहिए (जैसे सुरक्षित यात्रा)')}</Text>
            <Switch value={requiresVehicle} onValueChange={setRequiresVehicle} trackColor={{ true: colors.sage }} />
          </View>

          <Text style={styles.fieldsHeading}>{tt('फॉर्म में कौन-कौन से फ़ील्ड्स दिखें?')}</Text>
          <Text style={styles.sectionHintSmall}>{tt('नागरिक इस श्रेणी की शिकायत भरते समय सिर्फ़ यही फ़ील्ड्स देखेंगे।')}</Text>
          {AVAILABLE_FORM_FIELDS.map((f) => (
            <TouchableOpacity key={f.key} style={styles.fieldRow} onPress={() => toggleField(f.key)}>
              <Ionicons name={selectedFields.includes(f.key) ? 'checkbox' : 'square-outline'} size={19} color={selectedFields.includes(f.key) ? colors.shaktiMaroon : colors.inkLight} />
              <Text style={styles.fieldRowLabel}>{f.label}</Text>
            </TouchableOpacity>
          ))}

          <PrimaryButton title={busy ? tt('जोड़ी जा रही है…') : tt('श्रेणी जोड़ें')} onPress={submit} style={{ marginTop: 14 }}  loading={busy} />
        </View>
      )}

      {loading ? (
        <Text style={styles.hint}>{tt('लोड हो रहा है…')}</Text>
      ) : (
        list.map((item) => (
          <View key={item.id} style={styles.catRow}>
            <View style={[styles.colorDot, { backgroundColor: item.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.catLabel, !item.isActive && styles.catLabelInactive]}>{item.label}</Text>
              <Text style={styles.catMeta}>SLA: {item.slaHours} घंटे {!item.isActive ? '· निष्क्रिय' : ''}</Text>
            </View>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  rowLabel: { fontSize: 12.5, color: colors.inkGrey, flex: 1, marginRight: 10 },
  fieldsHeading: { fontSize: 12.5, fontWeight: '700', color: colors.inkNavy, marginTop: 16, marginBottom: 4 },
  sectionHintSmall: { fontSize: 10.5, color: colors.inkLight, marginBottom: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  fieldRowLabel: { fontSize: 12, color: colors.inkGrey, flex: 1 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  catLabel: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  catLabelInactive: { color: colors.inkLight, textDecorationLine: 'line-through' },
  catMeta: { fontSize: 11, color: colors.inkGrey, marginTop: 2 },
  restrictedBox: { alignItems: 'center', paddingTop: 80 },
  restrictedText: { fontSize: 13, color: colors.inkLight, marginTop: 12 },
});
