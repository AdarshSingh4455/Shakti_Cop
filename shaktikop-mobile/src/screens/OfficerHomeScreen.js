import React, { useEffect, useRef, useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { colors, radius } from '../theme/colors';
import { REJECTED_STATUS } from '../data/constants';
import { useApp } from '../context/AppContext';
import DashboardStatCard from '../components/DashboardStatCard';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// 🐛 बग फ़िक्स (SOS की सूचना चुपचाप ट्रे में पड़ी रह जाती थी): Android 8+ में हर
// सूचना किसी "channel" से होकर जाती है, और उसकी importance channel से तय होती है —
// payload से नहीं। कोई channel बनाया ही नहीं गया था, इसलिए सब कुछ Expo के डिफ़ॉल्ट
// channel से जाता, जिसकी importance DEFAULT होती है। मतलब: SOS अलर्ट ट्रे में आता,
// पर स्क्रीन पर उभरकर (heads-up) नहीं दिखता और ज़ोर से नहीं बजता। अधिकारी का फ़ोन
// जेब में हो तो उसे पता ही न चले — जबकि यही वह क्षण है जब सेकंड मायने रखते हैं।
//
// अब दो channel हैं: 'sos' (MAX importance — heads-up, आवाज़, कंपन) और 'default'।
// बैकएंड हर push में channelId भेजता है (देखें utils/push.js)।
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('sos', {
    name: 'आपातकालीन (SOS)',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#7A1836',
    sound: 'default',
    bypassDnd: true, // 'परेशान न करें' में भी बजे — आपात स्थिति में यही ज़रूरी है
  }).catch(() => {});
  Notifications.setNotificationChannelAsync('default', {
    name: 'सामान्य सूचनाएं',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  }).catch(() => {});
}

function todayRangeIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  return { start, end };
}

