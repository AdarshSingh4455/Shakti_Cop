import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, RefreshControl, AppState, Switch } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors, radius } from '../theme/colors';
import { REJECTED_STATUS } from '../data/constants';
import { useApp } from '../context/AppContext';
import DashboardStatCard from '../components/DashboardStatCard';
import { timeAgo } from '../utils/datetime';

// 🆕 Real-time Monitoring — डैशबोर्ड हर 30 सेकंड में अपने-आप ताज़ा होता है, ताकि
// नई शिकायत/SOS आते ही (मैनुअल pull-to-refresh किए बिना भी) दिख जाए। बैटरी बचाने
// के लिए यह सिर्फ़ तभी चलता है जब यह स्क्रीन खुली/सक्रिय हो (AppState + focus जांच),
// और उपयोगकर्ता चाहें तो "Live" टॉगल से बंद भी कर सकते हैं।
const AUTO_REFRESH_INTERVAL_MS = 30000;

const STATUS_CARD_DEFS = [
  { key: 'दर्ज', label: 'लंबित', icon: 'time-outline', bg: colors.marigold },
  { key: 'अधिकारी नियुक्त', label: 'नियुक्त', icon: 'person-add-outline', bg: colors.inkNavyLight },
  { key: 'कार्यवाही जारी', label: 'कार्यवाही में', icon: 'sync-outline', bg: colors.shaktiMaroon },
  { key: REJECTED_STATUS, label: 'अस्वीकृत', icon: 'close-circle-outline', bg: colors.alert },
  { key: 'निस्तारित', label: 'निस्तारित', icon: 'checkmark-circle-outline', bg: colors.sage },
];

