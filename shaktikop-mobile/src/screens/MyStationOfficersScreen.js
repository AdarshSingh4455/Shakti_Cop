import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { tt } from '../context/LocaleContext';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { LoadingView } from '../components/LoadingView';
import { useApp } from '../context/AppContext';

// 🆕 यह स्क्रीन पहले मौजूद ही नहीं थी — SHO नया अधिकारी (SI) बना तो सकते थे
// ("Add investigating officer" बटन से), पर बनाए हुए अधिकारियों की सूची देखने,
// उनकी जानकारी बदलने, या सक्रिय/निष्क्रिय करने का कोई तरीक़ा ही नहीं था — यह
// ठीक वही कमी है जो असली इस्तेमाल में सामने आई।
//
// 🐛 बदलाव (उपयोगकर्ता-अनुरोध): पहले यहां "ट्रांसफ़र" की सुविधा भी थी (पहले सिर्फ़
// अपने ज़िले तक सीमित की गई थी, अब पूरी तरह हटाई गई है) — SHO अब किसी भी अधिकारी
// को ट्रांसफ़र नहीं कर सकता (न अपने ज़िले में, न बाहर) — यह सिर्फ़ ऊपर से (admin)
// होना चाहिए। साथ ही मोबाइल-नंबर संपादन भी हटाया गया — मोबाइल हर अधिकारी की एक
// अनूठी, स्थिर पहचान है (लॉगिन/OTP के लिए भी इस्तेमाल होती है), SHO इसे नहीं बदल
// सकता। अब SHO सिर्फ़ नाम/PNO बदल सकता है, और ID को सक्रिय/निष्क्रिय कर सकता है।
export default function MyStationOfficersScreen({ navigation }) {
  const { fetchMyStationOfficers, updateMyStationOfficer, setMyStationOfficerStatus, user } = useApp();

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // Edit-मोड फ़ील्ड — सिर्फ़ नाम व PNO (badge_id), मोबाइल नहीं
  const [editName, setEditName] = useState('');
  const [editPno, setEditPno] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyStationOfficers();
      setList(data);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, [fetchMyStationOfficers]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openEdit = (item) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    setEditName(item.name);
    setEditPno(item.badgeId || item.pno || '');
  };

  const saveEdit = async (id) => {
    setBusy(true);
    try {
      await updateMyStationOfficer(id, { name: editName.trim(), pno: editPno.trim() });
      await load();
      Alert.alert(tt('सुरक्षित हुआ'), tt('जानकारी अपडेट हो गई।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const toggleStatus = (item) => {
    Alert.alert(
      item.isActive ? tt('निष्क्रिय करें?') : tt('सक्रिय करें?'),
      item.isActive
        ? tt(`${item.name} को निष्क्रिय करने पर वे अब लॉगिन नहीं कर पाएंगे।`)
        : tt(`${item.name} को दोबारा सक्रिय किया जाएगा।`),
      [
        { text: tt('रद्द करें'), style: 'cancel' },
        {
          text: item.isActive ? tt('निष्क्रिय करें') : tt('सक्रिय करें'),
          style: item.isActive ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            try {
              await setMyStationOfficerStatus(item.id, !item.isActive);
              await load();
            } catch (e) {
              Alert.alert(tt('त्रुटि'), e.message);
            }
            setBusy(false);
          },
        },
      ]
    );
  };

  if (loading) return <LoadingView />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.h2}>{tt('मेरे थाने के अधिकारी')}</Text>
      <Text style={styles.hint}>
        {tt(`${user?.station || ''} थाने के सभी अधिकारी — नाम/PNO बदलें, या सक्रिय/निष्क्रिय करें।`)}
      </Text>

      {list.length === 0 ? (
        <Text style={styles.emptyText}>{tt('अभी कोई अधिकारी सूची में नहीं है।')}</Text>
      ) : (
        list.map((item) => (
          <View key={item.id} style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={() => openEdit(item)} activeOpacity={0.7}>
              <View style={[styles.avatar, !item.isActive && { backgroundColor: colors.inkLight }]}>
                <Text style={styles.avatarText}>{(item.name || '?')[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.subtext}>
                  {item.badgeId} · {item.rank} {!item.isActive ? `· ${tt('निष्क्रिय')}` : ''}
                </Text>
              </View>
              <Ionicons name={expandedId === item.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkLight} />
            </TouchableOpacity>

            {expandedId === item.id && (
              <View style={styles.editBox}>
                <Text style={styles.label}>{tt('नाम')}</Text>
                <TextInput style={styles.input} value={editName} onChangeText={setEditName} maxLength={80} />
                <Text style={styles.label}>{tt('PNO (पुलिस आईडी)')}</Text>
                <TextInput style={styles.input} value={editPno} onChangeText={setEditPno} maxLength={30} />
                <PrimaryButton title={busy ? tt('सुरक्षित हो रहा है…') : tt('बदलाव सुरक्षित करें')} onPress={() => saveEdit(item.id)} loading={busy} style={{ marginTop: 10 }} />

                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: item.isActive ? colors.alert : colors.sage, marginTop: 10 }]}
                  onPress={() => toggleStatus(item)}
                  disabled={item.rank === 'SHO' && item.id === user?.id}
                >
                  <Text style={styles.smallBtnText}>{item.isActive ? tt('निष्क्रिय करें') : tt('सक्रिय करें')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  hint: { fontSize: 11.5, color: colors.inkLight, marginTop: 6, marginBottom: 16, lineHeight: 16 },
  emptyText: { textAlign: 'center', color: colors.inkLight, fontSize: 13, paddingVertical: 30 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, marginBottom: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.shaktiMaroon, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  name: { fontSize: 14, fontWeight: '700', color: colors.inkNavy },
  subtext: { fontSize: 11.5, color: colors.inkGrey, marginTop: 2 },
  editBox: { padding: 14, paddingTop: 0, borderTopWidth: 1, borderTopColor: colors.sand },
  label: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: colors.sand, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5 },
  smallBtn: { paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  smallBtnText: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
});
