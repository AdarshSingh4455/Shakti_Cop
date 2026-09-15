import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Animated, LayoutAnimation, Platform, UIManager, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { REJECTED_STATUS } from '../data/constants';
import { useApp } from '../context/AppContext';
import { useLocale, tt } from '../context/LocaleContext';
import ComplaintCard from '../components/ComplaintCard';
import ShieldIcon from '../components/ShieldIcon';
import DashboardStatCard from '../components/DashboardStatCard';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CARD_DEFS = [
  { key: 'all', label: 'कुल शिकायतें', icon: 'documents-outline', color: colors.inkNavy },
  { key: 'दर्ज', label: 'लंबित', icon: 'time-outline', color: colors.marigold },
  { key: REJECTED_STATUS, label: 'अस्वीकृत', icon: 'close-circle-outline', color: colors.alert },
  { key: 'निस्तारित', label: 'निस्तारित', icon: 'checkmark-circle-outline', color: colors.sage },
];

export default function CitizenHomeScreen({ navigation, route }) {
  const { user, complaints, offlineQueue, syncing, syncOfflineQueue, refresh, failedOfflineComplaints, clearFailedOfflineComplaints } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (e) {
      // चुपचाप छोड़ें — अगला pull फिर कोशिश कर सकता है
    }
    setRefreshing(false);
  };
  const { t } = useLocale();
  const [filter, setFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState(route.params?.category || 'सभी');
  const [sort, setSort] = useState('newest');
  const [showSort, setShowSort] = useState(false);

  // साइड पैनल (drawer) से किसी श्रेणी पर टैप करने पर यहाँ अपने-आप अपडेट हो जाए
  useEffect(() => {
    if (route.params?.category) setCategoryFilter(route.params.category);
  }, [route.params?.category]);

  // 🐛 डेटा-सटीकता: मोबाइल नंबर से मिलान की जगह असली citizenId से मिलान — ज़्यादा
  // भरोसेमंद (मोबाइल नंबर में स्पेस/फॉर्मेट के अंतर से complaint "अपनी सूची" से ग़ायब
  // हो सकती थी)
  const mine = useMemo(
    () => complaints.filter((c) => c.citizenId === user?.id),
    [complaints, user?.id]
  );

  // 🐛 बग फ़िक्स: पहले ये गिनतियां हमेशा पूरी सूची (mine) से बनती थीं, जबकि नीचे
  // दिखने वाली सूची साइड-पैनल से चुनी गई श्रेणी (categoryFilter) पर छनती थी। नतीजा:
  // drawer से कोई श्रेणी चुनते ही कार्ड और सूची के आंकड़े मेल ही नहीं खाते — कार्ड
  // पर "कुल 10" दिखता, पर नीचे सिर्फ़ 2 शिकायतें। अब गिनती भी उसी चुनी हुई श्रेणी
  // के दायरे में होती है, इसलिए कार्ड ठीक वही बताते हैं जो नीचे दिख रहा है।
  const categoryScoped = useMemo(
    () => (categoryFilter === 'सभी' ? mine : mine.filter((c) => c.category === categoryFilter)),
    [mine, categoryFilter]
  );

  const counts = useMemo(
    () => ({
      all: categoryScoped.length,
      'दर्ज': categoryScoped.filter((c) => c.status === 'दर्ज').length,
      [REJECTED_STATUS]: categoryScoped.filter((c) => c.status === REJECTED_STATUS).length,
      'निस्तारित': categoryScoped.filter((c) => c.status === 'निस्तारित').length,
    }),
    [categoryScoped]
  );

  // मेरे SOS — सक्रिय (सुरक्षित पहुँचने की पुष्टि बाकी, और मामला अभी बंद न हुआ हो) और कुल
  // 🐛 बग फ़िक्स: पहले सिर्फ़ "निस्तारित" जांचा जाता था — अगर कोई SOS-वाली शिकायत
  // "अस्वीकृत" हो जाए (मामला बंद), तब भी SOS "सक्रिय" दिखता रहता, जो ग़लत संकेत देता।
  // ⚠️ यह जान-बूझकर पूरी सूची (mine) पर ही रहता है, श्रेणी-फ़िल्टर पर नहीं — किसी और
  // श्रेणी की सक्रिय SOS को फ़िल्टर की वजह से छुपाना सुरक्षा के लिहाज़ से ग़लत होगा।
  const mySosActive = mine.filter(
    (x) => x.sosTriggered && !x.safeArrivalConfirmed && x.status !== 'निस्तारित' && x.status !== REJECTED_STATUS
  ).length;
  const mySosTotal = mine.filter((x) => x.sosTriggered).length;

  const filtered = useMemo(() => {
    let list = filter === 'all' ? categoryScoped : categoryScoped.filter((c) => c.status === filter);
    list = list.slice().sort((a, b) => {
      const diff = new Date(a.createdAt) - new Date(b.createdAt);
      return sort === 'newest' ? -diff : diff;
    });
    return list;
  }, [categoryScoped, filter, sort]);

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
        renderItem={({ item }) => (
          <ComplaintCard complaint={item} onPress={() => navigation.navigate('ComplaintDetail', { id: item.id })} />
        )}
        ListHeaderComponent={
          <>
            <Text style={styles.h2}>{t('नमस्ते,')} {user?.name?.split(' ')[0] || ''}</Text>

            {offlineQueue.length > 0 && (
              <TouchableOpacity style={styles.offlineBanner} onPress={syncOfflineQueue} disabled={syncing}>
                <Ionicons name="cloud-offline-outline" size={18} color={colors.white} />
                <Text style={styles.offlineBannerText}>
                  {syncing
                    ? t('भेजी जा रही हैं…')
                    : `${offlineQueue.length} ${t('शिकायतें इंटरनेट का इंतज़ार कर रही हैं — दोबारा भेजने के लिए टैप करें')}`}
                </Text>
              </TouchableOpacity>
            )}

            {/* 🆕 वे शिकायतें जो सर्वर ने स्थायी रूप से अस्वीकार कर दीं। पहले ऐसी शिकायत
                चुपचाप हमेशा कतार में पड़ी रहती और पीड़िता को लगता कि वह "भेजी जा रही है" —
                जबकि असल में वह कभी पहुँचती ही नहीं। अब साफ़ बताया जाता है कि यह नहीं गई
                और दोबारा दर्ज करनी होगी। */}
            {failedOfflineComplaints?.length > 0 && (
              <TouchableOpacity
                style={styles.failedBanner}
                onPress={() => {
                  Alert.alert(
                    tt('ये शिकायतें नहीं भेजी जा सकीं'),
                    `${failedOfflineComplaints.map((f) => `• ${f.error || tt('सर्वर ने स्वीकार नहीं किया')}`).join('\n')}\n\n${tt('कृपया इन्हें दोबारा दर्ज करें।')}`,
                    [
                      { text: tt('रद्द करें'), style: 'cancel' },
                      { text: tt('समझ गई'), onPress: clearFailedOfflineComplaints },
                    ]
                  );
                }}
              >
                <Ionicons name="alert-circle-outline" size={18} color={colors.white} />
                <Text style={styles.offlineBannerText}>
                  {failedOfflineComplaints.length} {tt('शिकायतें नहीं भेजी जा सकीं — विवरण देखने के लिए टैप करें')}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.statGrid}>
              {CARD_DEFS.map((c) => (
                <DashboardStatCard
                  key={c.key}
                  icon={c.icon}
                  value={counts[c.key]}
                  label={t(c.label)}
                  color={c.color}
                  active={filter === c.key}
                  style={{ width: '47%' }}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setFilter(c.key);
                  }}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.sosBanner, mySosActive > 0 && styles.sosBannerAlert]}
              onPress={() => navigation.navigate('CitizenSosAlerts')}
              activeOpacity={0.85}
            >
              <Text style={styles.sosBannerEmoji}>🆘</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sosBannerTitle}>
                  {mySosActive > 0 ? t('आपका SOS सक्रिय है') : t('मेरे SOS अलर्ट')}
                </Text>
                <Text style={styles.sosBannerSub}>
                  {mySosActive > 0
                    ? t('पुलिस को सूचना भेजी जा चुकी है — स्थिति देखने के लिए दबाएं')
                    : `${mySosTotal} ${t('अब तक भेजे गए · देखने के लिए दबाएं')}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.white} />
            </TouchableOpacity>

            <View style={styles.filterBar}>
              {categoryFilter !== 'सभी' ? (
                <TouchableOpacity style={styles.activeFilterChip} onPress={() => setCategoryFilter('सभी')}>
                  <Ionicons name="funnel" size={12} color={colors.white} />
                  <Text style={styles.activeFilterText} numberOfLines={1}>{t(categoryFilter)}</Text>
                  <Ionicons name="close-circle" size={14} color={colors.white} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.openMenuChip} onPress={() => navigation.openDrawer()}>
                  <Ionicons name="menu" size={13} color={colors.inkNavy} />
                  <Text style={styles.openMenuChipText}>{t('श्रेणी अनुसार देखें')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSort((s) => !s)}>
                <Ionicons name="swap-vertical-outline" size={14} color={colors.inkNavy} />
                <Text style={styles.sortBtnText}>{sort === 'newest' ? t('नई पहले') : t('पुरानी पहले')}</Text>
              </TouchableOpacity>
            </View>

            {showSort && (
              <View style={styles.sortPanel}>
                <TouchableOpacity style={styles.sortOption} onPress={() => { setSort('newest'); setShowSort(false); }}>
                  <Ionicons name={sort === 'newest' ? 'radio-button-on' : 'radio-button-off'} size={16} color={colors.shaktiMaroon} />
                  <Text style={styles.sortOptionText}>{t('सबसे नई पहले')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sortOption} onPress={() => { setSort('oldest'); setShowSort(false); }}>
                  <Ionicons name={sort === 'oldest' ? 'radio-button-on' : 'radio-button-off'} size={16} color={colors.shaktiMaroon} />
                  <Text style={styles.sortOptionText}>{t('सबसे पुरानी पहले')}</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.listTitle}>
              {filter === 'all' ? t('सभी शिकायतें') : t(CARD_DEFS.find((c) => c.key === filter)?.label)} ({filtered.length})
            </Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <ShieldIcon size={44} color={colors.border} filled />
            {mine.length === 0 ? (
              <>
                <Text style={styles.emptyTitle}>{t('अभी तक कोई शिकायत दर्ज नहीं की')}</Text>
                <Text style={styles.emptySub}>{t('कोई समस्या हो तो होम स्क्रीन से "शिकायत दर्ज करें" पर टैप करें — हम आपके साथ हैं।')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>{t('इस फ़िल्टर में कोई शिकायत नहीं')}</Text>
                <Text style={styles.emptySub}>{t('ऊपर से "सभी शिकायतें" चुनकर देखें, या कोई अलग फ़िल्टर आज़माएं।')}</Text>
              </>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  list: { padding: 16, paddingBottom: 90 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.inkNavy, marginBottom: 12 },
  sosBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inkNavy, borderRadius: radius.md, padding: 13, marginBottom: 12 },
  sosBannerAlert: { backgroundColor: colors.alert },
  sosBannerEmoji: { fontSize: 22 },
  sosBannerTitle: { fontSize: 13.5, fontWeight: '800', color: colors.white },
  sosBannerSub: { fontSize: 11, color: '#EFE3E6', marginTop: 2 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.marigold, borderRadius: radius.md, padding: 12, marginBottom: 14 },
  failedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.alert, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
  offlineBannerText: { flex: 1, color: colors.white, fontSize: 12, fontWeight: '700', lineHeight: 16 },

  filterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  activeFilterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.shaktiMaroon, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '60%' },
  activeFilterText: { fontSize: 11, fontWeight: '700', color: colors.white, flexShrink: 1 },
  openMenuChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  openMenuChipText: { fontSize: 11, fontWeight: '700', color: colors.inkNavy },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  sortBtnText: { fontSize: 11, fontWeight: '700', color: colors.inkNavy },
  sortPanel: { backgroundColor: colors.white, borderRadius: radius.md, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  sortOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  sortOptionText: { fontSize: 12.5, color: colors.inkNavy },

  listTitle: { fontSize: 14, fontWeight: '700', color: colors.inkNavy, marginBottom: 10, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.inkNavy, marginTop: 14, marginBottom: 6 },
  emptySub: { fontSize: 13, color: colors.inkLight, textAlign: 'center', lineHeight: 19 },
});
