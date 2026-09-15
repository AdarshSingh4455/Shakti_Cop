import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePreventScreenshot } from '../hooks/usePreventScreenshot';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Linking,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { REJECTED_STATUS } from '../data/constants';
import { useApp } from '../context/AppContext';
import LiveLocationStatus from '../components/LiveLocationStatus';
import { timeAgo } from '../utils/datetime';

import { SkeletonList, LoadingView } from '../components/LoadingView';

function minutesSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

// सक्रिय SOS का लाल बिंदु धीरे-धीरे झपकता है — नज़र तुरंत जाए
function PulsingDot() {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[styles.liveDot, { opacity: pulse }]} />;
}

export default function SosAlertsScreen({ navigation }) {
  // 🔒 आपातकालीन पीड़िताओं का डेटा — स्क्रीनशॉट रोकना ज़रूरी
  usePreventScreenshot();
  const { queryComplaints } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState([]);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await queryComplaints({ sosOnly: true, sort: 'newest' });
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      // चुपचाप — पुरानी सूची दिखती रहे
    }
    setLoading(false);
    setRefreshing(false);
  }, [queryComplaints]);

  useEffect(() => {
    load();
  }, [load]);

  // 🔴 लाइव — स्क्रीन खुली रहने तक हर 15 सेकंड में अपने-आप ताज़ा।
  // SOS आपात स्थिति है, इसलिए यहाँ बाकी स्क्रीनों से तेज़ रखा गया है।
  useEffect(() => {
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [load]);

  // 🐛 बग फ़िक्स: "अस्वीकृत" (मामला बंद) होने पर भी SOS "सक्रिय" गिना जाता था —
  // यह screen खुद SOS प्रबंधन के लिए मुख्य है, इसलिए यहां सही होना सबसे ज़्यादा ज़रूरी।
  const isActive = (c) => c.sosTriggered && !c.safeArrivalConfirmed && c.status !== 'निस्तारित' && c.status !== REJECTED_STATUS;

  // ⚠️ बग फ़िक्स: पहले "निपटाए गए" (resolved) में हर वो शिकायत आ जाती थी जो
  // active नहीं थी — यानी अगर sosTriggered ही false हो (कभी SOS था ही नहीं) तो
  // भी वह "resolved" में दिख जाती थी। अब सिर्फ़ वही शिकायतें यहाँ आएँगी जो सच में
  // SOS ट्रिगर हुई थीं और अब सुरक्षित/निस्तारित हो चुकी हैं।
  const active = list.filter(isActive);
  const resolved = list.filter((c) => c.sosTriggered && !isActive(c));

  // सबसे पुराना अनुत्तरित SOS सबसे ऊपर — जितनी देर हुई, उतना ज़रूरी
  const sortedActive = [...active].sort(
    (a, b) => new Date(a.sosTriggeredAt || 0) - new Date(b.sosTriggeredAt || 0)
  );

  const critical = active.filter((c) => minutesSince(c.sosTriggeredAt) >= 15).length;

  const callVictim = (mobile) => {
    if (!mobile) return Alert.alert(tt('नहीं मिला'), tt('इस शिकायत में मोबाइल नंबर नहीं है।'));
    Linking.openURL(`tel:${mobile}`).catch(() =>
      Alert.alert(tt('त्रुटि'), tt('डायलर नहीं खोला जा सका।'))
    );
  };

  const openDirections = (c) => {
    const lat = c.liveLat || c.latitude;
    const lng = c.liveLng || c.longitude;
    if (!lat || !lng) return Alert.alert(tt('नहीं मिला'), tt('इस शिकायत में लोकेशन नहीं है।'));
    // 🔒 पहले यहाँ शिकायत-ID label के रूप में जाती थी। geo: खोलने पर वह label फ़ोन के
    // नक़्शा-ऐप को मिलता है, और Google Maps उसे search की तरह दर्ज कर लेता है — यानी
    // अधिकारी हर SOS खोले, तो एक केस-पहचान उसके Google इतिहास व Google के सर्वर तक
    // पहुँच जाती। पिन को पहचानने का काम "SOS" से भी उतना ही हो जाता है, और कोई
    // केस-संदर्भ बाहर नहीं जाता।
    const url = `geo:${lat},${lng}?q=${lat},${lng}(SOS)`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`).catch(() =>
        Alert.alert(tt('त्रुटि'), tt('नक्शा ऐप नहीं खुल सका।'))
      );
    });
  };

  const renderCard = ({ item }) => {
    const act = isActive(item);
    const mins = minutesSince(item.sosTriggeredAt);
    const isCritical = act && mins >= 15;
    return (
      <TouchableOpacity
        style={[styles.card, act && styles.cardActive, isCritical && styles.cardCritical]}
        onPress={() => navigation.navigate('ComplaintDetail', { id: item.id })}
        activeOpacity={0.85}
      >
        <View style={styles.cardHead}>
          {act && <PulsingDot />}
          <Text style={[styles.cardId, act && { color: colors.alert }]}>{item.id}</Text>
          <View style={[styles.badge, { backgroundColor: act ? colors.alert : colors.sage }]}>
            <Text style={styles.badgeText}>
              {act ? tt('सक्रिय SOS') : item.safeArrivalConfirmed ? tt('सुरक्षित पहुँचे') : tt('बंद')}
            </Text>
          </View>
        </View>

        <Text style={styles.victim} numberOfLines={1}>
          {item.isAnonymous ? tt('गुमनाम शिकायत') : item.victimName || item.citizenName}
        </Text>

        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={12} color={colors.inkLight} />
          <Text style={styles.metaText} numberOfLines={1}>
            {[item.policeStation, item.district].filter(Boolean).map(tt).join(', ') || tt('स्थान उपलब्ध नहीं')}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={12} color={isCritical ? colors.alert : colors.inkLight} />
          <Text style={[styles.metaText, isCritical && styles.metaCritical]}>
            {timeAgo(item.sosTriggeredAt)}
            {isCritical ? ` — ${tt('तुरंत ध्यान दें')}` : ''}
          </Text>
        </View>
        <LiveLocationStatus complaint={item} compact />

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => callVictim(item.victimMobile || item.citizenMobile)}>
            <Ionicons name="call" size={14} color={colors.white} />
            <Text style={styles.actionText}>{tt('कॉल करें')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={() => openDirections(item)}>
            <Ionicons name="navigate" size={14} color={colors.inkNavy} />
            <Text style={[styles.actionText, { color: colors.inkNavy }]}>{tt('रास्ता')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SkeletonList rows={6} />
    );
  }

  const data = showResolved ? resolved : sortedActive;

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: active.length > 0 ? colors.alert : colors.sage }]}>
          <Ionicons name="alert-circle" size={20} color={colors.white} />
          <Text style={styles.summaryNum}>{active.length}</Text>
          <Text style={styles.summaryLabel}>{tt('सक्रिय SOS')}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: critical > 0 ? '#8C1A0F' : colors.inkNavy }]}>
          <Ionicons name="hourglass" size={20} color={colors.white} />
          <Text style={styles.summaryNum}>{critical}</Text>
          <Text style={styles.summaryLabel}>{tt('15+ मिनट से लंबित')}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.inkNavyLight }]}>
          <Ionicons name="checkmark-done" size={20} color={colors.white} />
          <Text style={styles.summaryNum}>{resolved.length}</Text>
          <Text style={styles.summaryLabel}>{tt('निपटाए गए')}</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, !showResolved && styles.tabActive]}
          onPress={() => setShowResolved(false)}
        >
          <Text style={[styles.tabText, !showResolved && styles.tabTextActive]}>
            {tt('सक्रिय')} ({active.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, showResolved && styles.tabActive]}
          onPress={() => setShowResolved(true)}
        >
          <Text style={[styles.tabText, showResolved && styles.tabTextActive]}>
            {tt('निपटाए गए')} ({resolved.length})
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.liveNote}>{tt('यह सूची हर 15 सेकंड में अपने-आप ताज़ा होती है')}</Text>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
            tintColor={colors.alert}
            colors={[colors.alert]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={showResolved ? 'file-tray-outline' : 'shield-checkmark-outline'} size={40} color={colors.sage} />
            <Text style={styles.emptyText}>
              {showResolved ? tt('कोई निपटाया गया SOS नहीं।') : tt('अभी कोई सक्रिय SOS नहीं — सब कुशल है।')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  summaryRow: { flexDirection: 'row', gap: 8, padding: 12 },
  summaryCard: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  summaryNum: { fontSize: 22, fontWeight: '800', color: colors.white, marginTop: 4 },
  summaryLabel: { fontSize: 10, color: '#F0E8E4', fontWeight: '600', textAlign: 'center', marginTop: 2 },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.inkNavy, borderColor: colors.inkNavy },
  tabText: { fontSize: 12.5, fontWeight: '700', color: colors.inkGrey },
  tabTextActive: { color: colors.white },
  liveNote: { fontSize: 10.5, color: colors.inkLight, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
  list: { padding: 12, paddingBottom: 40 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 13, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: colors.border },
  cardActive: { borderLeftColor: colors.alert },
  cardCritical: { borderLeftColor: '#8C1A0F', backgroundColor: '#FFF6F4' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.alert },
  cardId: { flex: 1, fontSize: 12.5, fontWeight: '800', color: colors.inkNavy },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  victim: { fontSize: 14, fontWeight: '700', color: colors.inkNavy, marginTop: 7 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  metaText: { fontSize: 11.5, color: colors.inkLight, flex: 1 },
  metaCritical: { color: colors.alert, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 11 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.alert, paddingVertical: 8, borderRadius: radius.md },
  actionBtnAlt: { backgroundColor: colors.sand, borderWidth: 1, borderColor: colors.border },
  actionText: { fontSize: 12, fontWeight: '700', color: colors.white },
  empty: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { fontSize: 13, color: colors.inkGrey, marginTop: 10, textAlign: 'center', paddingHorizontal: 30 },
});
