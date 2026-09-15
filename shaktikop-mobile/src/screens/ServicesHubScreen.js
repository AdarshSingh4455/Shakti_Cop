import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { SERVICE_TYPES } from '../data/serviceRequests';

// ============================================================
// सहायता सेवा — काउंसलिंग, कानूनी सहायता, आत्मरक्षा, जन शिक्षण
//
// चारों सेवाएं एक ही जगह, बड़े कार्डों में। यहाँ से नया अनुरोध भेजा जाता है,
// और लॉगिन हो तो "मेरे अनुरोध" भी सीधे खुल जाते हैं।
// ============================================================

export default function ServicesHubScreen({ navigation }) {
  const { role } = useApp();

  const requireLogin = () =>
    Alert.alert(
      tt('लॉगिन आवश्यक है'),
      tt('अनुरोध भेजने के लिए पहले नागरिक खाते से लॉगिन करें — आपका नाम व मोबाइल प्रोफ़ाइल से अपने-आप भर जाएगा।'),
      [
        { text: tt('रद्द करें'), style: 'cancel' },
        { text: tt('लॉगिन करें'), onPress: () => navigation.navigate('Login') },
      ]
    );

  const openForm = (type) => (role ? navigation.navigate('ServiceRequestForm', { type }) : requireLogin());
  const openMine = (type) => (role ? navigation.navigate(`My_${type}`) : requireLogin());

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <View style={styles.headCard}>
        <Text style={styles.headEmoji}>🤝</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.headTitle}>{tt('सहायता सेवाएं')}</Text>
          <Text style={styles.headSub}>
            {tt('काउंसलिंग, कानूनी सलाह, प्रशिक्षण व कौशल — सब निःशुल्क व गोपनीय')}
          </Text>
        </View>
      </View>

      {!role && (
        <View style={styles.loginNote}>
          <Ionicons name="information-circle-outline" size={15} color={colors.inkNavy} />
          <Text style={styles.loginNoteText}>
            {tt('सेवाएं देखने के लिए लॉगिन ज़रूरी नहीं। अनुरोध भेजते समय ही खाता चाहिए।')}
          </Text>
        </View>
      )}

      {Object.values(SERVICE_TYPES).map((s) => (
        <View key={s.key} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.emojiBox}>
              <Text style={styles.emoji}>{s.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{tt(s.label)}</Text>
              <Text style={styles.intro}>{tt(s.intro)}</Text>
            </View>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => openForm(s.key)}>
              <Ionicons name="add-circle-outline" size={15} color={colors.white} />
              <Text style={styles.primaryBtnText}>{tt('नया अनुरोध')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => openMine(s.key)}>
              <Ionicons name="list-outline" size={15} color={colors.shaktiMaroon} />
              <Text style={styles.secondaryBtnText}>{tt('मेरे अनुरोध')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={styles.footNote}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.sage} />
        <Text style={styles.footText}>
          {tt('आपकी जानकारी सिर्फ़ अधिकृत वरिष्ठ अधिकारी को दिखेगी।')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.shaktiMaroon, borderRadius: radius.lg, padding: 15, marginBottom: 14 },
  headEmoji: { fontSize: 26 },
  headTitle: { fontSize: 16.5, fontWeight: '800', color: colors.white },
  headSub: { fontSize: 11.5, color: '#F0DCE2', marginTop: 3, lineHeight: 16 },
  loginNote: { flexDirection: 'row', gap: 8, backgroundColor: '#EAF0F7', borderRadius: radius.md, padding: 11, marginBottom: 14 },
  loginNoteText: { flex: 1, fontSize: 11.5, color: colors.inkNavy, lineHeight: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: 'row', gap: 12 },
  emojiBox: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.shaktiMaroonWash, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
  title: { fontSize: 14.5, fontWeight: '800', color: colors.inkNavy },
  intro: { fontSize: 11.5, color: colors.inkGrey, marginTop: 3, lineHeight: 16 },
  btnRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.shaktiMaroon, paddingVertical: 10, borderRadius: radius.md },
  primaryBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.white },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.white, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.shaktiMaroon },
  secondaryBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
  footNote: { flexDirection: 'row', gap: 7, backgroundColor: '#F4F9F6', borderRadius: radius.md, padding: 11, marginTop: 4 },
  footText: { flex: 1, fontSize: 11, color: colors.inkGrey, lineHeight: 16 },
});