export default function AdminHomeScreen({ navigation }) {
  const { complaints, refresh, fetchAnalyticsOverview, fetchStats, user } = useApp();
  const isFocused = useIsFocused();
  const [refreshing, setRefreshing] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // 🆕 सर्वर-सटीक आंकड़े (खासकर SOS) — पहले SOS-गिनती सिर्फ़ client-side पर 200-row-
  // सीमित complaints-सूची छानकर बनती थी। किसी बड़े दायरे (जैसे IG/DIG का पूरा Range)
  // में हाल की 200 से ज़्यादा शिकायतें हों, तो कोई पुरानी सक्रिय SOS छूट सकती थी —
  // सुरक्षा-गंभीर चूक। अब सर्वर से सही, पूरे scope का COUNT(*) आता है।
  const [stats, setStats] = useState(null);
  const loadStats = React.useCallback(async () => {
    try {
      const d = await fetchStats();
      setStats(d);
    } catch (e) {
      // चुपचाप छोड़ें — नीचे client-side गिनती fallback के रूप में काम करेगी
    }
  }, [fetchStats]);

  // 🆕 KPIs, Trends व Performance Analytics — पहले यह डेटा सिर्फ़ एक अलग,
  // navigator में कहीं भी register न हुई screen (AdminAnalyticsScreen) में था,
  // इसलिए किसी को दिखता ही नहीं था। अब पहली स्क्रीन (डैशबोर्ड) पर भी एक संक्षिप्त
  // सारांश (summary) मिलता है — पूरे विवरण के लिए नीचे "पूरा विश्लेषण देखें" बटन है।
  const [kpi, setKpi] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const loadKpi = React.useCallback(async () => {
    try {
      const d = await fetchAnalyticsOverview();
      setKpi(d);
    } catch (e) {
      // चुपचाप छोड़ें — डैशबोर्ड का बाकी हिस्सा फिर भी काम करता रहे
    }
    setKpiLoading(false);
  }, [fetchAnalyticsOverview]);

  React.useEffect(() => {
    loadKpi();
    loadStats();
  }, [loadKpi, loadStats]);

  const silentRefresh = React.useCallback(async () => {
    try {
      await Promise.all([refresh(), loadKpi(), loadStats()]);
      setLastUpdated(new Date());
    } catch (e) {
      // चुपचाप छोड़ें — अगला auto-refresh फिर कोशिश करेगा
    }
  }, [refresh, loadKpi, loadStats]);

  // Auto-refresh — सिर्फ़ तभी चले जब स्क्रीन खुली हो, ऐप background में न हो,
  // और उपयोगकर्ता ने "Live" बंद न किया हो
  React.useEffect(() => {
    if (!liveEnabled || !isFocused) return undefined;
    let appActive = AppState.currentState === 'active';
    const sub = AppState.addEventListener('change', (next) => {
      appActive = next === 'active';
    });
    const timer = setInterval(() => {
      if (appActive) silentRefresh();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [liveEnabled, isFocused, silentRefresh]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), loadKpi(), loadStats()]);
      setLastUpdated(new Date());
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setRefreshing(false);
  };

  // 🐛 बग फ़िक्स: पहले सिर्फ़ client-side पर पेजिंग-सीमित (200-row) सूची छानी जाती
  // थी — status-cards (लंबित/नियुक्त/कार्यवाही में/आदि) भी SOS जैसी ही चूक झेल
  // सकते थे। अब सर्वर के सटीक stats को प्राथमिकता।
  const STATUS_KEY_TO_STATS_FIELD = {
    दर्ज: 'pending',
    'अधिकारी नियुक्त': 'assigned',
    'कार्यवाही जारी': 'inProgress',
    निस्तारित: 'resolved',
    [REJECTED_STATUS]: 'rejected',
  };
  const countByStatus = (s) => {
    const statsField = STATUS_KEY_TO_STATS_FIELD[s];
    if (stats && statsField && stats[statsField] !== undefined) return stats[statsField];
    return complaints.filter((c) => c.status === s).length;
  };

  // SOS — सक्रिय (अभी तक सुरक्षित पहुँचने की पुष्टि नहीं, और मामला बंद न हुआ हो) व कुल
  // 🐛 बग फ़िक्स: पहले सिर्फ़ client-side पर पेजिंग-सीमित सूची छानी जाती थी — अब सर्वर
  // का सटीक COUNT(*) (stats) प्राथमिकता से इस्तेमाल होता है; वह लोड न हुआ हो तभी
  // पुराना client-side अनुमान अस्थायी रूप से दिखता है।
  const sosActive = stats ? stats.sosActive : complaints.filter(
    (c) => c.sosTriggered && !c.safeArrivalConfirmed && c.status !== 'निस्तारित' && c.status !== REJECTED_STATUS
  ).length;
  const sosTotal = stats ? stats.sosTotal : complaints.filter((c) => c.sosTriggered).length;

  // आज की शिकायतें — रिपोर्ट के लिए
  const todayComplaints = React.useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    return complaints.filter((c) => new Date(c.createdAt) >= new Date(startOfDay));
  }, [complaints]);

  // ⚠️ पूरा function try/catch में — कहीं भी कोई दिक़्क़त आए (HTML बनाने में,
  // print/share native module में) तो सिर्फ़ साफ़ चेतावनी दिखे, ऐप क्रैश न हो
  const downloadTodayReport = async () => {
    setReportBusy(true);
    try {
      const rows = todayComplaints
        .map(
          (c) =>
            `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${c.id}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${c.category || ''}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${c.status}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${c.district || ''}${c.policeStation ? ' · ' + c.policeStation : ''}</td></tr>`
        )
        .join('');
      const todayLabel = new Date().toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const html = `
        <html><body style="font-family:sans-serif;padding:24px;color:#0F2A44;">
          <h2 style="color:#7A1836;margin-bottom:0;">ShaktiCop — आज की रिपोर्ट</h2>
          <p style="color:#8A8578;font-size:12px;margin-top:4px;">${todayLabel} · कुल ${todayComplaints.length} शिकायतें</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr style="background:#F3EFE6;">
              <td style="padding:6px 10px;font-weight:700;">ID</td>
              <td style="padding:6px 10px;font-weight:700;">श्रेणी</td>
              <td style="padding:6px 10px;font-weight:700;">स्थिति</td>
              <td style="padding:6px 10px;font-weight:700;">ज़िला/थाना</td>
            </tr>
            ${rows || '<tr><td style="padding:10px;" colspan="4">आज कोई शिकायत दर्ज नहीं हुई।</td></tr>'}
          </table>
        </body></html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      const shareAvailable = await Sharing.isAvailableAsync();
      if (shareAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'आज की रिपोर्ट' });
      } else {
        Alert.alert(tt('साझा करना उपलब्ध नहीं'), tt('इस डिवाइस पर शेयर सुविधा उपलब्ध नहीं है।'));
      }
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('रिपोर्ट बनाने में समस्या आई। कृपया दोबारा कोशिश करें।'));
    }
    setReportBusy(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
    >
      <Text style={styles.pageTitle}>{tt('एडमिन डैशबोर्ड')}</Text>

      <View style={styles.liveRow}>
        <View style={styles.liveLeft}>
          <View style={[styles.liveDot, liveEnabled && styles.liveDotOn]} />
          <Text style={styles.liveText}>
            {liveEnabled ? tt('Live') : tt('रुका हुआ')} · {tt('अपडेट')}: {timeAgo(lastUpdated.toISOString())}
          </Text>
        </View>
        <View style={styles.liveRight}>
          <TouchableOpacity onPress={onPullRefresh} style={styles.liveRefreshBtn}>
            <Ionicons name="refresh" size={15} color={colors.inkNavy} />
          </TouchableOpacity>
          <Switch
            value={liveEnabled}
            onValueChange={setLiveEnabled}
            trackColor={{ true: colors.sage, false: colors.border }}
            thumbColor={colors.white}
          />
        </View>
      </View>

      {/* 🆕 दायरा-संकेत — सभी roles (DSP/ASP/SSP/IG/DIG/district_admin) को साफ़ दिखे
          कि वे किस दायरे का डेटा देख रहे हैं (पहले यह कहीं भी नहीं दिखता था) */}
      {user?.rangeDistricts && user.rangeDistricts.length > 0 ? (
        <Text style={styles.scopeNote}>📍 {tt('आपका Range')}: {user.rangeDistricts.map((d) => tt(d)).join(', ')}</Text>
      ) : user?.circleStations && user.circleStations.length > 0 ? (
        <Text style={styles.scopeNote}>📍 {tt('आपका सर्किल')}: {user.circleStations.map((s) => tt(s)).join(', ')}</Text>
      ) : user?.district && (user?.adminRole === 'district_admin' || user?.adminRole === 'monitor') ? (
        <Text style={styles.scopeNote}>📍 {tt('आपका ज़िला')}: {tt(user.district)}</Text>
      ) : null}

      <TouchableOpacity
        style={styles.totalCard}
        onPress={() => navigation.navigate('AllComplaints', { status: undefined })}
      >
        <Ionicons name="documents" size={26} color={colors.white} />
        {/* 🐛 बग फ़िक्स: यह अंक भी पहले सिर्फ़ 200-row-सीमित client-side सूची से आता था
            (वही SOS/status-cards वाली चूक) — अब सर्वर के सटीक stats.total को प्राथमिकता */}
        <Text style={styles.totalNum}>{stats ? stats.total : complaints.length}</Text>
        <Text style={styles.totalLabel}>{tt('कुल शिकायतें — सभी देखें')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.sosCard, sosActive > 0 && styles.sosCardAlert]}
        onPress={() => navigation.navigate('AdminSosAlerts')}
        activeOpacity={0.85}
      >
        <View style={styles.sosIconWrap}>
          <Ionicons name="alert-circle" size={26} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sosNum}>{sosActive}</Text>
          <Text style={styles.sosLabel}>{tt('सक्रिय SOS अलर्ट')}</Text>
          <Text style={styles.sosSub}>
            {tt('कुल')} {sosTotal} · {tt('देखने के लिए दबाएं')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.white} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.reportBtn} onPress={downloadTodayReport} disabled={reportBusy} activeOpacity={0.85}>
        <Ionicons name="download-outline" size={18} color={colors.white} />
        <Text style={styles.reportBtnText}>
          {reportBusy ? tt('रिपोर्ट बन रही है…') : tt('आज की रिपोर्ट डाउनलोड करें')}
        </Text>
      </TouchableOpacity>

      {/* 🆕 District → Station Explorer तक डैशबोर्ड से सीधी पहुंच */}
      <TouchableOpacity style={styles.explorerLinkBtn} onPress={() => navigation.navigate('DistrictExplorer')} activeOpacity={0.85}>
        <Ionicons name="map-outline" size={18} color={colors.white} />
        <Text style={styles.explorerLinkText}>{tt('ज़िला व थाना Explorer')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.white} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>{tt('स्थिति के अनुसार')}</Text>
      <View style={styles.grid}>
        {STATUS_CARD_DEFS.map((c) => (
          <DashboardStatCard
            key={c.key}
            icon={c.icon}
            value={countByStatus(c.key)}
            label={tt(c.label)}
            color={c.bg}
            style={{ width: '47%' }}
            onPress={() => navigation.navigate('AllComplaints', { status: c.key })}
          />
        ))}
      </View>

      <View style={styles.kpiHeaderRow}>
        <Text style={styles.sectionTitle}>{tt('KPIs व Trends')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AdminAnalytics')} activeOpacity={0.7} style={styles.kpiLinkBtn}>
          <Text style={styles.kpiLinkText}>{tt('पूरा विश्लेषण देखें')}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.shaktiMaroon} />
        </TouchableOpacity>
      </View>

      {kpiLoading ? (
        <View style={styles.kpiSkeleton}>
          <Ionicons name="stats-chart-outline" size={22} color={colors.inkLight} />
          <Text style={styles.kpiSkeletonText}>{tt('KPIs लोड हो रहे हैं…')}</Text>
        </View>
      ) : kpi ? (
        <>
          <View style={styles.kpiGrid}>
            <KpiCard icon="checkmark-done-outline" label={tt('निस्तारण दर')} value={`${kpi.summary.resolutionRate}%`} color={colors.sage} />
            <KpiCard icon="time-outline" label={tt('औसत निस्तारण समय')} value={kpi.summary.avgResolutionHours ? `${kpi.summary.avgResolutionHours} घं.` : '—'} color={colors.marigold} />
            <KpiCard icon="hourglass-outline" label={tt('लंबित')} value={kpi.summary.pending} color={colors.inkNavyLight} />
            <KpiCard icon="star-outline" label={tt('औसत रेटिंग')} value={kpi.summary.avgRating || '—'} color={colors.shaktiMaroon} />
          </View>

          <TouchableOpacity style={styles.leaderboardBtn} onPress={() => navigation.navigate('AdminLeaderboard')} activeOpacity={0.85}>
            <Ionicons name="trophy-outline" size={18} color={colors.white} />
            <Text style={styles.leaderboardBtnText}>{tt('अधिकारी Performance Leaderboard देखें')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.white} />
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

function KpiCard({ icon, label, value, color }) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  pageTitle: { fontSize: 19, fontWeight: '800', color: colors.inkNavy, marginBottom: 14 },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 16 },
  liveLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.inkLight },
  liveDotOn: { backgroundColor: colors.sage },
  liveText: { fontSize: 11, fontWeight: '600', color: colors.inkGrey },
  liveRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveRefreshBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  scopeNote: { fontSize: 11.5, color: colors.shaktiMaroon, fontWeight: '700', marginBottom: 10 },
  totalCard: {
    backgroundColor: colors.inkNavy,
    borderRadius: radius.lg,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  totalNum: { fontSize: 30, fontWeight: '800', color: colors.white, marginTop: 6 },
  totalLabel: { fontSize: 12.5, color: '#C9D6E4', marginTop: 2, fontWeight: '600' },
  sosCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.inkNavyLight, borderRadius: radius.lg, padding: 16, marginBottom: 20 },
  sosCardAlert: { backgroundColor: colors.alert },
  sosIconWrap: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  sosNum: { fontSize: 26, fontWeight: '800', color: colors.white },
  sosLabel: { fontSize: 13, fontWeight: '700', color: colors.white, marginTop: -2 },
  sosSub: { fontSize: 11, color: '#F0E4E4', marginTop: 3 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 10, marginTop: 4 },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.sage,
    paddingVertical: 13,
    borderRadius: radius.md,
    marginBottom: 20,
  },
  reportBtnText: { color: colors.white, fontSize: 13.5, fontWeight: '800' },
  explorerLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.inkNavy,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    marginBottom: 20,
  },
  explorerLinkText: { color: colors.white, fontSize: 13.5, fontWeight: '800', flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },

  kpiHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  kpiLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  kpiLinkText: { fontSize: 12, fontWeight: '700', color: colors.shaktiMaroon },
  kpiSkeleton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 16 },
  kpiSkeletonText: { fontSize: 12, color: colors.inkLight },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  kpiCard: { width: '47%', backgroundColor: colors.white, borderRadius: radius.md, padding: 12, borderLeftWidth: 4 },
  kpiValue: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginTop: 4 },
  kpiLabel: { fontSize: 10.5, color: colors.inkGrey, marginTop: 2 },
  leaderboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.inkNavy,
    paddingVertical: 13,
    borderRadius: radius.md,
    marginBottom: 20,
  },
  leaderboardBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
});
