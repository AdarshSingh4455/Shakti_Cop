import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';

// ऐप की वे स्क्रीनें जिन पर सेवा-कार्ड भेज सकता है।
// ⚠️ यह सूची backend की श्वेत-सूची से मेल खानी चाहिए (policeServicesController.js) —
// वहाँ जो नाम मान्य नहीं, वह यहाँ दिखाने का कोई मतलब नहीं, और ग़लत नाम भेजने पर
// अनुरोध वैसे भी अस्वीकार हो जाएगा।
const INTERNAL_SCREENS = [
  'ComplaintForm',        // नई शिकायत दर्ज करें
  'TrackComplaint',       // ID से शिकायत ट्रैक करें
  'CitizenAllComplaints', // मेरी सभी शिकायतें
  'NearbyHelp',           // नज़दीकी थाना/अस्पताल
  'Faq',                  // सामान्य प्रश्न
  'ServiceRequestForm',   // काउंसलिंग/कानूनी सहायता का अनुरोध
];

const Field = ({ label, children }) => (
  <View style={{ marginBottom: 12 }}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

export default function PoliceServicesManagementScreen() {
  const {
    fetchAllPoliceServices,
    createPoliceService,
    updatePoliceService,
    deletePoliceService,
  } = useApp();

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // फ़ॉर्म
  const [group, setGroup] = useState('');
  const [tag, setTag] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [icon, setIcon] = useState('');
  const [url, setUrl] = useState('');
  const [internal, setInternal] = useState('');
  const [displayOrder, setDisplayOrder] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await fetchAllPoliceServices());
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setLoading(false);
  }, [fetchAllPoliceServices]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setGroup(''); setTag(''); setTitle(''); setDesc('');
    setIcon(''); setUrl(''); setInternal(''); setDisplayOrder('');
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setGroup(item.group || '');
    setTag(item.tag || '');
    setTitle(item.title || '');
    setDesc(item.desc || '');
    setIcon(item.icon || '');
    setUrl(item.url || '');
    setInternal(item.internal || '');
    setDisplayOrder(item.displayOrder != null ? String(item.displayOrder) : '');
    setShowForm(true);
  };

  const save = async () => {
    if (!group.trim() || !title.trim()) {
      return Alert.alert(tt('जानकारी अधूरी है'), tt('समूह और शीर्षक — दोनों ज़रूरी हैं।'));
    }
    // 🔒 यही जाँच backend में भी है; यहाँ इसलिए कि उपयोगकर्ता को तुरंत पता चले
    if (!url.trim() && !internal.trim()) {
      return Alert.alert(tt('लिंक चुनें'), tt('या तो कोई वेबसाइट-लिंक दें, या ऐप की कोई स्क्रीन चुनें।'));
    }
    if (url.trim() && internal.trim()) {
      return Alert.alert(tt('दोनों नहीं'), tt('लिंक और ऐप-स्क्रीन — इनमें से कोई एक ही चुनें।'));
    }

    setBusy(true);
    try {
      const payload = {
        group: group.trim(),
        tag: tag.trim() || undefined,
        title: title.trim(),
        desc: desc.trim() || undefined,
        icon: icon.trim() || undefined,
        url: url.trim() || null,
        internal: internal.trim() || null,
        displayOrder: displayOrder.trim() ? Number(displayOrder.trim()) : 0,
      };
      if (editingId) await updatePoliceService(editingId, payload);
      else await createPoliceService(payload);
      resetForm();
      setShowForm(false);
      await load();
      Alert.alert(tt('सुरक्षित हुआ'), tt('सेवा-सूची अपडेट हो गई — नागरिकों को तुरंत दिखने लगेगी।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const toggleActive = async (item) => {
    try {
      if (item.isActive) {
        // हटाना = निष्क्रिय करना (मिटाना नहीं) — ग़लती से हटाई सेवा वापस चालू की जा सके
        await deletePoliceService(item.id);
      } else {
        await updatePoliceService(item.id, { isActive: true });
      }
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
  };

  const confirmRemove = (item) => {
    Alert.alert(
      tt('सेवा हटाएं?'),
      tt(`"${item.title}" नागरिकों को दिखना बंद हो जाएगी। बाद में दोबारा चालू भी कर सकते हैं।`),
      [
        { text: tt('रद्द करें'), style: 'cancel' },
        { text: tt('हटाएं'), style: 'destructive', onPress: () => toggleActive(item) },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={[styles.card, !item.isActive && styles.cardInactive]}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardGroup}>{tt(item.group)}</Text>
          <Text style={styles.cardTitle}>{tt(item.title)}</Text>
          {!!item.desc && <Text style={styles.cardDesc} numberOfLines={2}>{tt(item.desc)}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name={item.internal ? 'phone-portrait-outline' : 'link-outline'} size={12} color={colors.inkLight} />
            <Text style={styles.cardTarget} numberOfLines={1}>
              {item.internal || item.url}
            </Text>
          </View>
        </View>
        <Switch value={item.isActive} onValueChange={() => toggleActive(item)} />
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => startEdit(item)}>
          <Ionicons name="create-outline" size={16} color={colors.inkNavy} />
          <Text style={styles.actionText}>{tt('बदलें')}</Text>
        </TouchableOpacity>
        {item.isActive && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => confirmRemove(item)}>
            <Ionicons name="trash-outline" size={16} color={colors.alert} />
            <Text style={[styles.actionText, { color: colors.alert }]}>{tt('हटाएं')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const header = (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('पुलिस सेवाएं')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { resetForm(); setShowForm((s) => !s); }}
        >
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.white} />
          <Text style={styles.addBtnText}>{showForm ? tt('बंद करें') : tt('नई सेवा')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        {tt('यहाँ किया गया बदलाव नागरिकों को तुरंत दिखता है — नई ऐप अपडेट की ज़रूरत नहीं।')}
      </Text>

      {showForm && (
        <View style={styles.form}>
          <Field label={tt('समूह *')}>
            <TextInput
              style={styles.input}
              value={group}
              onChangeText={setGroup}
              placeholder={tt('जैसे: शिकायत व FIR')}
              maxLength={60}
            />
          </Field>
          <Field label={tt('शीर्षक *')}>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={120} />
          </Field>
          <Field label={tt('छोटा लेबल')}>
            <TextInput
              style={styles.input}
              value={tag}
              onChangeText={setTag}
              placeholder={tt('जैसे: UPCOP पोर्टल')}
              maxLength={40}
            />
          </Field>
          <Field label={tt('विवरण')}>
            <TextInput
              style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
              value={desc}
              onChangeText={setDesc}
              multiline
              maxLength={300}
            />
          </Field>

          <Text style={styles.sectionNote}>
            {tt('नीचे इनमें से कोई एक भरें — या तो वेबसाइट का लिंक, या ऐप की कोई स्क्रीन।')}
          </Text>
          <Field label={tt('वेबसाइट लिंक')}>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={(t) => { setUrl(t); if (t.trim()) setInternal(''); }}
              placeholder="https://..."
              autoCapitalize="none"
              keyboardType="url"
              maxLength={500}
            />
          </Field>
          <Field label={tt('या — ऐप की स्क्रीन')}>
            <View style={styles.chipWrap}>
              {INTERNAL_SCREENS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, internal === s && styles.chipActive]}
                  onPress={() => {
                    const next = internal === s ? '' : s;
                    setInternal(next);
                    if (next) setUrl('');
                  }}
                >
                  <Text style={[styles.chipText, internal === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label={tt('आइकन (Ionicons नाम)')}>
            <TextInput
              style={styles.input}
              value={icon}
              onChangeText={setIcon}
              placeholder="document-text-outline"
              autoCapitalize="none"
              maxLength={60}
            />
          </Field>
          <Field label={tt('क्रम (छोटा नंबर = ऊपर)')}>
            <TextInput
              style={styles.input}
              value={displayOrder}
              onChangeText={setDisplayOrder}
              keyboardType="number-pad"
              maxLength={4}
            />
          </Field>

          <PrimaryButton
            title={busy ? tt('सुरक्षित हो रहा है…') : editingId ? tt('बदलाव सुरक्षित करें') : tt('सेवा जोड़ें')}
            onPress={save}
            loading={busy}
            style={{ marginTop: 6 }}
          />
          {!!editingId && (
            <SecondaryButton
              title={tt('रद्द करें')}
              onPress={() => { resetForm(); setShowForm(false); }}
              style={{ marginTop: 8 }}
            />
          )}
        </View>
      )}
    </>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      data={loading ? [] : list}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <Text style={styles.hint}>
          {loading ? tt('लोड हो रहा है…') : tt('अभी कोई सेवा नहीं जोड़ी गई है।')}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  hint: { fontSize: 12.5, color: colors.sage, marginTop: 6, marginBottom: 12, lineHeight: 18 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.shaktiMaroon, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.md,
  },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  form: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  label: { fontSize: 12.5, color: colors.sage, marginBottom: 5, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.inkNavy,
    backgroundColor: colors.white,
  },
  sectionNote: { fontSize: 12, color: colors.inkNavy, marginBottom: 10, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.inkNavy, borderColor: colors.inkNavy },
  chipText: { fontSize: 12, color: colors.inkNavy },
  chipTextActive: { color: colors.white, fontWeight: '700' },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: 13, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  cardInactive: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardGroup: { fontSize: 11, color: colors.sage, fontWeight: '700', marginBottom: 2 },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy },
  cardDesc: { fontSize: 12.5, color: colors.sage, marginTop: 3, lineHeight: 17 },
  cardTarget: { fontSize: 11.5, color: colors.inkNavyLight, marginTop: 5 },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12.5, color: colors.inkNavy, fontWeight: '600' },
});
