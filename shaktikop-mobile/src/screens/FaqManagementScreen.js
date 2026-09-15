import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

export default function FaqManagementScreen() {
  const { user, fetchAdminFaq, createFaq, updateFaq, deleteFaq } = useApp();
  const isSuperAdmin = user?.adminRole === 'super_admin';

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState('सामान्य');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminFaq();
      setList(data);
    } catch (e) {
      // सिर्फ़ super_admin को मिलेगा
    }
    setLoading(false);
  }, [fetchAdminFaq]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!question.trim() || !answer.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('प्रश्न और उत्तर दोनों आवश्यक हैं।'));
      return;
    }
    setBusy(true);
    try {
      await createFaq({ question: question.trim(), answer: answer.trim(), category: category.trim() || 'सामान्य' });
      setQuestion('');
      setAnswer('');
      setShowForm(false);
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const toggleActive = async (item) => {
    try {
      await updateFaq(item.id, { isActive: !item.isActive });
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
  };

  const remove = (item) => {
    Alert.alert(tt('हटाएं?'), item.question, [
      { text: tt('रद्द करें'), style: 'cancel' },
      {
        text: tt('हटाएं'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFaq(item.id);
            await load();
          } catch (e) {
            Alert.alert(tt('त्रुटि'), e.message);
          }
        },
      },
    ]);
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
        <Text style={styles.h2}>{tt('FAQ / मदद प्रबंधन')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((s) => !s)}>
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>{tt('यहाँ जोड़ा गया प्रश्न तुरंत नागरिक ऐप की "मदद" स्क्रीन पर दिखने लगता है।')}</Text>

      {showForm && (
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder={tt('प्रश्न')} value={question} onChangeText={setQuestion} maxLength={300} />
          <TextInput style={[styles.input, styles.textarea, { marginTop: 10 }]} placeholder={tt('उत्तर')} multiline value={answer} onChangeText={setAnswer} maxLength={2000} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('श्रेणी (जैसे — शिकायत दर्ज करना)')} value={category} onChangeText={setCategory} maxLength={100} />
          <PrimaryButton title={busy ? tt('जोड़ा जा रहा है…') : tt('जोड़ें')} onPress={submit} style={{ marginTop: 14 }}  loading={busy} />
        </View>
      )}

      {loading ? (
        <Text style={styles.hint}>{tt('लोड हो रहा है…')}</Text>
      ) : (
        list.map((item) => (
          <View key={item.id} style={styles.faqRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.question, !item.isActive && styles.inactive]}>{item.question}</Text>
              <Text style={styles.category}>{item.category} {!item.isActive ? '· निष्क्रिय' : ''}</Text>
            </View>
            <TouchableOpacity onPress={() => toggleActive(item)} style={{ marginRight: 10 }}>
              <Ionicons name={item.isActive ? 'eye-outline' : 'eye-off-outline'} size={18} color={colors.inkGrey} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => remove(item)}>
              <Ionicons name="trash-outline" size={18} color={colors.alert} />
            </TouchableOpacity>
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
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  faqRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  question: { fontSize: 13, fontWeight: '700', color: colors.inkNavy },
  inactive: { color: colors.inkLight, textDecorationLine: 'line-through' },
  category: { fontSize: 10.5, color: colors.inkGrey, marginTop: 2 },
  restrictedBox: { alignItems: 'center', paddingTop: 80 },
  restrictedText: { fontSize: 13, color: colors.inkLight, marginTop: 12 },
});
