import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { usePreventScreenshot } from '../hooks/usePreventScreenshot';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { formatDateTime } from '../utils/datetime';

// ============================================================
// काउंसलर/प्रशिक्षक डैशबोर्ड — सिर्फ़ अपनी अपॉइंटमेंट्स दिखती हैं (counsellor_id
// से मिलान होता है, नाम से नहीं — इसलिए हमेशा सही सूची)। यहीं से उपस्थिति भी
// मार्क कर सकते हैं। तारीख़/समय बदलना (reschedule) यहाँ से नहीं होता — वह SHO/DSP+
// का काम है (ServiceRequestsManagementScreen में)।
// ============================================================

export default function CounsellorHomeScreen({ navigation }) {
  // 🔒 काउंसलर को पीड़िता का नाम व मोबाइल दिखते हैं (संपर्क करने के लिए ज़रूरी) —
  // बाक़ी संवेदनशील स्क्रीनों की तरह यहाँ भी screenshot/recording रोकी जाती है
  usePreventScreenshot();
  const { user, mySessions, refreshMySessions, updateMySession } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshMySessions();
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setRefreshing(false);
  };

  // 🐛 बग फ़िक्स: पहले मोबाइल नंबर सिर्फ़ plain text था, tap करने पर कुछ नहीं होता था —
  // काउंसलर को नंबर manually डायल करना पड़ता। अब सीधे call/SMS/WhatsApp खुलते हैं।
  const callCitizen = (mobile) => {
    Linking.openURL(`tel:${mobile}`).catch(() => Alert.alert(tt('त्रुटि'), tt('डायलर नहीं खोला जा सका।')));
  };
  // 🔒 सुरक्षा सुधार: पहले तैयार-संदेश में साफ़ लिखा होता था "ShaktiCop काउंसलिंग सत्र
  // के संबंध में"। घरेलू-हिंसा के मामलों में आरोपी के पास अक्सर पीड़िता का फ़ोन होता
  // है — ऐसा संदेश lock-screen की झलक या चैट-सूची में दिख जाए, तो यह बात खुल जाती है
  // कि उसने पुलिस से संपर्क किया है। यही वह जोखिम है जिससे बचाने के लिए ऐप में
  // screenshot-रोक जैसी सुविधाएं रखी गई हैं।
  //
  // अब संदेश तटस्थ है — न ऐप का नाम, न "काउंसलिंग" शब्द। काउंसलर को संदर्भ पता ही
  // होता है; संदेश में उसे लिखना ज़रूरी नहीं।
  const neutralMessage = (name) =>
    encodeURIComponent(tt(`नमस्ते ${name || ''}, मैं आपसे बात करना चाहता/चाहती हूँ। आपको कब सुविधा होगी?`).trim());

  const smsCitizen = (mobile, name) => {
    Linking.openURL(`sms:${mobile}?body=${neutralMessage(name)}`).catch(() => Alert.alert(tt('त्रुटि'), tt('SMS ऐप नहीं खोला जा सका।')));
  };
  const whatsappCitizen = (mobile, name) => {
    const cleaned = String(mobile).replace(/\D/g, '');
    const withCode = cleaned.length === 10 ? `91${cleaned}` : cleaned;
    Linking.openURL(`https://wa.me/${withCode}?text=${neutralMessage(name)}`).catch(() =>
      Alert.alert(tt('त्रुटि'), tt('WhatsApp नहीं खुल सका — क्या यह डिवाइस पर इंस्टॉल है?'))
    );
  };

  const upcoming = mySessions.filter((s) => s.status === 'सत्र निर्धारित');
  const completed = mySessions.filter((s) => s.status === 'पूर्ण');

  const markAttendance = async (item, attendance) => {
    setBusyId(item.id);
    try {
      await updateMySession(item.id, { attendance });
      Alert.alert(tt('सुरक्षित हुआ'), attendance === 'उपस्थित' ? tt('उपस्थिति दर्ज हो गई।') : tt('अनुपस्थिति दर्ज हो गई।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusyId(null);
  };

  const initials = (user?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
      data={upcoming}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <>
          <TouchableOpacity style={styles.profileRow} onPress={() => navigation.navigate('CounsellorProfile')} activeOpacity={0.8}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name}</Text>
              <Text style={styles.meta}>
                {user?.designation || tt('काउंसलर')}
                {user?.district ? ` · ${user.district}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
          </TouchableOpacity>

          <View style={styles.statRow}>
            <View style={[styles.statCard, { backgroundColor: colors.sage }]}>
              <Text style={styles.statNum}>{upcoming.length}</Text>
              <Text style={styles.statLabel}>{tt('आगामी सत्र')}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.inkNavy }]}>
              <Text style={styles.statNum}>{completed.length}</Text>
              <Text style={styles.statLabel}>{tt('पूर्ण सत्र')}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>{tt('आगामी अपॉइंटमेंट्स')}</Text>
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardType}>{tt(item.type)}</Text>
          </View>
          {item.scheduledAt ? (
            <View style={styles.rowGap}>
              <Ionicons name="calendar-outline" size={14} color={colors.inkGrey} />
              <Text style={styles.cardMeta}>{formatDateTime(item.scheduledAt)}</Text>
            </View>
          ) : null}
          {item.venue ? (
            <View style={styles.rowGap}>
              <Ionicons name="location-outline" size={14} color={colors.inkGrey} />
              <Text style={styles.cardMeta}>{item.venue}</Text>
            </View>
          ) : null}
          {item.mobile ? (
            <View style={styles.contactRow}>
              <View style={[styles.rowGap, { flex: 1 }]}>
                <Ionicons name="call-outline" size={14} color={colors.inkGrey} />
                <Text style={styles.cardMeta}>{item.mobile}</Text>
              </View>
              <TouchableOpacity style={styles.contactBtn} onPress={() => callCitizen(item.mobile)}>
                <Ionicons name="call" size={16} color={colors.sage} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactBtn} onPress={() => smsCitizen(item.mobile, item.name)}>
                <Ionicons name="chatbubble-outline" size={16} color={colors.shaktiMaroon} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactBtn} onPress={() => whatsappCitizen(item.mobile, item.name)}>
                <Ionicons name="logo-whatsapp" size={17} color="#25D366" />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.attendanceRow}>
            <TouchableOpacity
              style={[styles.attendBtn, { backgroundColor: colors.sage }]}
              onPress={() => markAttendance(item, 'उपस्थित')}
              disabled={busyId === item.id}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color={colors.white} />
              <Text style={styles.attendBtnText}>{tt('उपस्थित')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attendBtn, { backgroundColor: colors.alert }]}
              onPress={() => markAttendance(item, 'अनुपस्थित')}
              disabled={busyId === item.id}
            >
              <Ionicons name="close-circle-outline" size={15} color={colors.white} />
              <Text style={styles.attendBtnText}>{tt('अनुपस्थित')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyBox}>
          <Ionicons name="calendar-outline" size={40} color={colors.border} />
          <Text style={styles.emptyText}>{tt('अभी कोई आगामी अपॉइंटमेंट नहीं है।')}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
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
  name: { fontSize: 16, fontWeight: '800', color: colors.inkNavy },
  meta: { fontSize: 11.5, color: colors.inkGrey, marginTop: 2 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  statCard: { flex: 1, borderRadius: radius.lg, padding: 16, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800', color: colors.white },
  statLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.9)', marginTop: 3, fontWeight: '600' },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 10 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardName: { fontSize: 14, fontWeight: '700', color: colors.inkNavy },
  cardType: { fontSize: 10.5, fontWeight: '700', color: colors.shaktiMaroon },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  cardMeta: { fontSize: 12, color: colors.inkGrey },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  contactBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  attendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: radius.sm },
  attendBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  emptyBox: { alignItems: 'center', marginTop: 40 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 10 },
});
