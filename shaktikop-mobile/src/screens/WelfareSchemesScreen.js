import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { LoadingView } from '../components/LoadingView';
// सर्वर से न मिले तो ये दिखती हैं — Admin पैनल से बदली जा सकती हैं
const FALLBACK = [
  { section: 'welfare', icon: 'female-outline', tag: 'Financial Aid', title: 'कन्या सुमंगला योजना', description: 'बेटी की शिक्षा व स्वास्थ्य हेतु सीधा वित्तीय लाभ।', url: 'https://mksy.up.gov.in' },
  { section: 'welfare', icon: 'heart-outline', tag: 'Marriage Grant', title: 'शादी अनुदान योजना', description: 'ग़रीब परिवारों की बेटियों के विवाह हेतु आर्थिक सहायता।', url: 'https://shadianudan.upsdc.gov.in' },
  { section: 'welfare', icon: 'wallet-outline', tag: 'Widow Pension', title: 'विधवा पेंशन योजना', description: 'निराश्रित विधवा महिलाओं हेतु सामाजिक सुरक्षा व पेंशन।', url: 'https://sspy-up.gov.in' },
  { section: 'welfare', icon: 'trophy-outline', tag: 'Financial Help', title: 'रानी लक्ष्मीबाई महिला एवं बाल सम्मान कोष', description: 'संकटग्रस्त महिलाओं व बच्चों हेतु आर्थिक सहायता।', url: 'https://msk.upsdc.gov.in' },
  { section: 'welfare', icon: 'school-outline', tag: 'Education Aid', title: 'UP छात्रवृत्ति योजना', description: 'सभी वर्गों के छात्रों हेतु प्री व पोस्ट मैट्रिक छात्रवृत्ति।', url: 'https://scholarship.up.gov.in' },
  { section: 'support', icon: 'chatbubble-ellipses-outline', tag: 'Confidential', title: 'काउंसलिंग सहायता', description: 'लाइसेंस-प्राप्त मनोवैज्ञानिक विशेषज्ञों से मुफ़्त काउंसलिंग।', url: 'https://msk.upsdc.gov.in' },
  { section: 'support', icon: 'hammer-outline', tag: 'Free Assistance', title: 'कानूनी सहायता (Legal Aid)', description: 'घरेलू हिंसा व सुरक्षा नियमों पर मुफ़्त वकील रेफ़रल।', url: 'https://nalsa.gov.in' },
  { section: 'support', icon: 'school-outline', tag: 'Vocational Training', title: 'जन शिक्षण संस्थान', description: 'महिलाओं हेतु मुफ़्त कौशल प्रशिक्षण व प्रमाणपत्र।', url: 'https://msk.upsdc.gov.in' },
  { section: 'support', icon: 'fitness-outline', tag: 'Workshops', title: 'आत्मरक्षा प्रशिक्षण', description: 'मुफ़्त सुरक्षा कार्यशालाएं व आत्मरक्षा प्रमाणीकरण।', url: 'https://msk.upsdc.gov.in' },
];

export default function WelfareSchemesScreen({ navigation }) {
  const { fetchPublicWelfare } = useApp();
  const [items, setItems] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    try {
      const data = await fetchPublicWelfare();
      if (Array.isArray(data) && data.length > 0) setItems(data);
    } catch (e) {
      // सर्वर न मिले तो fallback सूची दिखती रहेगी
    }
    setLoading(false);
    setRefreshing(false);
  }, [fetchPublicWelfare]);

  useEffect(() => {
    load();
  }, [load]);

  const open = (url) => {
    if (!url) return Alert.alert(tt('नहीं मिला'), tt('इस योजना का लिंक उपलब्ध नहीं है।'));
    Linking.openURL(url).catch(() => Alert.alert(tt('त्रुटि'), tt('पेज नहीं खुल सका।')));
  };

  const q = search.trim().toLowerCase();
  // ⚠️ अब सिर्फ़ "कल्याणकारी योजनाएं" — "सहायता सेवाएं" टैब हटा दिया गया है
  // (वह सेवा Home स्क्रीन के "सहायता एवं कानूनी सेवाएं" सेक्शन से पहले ही हट चुकी है)
  const visible = items
    .filter((i) => (i.section || 'welfare') === 'welfare')
    .filter((i) => !q || (i.title || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));


  if (loading) {
    return (
      <LoadingView />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headCard}>
        <Ionicons name="gift-outline" size={26} color={colors.white} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headTitle}>{tt('कल्याणकारी योजनाएं')}</Text>
          <Text style={styles.headSub}>{tt('मिशन शक्ति — महिलाओं व बच्चों के लिए सरकारी योजनाएं')}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.inkLight} />
        <TextInput
          style={styles.searchInput}
          placeholder={tt('योजना खोजें…')}
          value={search}
          onChangeText={setSearch}
          maxLength={100}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.inkLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
            tintColor={colors.shaktiMaroon}
            colors={[colors.shaktiMaroon]}
          />
        }
      >
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={36} color={colors.inkLight} />
            <Text style={styles.emptyText}>{tt('इस खोज में कोई योजना नहीं मिली।')}</Text>
          </View>
        ) : (
          visible.map((s) => (
            <TouchableOpacity
              key={s.title}
              style={styles.card}
              onPress={() => open(s.url)}
              activeOpacity={0.85}
            >
              <View style={styles.cardIconBox}>
                <Ionicons name={s.icon || 'document-text-outline'} size={22} color={colors.shaktiMaroon} />
              </View>
              <View style={{ flex: 1 }}>
                {s.tag ? (
                  <View style={styles.tagPill}>
                    <Text style={styles.tagText}>{tt(s.tag)}</Text>
                  </View>
                ) : null}
                <Text style={styles.cardTitle}>{tt(s.title)}</Text>
                <Text style={styles.cardDesc}>{tt(s.description || s.desc || '')}</Text>
                <View style={styles.proceedRow}>
                  <Text style={styles.proceedText}>{tt('पोर्टल खोलें')}</Text>
                  <Ionicons name="open-outline" size={13} color={colors.shaktiMaroon} />
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  headCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.shaktiMaroon, padding: 15, margin: 14, marginBottom: 10, borderRadius: radius.lg },
  headEmoji: { fontSize: 24 },
  headTitle: { fontSize: 16, fontWeight: '800', color: colors.white },
  headSub: { fontSize: 11.5, color: '#F0DCE2', marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, marginHorizontal: 14, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 13, color: colors.inkNavy, padding: 0 },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginTop: 10 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.inkNavy, borderColor: colors.inkNavy },
  tabText: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey },
  tabTextActive: { color: colors.white },
  card: { flexDirection: 'row', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  cardIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  cardHighlight: { borderColor: colors.shaktiMaroon, borderWidth: 1.5, backgroundColor: '#FFF9FB' },
  tagPill: { alignSelf: 'flex-start', backgroundColor: colors.shaktiMaroonWash, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4 },
  tagText: { fontSize: 9.5, fontWeight: '800', color: colors.shaktiMaroon, letterSpacing: 0.3 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.inkNavy },
  cardDesc: { fontSize: 11.5, color: colors.inkGrey, lineHeight: 16, marginTop: 3 },
  proceedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  proceedText: { fontSize: 12, fontWeight: '800', color: colors.shaktiMaroon },
  empty: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { fontSize: 13, color: colors.inkGrey, marginTop: 10 },
});