export default function OfficerHomeScreen({ navigation }) {
  const { user, complaints, refresh, fetchStationPerformance, fetchMyPerformance } = useApp();
  const listenerRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);
  // 🐛 बग फ़िक्स (गंभीर, उपयोगकर्ता-रिपोर्ट): कुछ अधिकारियों की बंद (निस्तारित) व
  // लंबित शिकायतें डैशबोर्ड पर नहीं दिख रही थीं — कारण: global complaints सूची
  // (जिससे यह गिनती बनती) अब सुरक्षा-कारणों से 200-row-सीमित है (पहले असीमित थी)।
  // जिस अधिकारी के पास कुल (जीवनकाल में) 200 से ज़्यादा शिकायतें जमा हो गई हों, उनकी
  // पुरानी (अक्सर पहले से बंद हो चुकी) शिकायतें सूची से बाहर हो जातीं। अब SHO के लिए
  // station-stats, और सामान्य अधिकारी (SI आदि) के लिए getMyPerformance — दोनों ही
  // पूरे (बिना-पेजिंग) COUNT(*) पर आधारित हैं।
  const [stationStats, setStationStats] = useState(null);
  const [myStats, setMyStats] = useState(null);
  const loadStationStats = React.useCallback(async () => {
    try {
      if (user?.rank === 'SHO') {
        const d = await fetchStationPerformance();
        setStationStats(d);
      } else if (user?.role === 'officer') {
        const d = await fetchMyPerformance();
        setMyStats(d);
      }
    } catch (e) {
      // चुपचाप छोड़ें — नीचे client-side अनुमान fallback के रूप में काम करेगा
    }
  }, [fetchStationPerformance, fetchMyPerformance, user?.rank, user?.role]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), loadStationStats()]);
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setRefreshing(false);
  };

  useEffect(() => {
    loadStationStats();
  }, [loadStationStats]);

  useEffect(() => {
    listenerRef.current = Notifications.addNotificationReceivedListener(() => {
      refresh();
    });
    return () => {
      if (listenerRef.current) Notifications.removeNotificationSubscription(listenerRef.current);
    };
  }, [refresh]);

  // 🐛 बग फ़िक्स: login के ठीक बाद एक क्षण के लिए role 'officer' पर स्विच हो चुका होता है
  // (इसलिए यह screen render होने लगती है) पर AppContext का user अभी async रूप से load
  // हो ही रहा होता है — उस बीच user null रहता है। नीचे कई जगह user.name/user.rank/
  // user.id सीधे इस्तेमाल होते हैं, बिना null-check के — इसलिए "Cannot read property
  // 'name' of null" crash आता था। यह guard सभी hooks के बाद है (कोई hook यहाँ के बाद
  // नहीं है), इसलिए Rules of Hooks भी नहीं टूटता।
  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.shaktiMaroon} />
      </View>
    );
  }

  // 🐛 डेटा-सटीकता बग फ़िक्स: पहले नाम (string) से मिलान होता था — `c.officer === user.name`।
  // यह अविश्वसनीय है: दो अधिकारियों का नाम मिलता-जुलता हो, बीच में extra space हो, या
  // नाम में कोई बदलाव हो तो शिकायत "अपनी" सूची से ग़ायब हो जाती (कार्ड्स पर ग़लत संख्या
  // दिखती)। अब असली officerId (backend भी यही इस्तेमाल करता है permission जांचने में)
  // से मिलान होता है — हमेशा सटीक रहेगा, नाम कुछ भी हो।
  //
  // 🐛 दूसरा बग फ़िक्स: SHO के लिए यह सिर्फ़ officerId === user.id (यानी सिर्फ़ वे मामले
  // जो उन्हें पहले से नियुक्त हैं) गिनता था। पर नई शिकायत जब तक किसी को नियुक्त न हो,
  // उसका officerId खाली ही रहता है — इसलिए "कुल शिकायतें" हमेशा 0 दिखता रहता, भले ही
  // उनके थाने में नियुक्ति के इंतज़ार में कई शिकायतें पड़ी हों (जो "नियुक्ति (SHO)" टैब
  // में सही से दिखती भी हैं)। SHO के लिए अब अपने थाने की बिना-नियुक्ति शिकायतें भी
  // इसमें जोड़ी जाती हैं — ताकि dashboard उनके पूरे कार्यभार (command view) को दिखाए,
  // न कि सिर्फ़ व्यक्तिगत रूप से नियुक्त मामलों को। सामान्य अधिकारी (SI) के लिए
  // व्यवहार पहले जैसा ही रहता है — सिर्फ़ अपने नियुक्त मामले।
  // 🐛 तीसरा बग फ़िक्स: ऊपर वाला फ़िक्स लिखे जाने के बाद, backend की listComplaints भी
  // अपडेट हुई — अब वह SHO के लिए उनके पूरे थाने की हर शिकायत भेजती है (चाहे किसी भी
  // अधिकारी को assign हो)। पर यहाँ का local filter अब भी पुरानी, ज़्यादा restrictive शर्त
  // (सिर्फ़ खुद को assign या बिना-assign) इस्तेमाल कर रहा था — इसलिए जैसे ही SHO किसी
  // मामले को अपने थाने के किसी और अधिकारी (SI) को assign करता, वह डैशबोर्ड की गिनती से
  // फिर से ग़ायब हो जाता, भले ही backend अब उसे सही से भेज रहा हो। अब backend पर भरोसा
  // करते हैं — जो भी complaints array में है, वह SHO के लिए पहले से ही उनके थाने तक
  // सही तरह scoped है, इसलिए कोई अतिरिक्त filter नहीं चाहिए।
  const mine = user.rank === 'SHO' ? complaints : complaints.filter((c) => c.officerId === user.id);
  const { start: todayStart } = todayRangeIso();

  // 🐛 बग फ़िक्स: सामान्य अधिकारी (SI) के लिए "लंबित" कार्ड हमेशा 0 दिखाता था —
  // कोई भी complaint जिसे officer_id नहीं मिला (यानी status = "दर्ज"), वह SI के
  // अपने complaints array में आ ही नहीं सकती (backend सिर्फ़ officer_id = खुद
  // वाली शिकायतें भेजता है, और officer_id सिर्फ़ "अधिकारी नियुक्त" होने पर मिलता
  // है) — यानी यह शर्त कभी सच ही नहीं हो सकती थी। SI के लिए सही मायने में
  // "लंबित" वह है जो नियुक्त तो हो चुकी पर अभी कार्यवाही शुरू नहीं हुई — यानी
  // status "अधिकारी नियुक्त"। SHO के लिए पुराना व्यवहार सही है (उनके थाने की
  // बिना-नियुक्ति शिकायतें भी दिखती हैं, "दर्ज" वहां सही मायने रखता है)।
  const pendingStatus = user.rank === 'SHO' ? 'दर्ज' : 'अधिकारी नियुक्त';

  const counts = {
    // 🐛 बग फ़िक्स: SHO ke लिए stationStats, सामान्य अधिकारी के लिए myStats — दोनों
    // सर्वर के सटीक (बिना-पेजिंग) COUNT(*) पर आधारित हैं।
    total: stationStats ? stationStats.total : myStats ? myStats.totalAssigned : mine.length,
    pending: stationStats
      ? stationStats.pending
      : myStats
      ? myStats.assigned // सामान्य अधिकारी के लिए "लंबित" = "अधिकारी नियुक्त" (myStats.assigned)
      : mine.filter((c) => c.status === pendingStatus).length,
    rejected: stationStats ? stationStats.rejected : myStats ? myStats.rejected : mine.filter((c) => c.status === REJECTED_STATUS).length,
    completed: stationStats ? stationStats.resolved : myStats ? myStats.resolved : mine.filter((c) => c.status === 'निस्तारित').length,
    today: mine.filter((c) => new Date(c.createdAt) >= new Date(todayStart)).length,
    sos: mine.filter((c) => c.sosTriggered).length,
  };

  const goToTable = (params) => navigation.navigate('OfficerTable', params);

  const initials = (user.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
    >
      <TouchableOpacity style={styles.profileRow} onPress={() => navigation.navigate('OfficerProfile')} activeOpacity={0.8}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.officerName}>{user.name}</Text>
          <Text style={styles.officerMeta}>
            {user.badgeId} · {user.rank || 'SI'} {user.station ? `· ${user.station}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
      </TouchableOpacity>

      <View style={styles.actionRow}>
        {user?.rank === 'SHO' && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('CreateOfficer')}>
            <Ionicons name="person-add-outline" size={14} color={colors.white} />
            <Text style={styles.actionBtnText} numberOfLines={2}>{tt('जांचकर्ता जोड़ें')}</Text>
          </TouchableOpacity>
        )}
        {user?.rank === 'SHO' && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('MyStationOfficers')}>
            <Ionicons name="people-outline" size={14} color={colors.white} />
            <Text style={styles.actionBtnText} numberOfLines={2}>{tt('मेरे अधिकारी')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('QRScanner')}>
          <Ionicons name="qr-code-outline" size={14} color={colors.white} />
          <Text style={styles.actionBtnText} numberOfLines={2}>{tt('QR स्कैन करें')}</Text>
        </TouchableOpacity>
        {/* 🆕 Performance Analytics — पहले सिर्फ़ कोड में मौजूद थी, कहीं से खुलती नहीं थी */}
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('OfficerPerformance')}>
          <Ionicons name="stats-chart-outline" size={14} color={colors.white} />
          <Text style={styles.actionBtnText} numberOfLines={2}>{tt('मेरा प्रदर्शन')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        <DashboardStatCard
          icon="documents"
          value={counts.total}
          label={tt('कुल शिकायतें')}
          color={colors.inkNavy}
          style={{ width: '47%' }}
          onPress={() => goToTable({})}
        />
        <DashboardStatCard
          icon="time"
          value={counts.pending}
          label={tt('लंबित')}
          color={colors.marigold}
          style={{ width: '47%' }}
          onPress={() => goToTable({ status: pendingStatus })}
        />
        <DashboardStatCard
          icon="close-circle"
          value={counts.rejected}
          label={tt('अस्वीकृत')}
          color={colors.alert}
          style={{ width: '47%' }}
          onPress={() => goToTable({ status: REJECTED_STATUS })}
        />
        <DashboardStatCard
          icon="checkmark-circle"
          value={counts.completed}
          label={tt('निस्तारित')}
          color={colors.sage}
          style={{ width: '47%' }}
          onPress={() => goToTable({ status: 'निस्तारित' })}
        />
        <DashboardStatCard
          icon="today"
          value={counts.today}
          label={tt('आज की शिकायतें')}
          color={colors.shaktiMaroon}
          style={{ width: '47%' }}
          onPress={() => goToTable({ dateFrom: todayStart })}
        />
        <DashboardStatCard
          emoji="🆘"
          value={counts.sos}
          label={tt('SOS शिकायतें')}
          color="#8B1A1A"
          style={{ width: '47%' }}
          onPress={() => navigation.navigate('OfficerSosAlerts')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  container: { flex: 1, backgroundColor: colors.sand },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 14,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.shaktiMaroon, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 18, fontWeight: '800' },
  officerName: { fontSize: 16, fontWeight: '800', color: colors.inkNavy },
  officerMeta: { fontSize: 11.5, color: colors.inkGrey, marginTop: 2 },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  actionBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.shaktiMaroon,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    minHeight: 44,
  },
  actionBtnText: { color: colors.white, fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
