import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { useApp } from '../context/AppContext';

import { formatDateTime } from '../utils/datetime';
import { SkeletonList } from '../components/LoadingView';
import EmptyState from '../components/EmptyState';
const ACTIONS = [
  '', 'login', 'signup', 'complaint_created', 'complaint_assigned', 'status_updated',
  'complaint_transferred', 'complaint_viewed', 'sos_triggered', 'field_visit_checkin',
  'priority_updated', 'resolution_verified', 'complaint_marked_duplicate',
  'officer_created', 'officer_activated', 'officer_deactivated', 'officer_deleted',
  'officer_rank_updated', 'officers_bulk_imported', 'sho_created', 'si_created_by_sho',
  'admin_account_created', 'backup_requested', 'broadcast_sent',
];
const ACTION_LABELS = {
  '': 'सभी',
  login: 'लॉगिन',
  signup: 'साइनअप',
  complaint_created: 'शिकायत दर्ज',
  complaint_assigned: 'अधिकारी नियुक्ति',
  status_updated: 'स्थिति अपडेट',
  complaint_transferred: 'मामला स्थानांतरण',
  complaint_viewed: 'शिकायत देखी गई',
  sos_triggered: 'SOS',
  field_visit_checkin: 'फ़ील्ड विज़िट चेक-इन',
  priority_updated: 'प्राथमिकता बदली',
  resolution_verified: 'निस्तारण सत्यापित',
  complaint_marked_duplicate: 'डुप्लीकेट चिह्नित',
  officer_created: 'अधिकारी जोड़ा गया',
  officer_activated: 'अधिकारी सक्रिय किया',
  officer_deactivated: 'अधिकारी निष्क्रिय किया',
  officer_deleted: 'अधिकारी हटाया गया',
  officer_rank_updated: 'रैंक बदली गई',
  officers_bulk_imported: 'Bulk Import',
  sho_created: 'SHO बनाया गया',
  si_created_by_sho: 'SI बनाया गया (SHO द्वारा)',
  admin_account_created: 'प्रशासनिक खाता बनाया गया',
  backup_requested: 'Backup अनुरोध',
  broadcast_sent: 'Broadcast भेजा गया',
};
const ROLE_ICONS = { citizen: 'person-outline', officer: 'shield-outline', admin: 'ribbon-outline' };
const ROLE_COLORS = { citizen: colors.shaktiMaroon, officer: colors.inkNavy, admin: colors.marigold };

// 🆕 गतिविधि लॉग — Analytics
// पहले यह स्क्रीन सिर्फ़ कच्चे रिकॉर्ड (raw records) की सूची दिखाती थी — कोई
// सारांश/पैटर्न नहीं। अब मौजूदा फ़िल्टर पर लागू करके ही (कोई अलग API कॉल नहीं
// चाहिए) संक्षिप्त विश्लेषण मिलता है: कुल गतिविधियां, आज कितनी, भूमिका-अनुसार
// बंटवारा, और सबसे ज़्यादा होने वाली गतिविधियां (top actions)।
// बैकएंड इससे ज़्यादा नहीं देता (वहां Math.min(..., 200) लगा है) — इसलिए यही मांगते हैं
const LOG_FETCH_LIMIT = 200;

function computeAnalytics(logs) {
  const total = logs.length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = logs.filter((l) => String(l.createdAt || '').slice(0, 10) === todayStr).length;

  const byRole = { citizen: 0, officer: 0, admin: 0 };
  const byAction = {};
  for (const l of logs) {
    if (byRole[l.actorRole] !== undefined) byRole[l.actorRole] += 1;
    byAction[l.action] = (byAction[l.action] || 0) + 1;
  }
  const topActions = Object.entries(byAction)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return { total, today, byRole, topActions };
}

export default function AdminActivityLogsScreen() {
  const { queryActivityLogs } = useApp();
  const [actorRole, setActorRole] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);
  // तिथि की डिफ़ॉल्ट सीमा — 1 जनवरी 2026 से आज तक
  const [dateFrom, setDateFrom] = useState('2026-01-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [sort, setSort] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const analytics = React.useMemo(() => computeAnalytics(logs), [logs]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 🐛 बग फ़िक्स: पहले यहां कोई limit भेजी ही नहीं जाती थी, इसलिए बैकएंड अपनी
      // डिफ़ॉल्ट सिर्फ़ 50 पंक्तियां लौटाता। नीचे का पूरा विश्लेषण (कुल गतिविधियां,
      // आज, भूमिका-बंटवारा, top actions) उन्हीं 50 से बनता, पर दिखता ऐसे जैसे यह
      // पूरा आंकड़ा हो — audit/निगरानी के लिए यह भ्रामक था। अब बैकएंड की अधिकतम
      // सीमा (200) मांगते हैं, और नीचे साफ़ बताते हैं कि आंकड़े किस दायरे के हैं।
      const data = await queryActivityLogs({ actorRole, action, search: debouncedSearch, dateFrom, dateTo, sort, limit: LOG_FETCH_LIMIT });
      setLogs(data);
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setLoading(false);
  }, [actorRole, action, debouncedSearch, dateFrom, dateTo, sort, queryActivityLogs]);

  // Excel निर्यात — HTML तालिका .xls के रूप में; Excel सीधे खोल लेता है, हिंदी भी सही रहती है
  const exportExcel = async () => {
    if (logs.length === 0) return Alert.alert(tt('कुछ भी नहीं है'), tt('निर्यात के लिए कोई गतिविधि नहीं है।'));
    const headers = [tt('तारीख़ व समय'), tt('भूमिका'), tt('नाम'), tt('गतिविधि प्रकार'), tt('विवरण')];
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = logs
      .map((l) => {
        const d = new Date(l.createdAt);
        const p2 = (n) => String(n).padStart(2, '0');
        const when = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
        return `<tr><td>${esc(when)}</td><td>${esc(l.actorRole)}</td><td>${esc(l.actorName)}</td><td>${esc(l.action)}</td><td>${esc(l.details)}</td></tr>`;
      })
      .join('');
    const html = `<html><head><meta charset="UTF-8" /><style>table{border-collapse:collapse}
th{background:#0F2A44;color:#fff;font-weight:bold}th,td{border:1px solid #999;padding:6px;font-size:12px}
</style></head><body><table><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${body}</table></body></html>`;
    const uri = FileSystem.documentDirectory + `shaktikop-activity-${Date.now()}.xls`;
    try {
      await FileSystem.writeAsStringAsync(uri, html, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/vnd.ms-excel' });
      else Alert.alert(tt('फ़ाइल तैयार'), uri);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('Excel निर्यात नहीं हो सका।'));
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const clearAllFilters = () => {
    setActorRole('');
    setAction('');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setSort('newest');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        {/* 🐛 बग फ़िक्स: यह शीर्षक tt() से गुज़रता ही नहीं था (अंग्रेज़ी मोड में भी हिंदी),
            और गिनती भी सीमित (अधिकतम 200) हो सकती है — अब दोनों साफ़ हैं। */}
        <Text style={styles.title}>
          {tt('गतिविधि लॉग')} ({logs.length}{logs.length >= LOG_FETCH_LIMIT ? '+' : ''})
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.filterToggle} onPress={() => setShowAnalytics((s) => !s)}>
            <Ionicons name="stats-chart-outline" size={16} color={colors.inkNavy} />
            <Text style={styles.filterToggleText}>{tt('विश्लेषण')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterToggle} onPress={() => setShowFilters((s) => !s)}>
            <Ionicons name="options-outline" size={16} color={colors.inkNavy} />
            <Text style={styles.filterToggleText}>{tt('फ़िल्टर')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showAnalytics && !loading && logs.length > 0 && (
        <View style={styles.analyticsPanel}>
          <View style={styles.analyticsGrid}>
            <AnalyticsTile icon="documents-outline" label={tt('कुल (वर्तमान फ़िल्टर)')} value={analytics.total} color={colors.inkNavy} />
            <AnalyticsTile icon="today-outline" label={tt('आज')} value={analytics.today} color={colors.shaktiMaroon} />
            <AnalyticsTile icon="person-outline" label={tt('नागरिक')} value={analytics.byRole.citizen} color={colors.shaktiMaroon} />
            <AnalyticsTile icon="shield-outline" label={tt('अधिकारी')} value={analytics.byRole.officer} color={colors.inkNavyLight} />
            <AnalyticsTile icon="ribbon-outline" label={tt('एडमिन')} value={analytics.byRole.admin} color={colors.marigold} />
          </View>
          {analytics.topActions.length > 0 && (
            <View style={styles.topActionsBox}>
              <Text style={styles.topActionsTitle}>{tt('सबसे ज़्यादा होने वाली गतिविधियां')}</Text>
              {analytics.topActions.map(([action, count]) => {
                const pct = analytics.total > 0 ? Math.round((count / analytics.total) * 100) : 0;
                return (
                  <View key={action} style={styles.topActionRow}>
                    <Text style={styles.topActionLabel} numberOfLines={1}>{tt(ACTION_LABELS[action] || action)}</Text>
                    <View style={styles.topActionTrack}>
                      <View style={[styles.topActionFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.topActionCount}>{count}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {showFilters && (
        <ScrollView style={styles.filterPanel} contentContainerStyle={{ padding: 14 }}>
          <Text style={styles.filterLabel}>{tt('नाम से खोजें')}</Text>
          <TextInput style={styles.searchInput} placeholder={tt('नाम टाइप करें…')} value={search} onChangeText={setSearch} maxLength={100} />

          <Text style={styles.filterLabel}>{tt('भूमिका')}</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={actorRole} onValueChange={setActorRole}>
              <Picker.Item label={tt('सभी')} value="" />
              <Picker.Item label={tt('नागरिक')} value="citizen" />
              <Picker.Item label={tt('अधिकारी')} value="officer" />
              <Picker.Item label={tt('एडमिन')} value="admin" />
            </Picker>
          </View>

          <Text style={styles.filterLabel}>{tt('गतिविधि प्रकार')}</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={action} onValueChange={setAction}>
              {ACTIONS.map((a) => (
                <Picker.Item key={a} label={tt(ACTION_LABELS[a])} value={a} />
              ))}
            </Picker>
          </View>

          <Text style={styles.filterLabel}>{tt('क्रम')}</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={sort} onValueChange={setSort}>
              <Picker.Item label={tt('सबसे नई पहले')} value="newest" />
              <Picker.Item label={tt('सबसे पुरानी पहले')} value="oldest" />
            </Picker>
          </View>

          <Text style={styles.filterLabel}>{tt('तारीख से (YYYY-MM-DD)')}</Text>
          <TextInput style={styles.searchInput} placeholder={tt('जैसे — YYYY-MM-DD')} value={dateFrom} onChangeText={setDateFrom} maxLength={10} />

          <Text style={styles.filterLabel}>{tt('तारीख तक (YYYY-MM-DD)')}</Text>
          <TextInput style={styles.searchInput} placeholder={tt('जैसे — YYYY-MM-DD')} value={dateTo} onChangeText={setDateTo} maxLength={10} />

          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => {
              setActorRole('');
              setAction('');
              setSearch('');
              setDateFrom('');
              setDateTo('');
              setSort('newest');
            }}
          >
            <Ionicons name="refresh-outline" size={14} color={colors.shaktiMaroon} />
            <Text style={styles.clearBtnText}>{tt('सभी फ़िल्टर साफ़ करें')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={exportExcel}>
            <Ionicons name="grid-outline" size={14} color={colors.sage} />
            <Text style={[styles.clearBtnText, { color: colors.sage }]}>{tt('Excel में निर्यात करें')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.logCard}>
              <View style={[styles.roleIcon, { backgroundColor: ROLE_COLORS[item.actorRole] || colors.inkGrey }]}>
                <Ionicons name={ROLE_ICONS[item.actorRole] || 'person-outline'} size={16} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.logAction}>{tt(ACTION_LABELS[item.action] || item.action)}</Text>
                <Text style={styles.logActor}>{item.actorName || 'अज्ञात'} · {item.actorRole}</Text>
                {item.details ? <Text style={styles.logDetails}>{item.details}</Text> : null}
                <Text style={styles.logMeta}>
                  {formatDateTime(item.createdAt)} {item.ipAddress ? `· IP: ${item.ipAddress}` : ''}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="इस फ़िल्टर में कोई गतिविधि नहीं मिली।"
              subtitle="तारीख़ की सीमा या भूमिका/गतिविधि-प्रकार बदलकर देखें।"
              actionLabel="फ़िल्टर साफ़ करें"
              onAction={clearAllFilters}
            />
          }
        />
      )}
    </View>
  );
}

function AnalyticsTile({ icon, label, value, color }) {
  return (
    <View style={[styles.analyticsTile, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={styles.analyticsValue}>{value}</Text>
      <Text style={styles.analyticsLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.inkNavy },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  filterToggleText: { fontSize: 12, fontWeight: '700', color: colors.inkNavy },
  filterPanel: { backgroundColor: colors.white, marginHorizontal: 16, borderRadius: radius.lg, maxHeight: 480, marginBottom: 10 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, marginBottom: 4, paddingVertical: 8 },
  clearBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
  filterLabel: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginBottom: 4, marginTop: 10 },
  searchInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13.5 },
  pickerWrap: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  list: { padding: 16, paddingTop: 4 },
  logCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 10,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  roleIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  logAction: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  logActor: { fontSize: 11.5, color: colors.inkGrey, marginTop: 2 },
  logDetails: { fontSize: 12, color: colors.inkGrey, marginTop: 4, lineHeight: 17 },
  logMeta: { fontSize: 10, color: colors.inkLight, marginTop: 5 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 40, fontSize: 13 },

  analyticsPanel: { marginHorizontal: 16, marginBottom: 10 },
  analyticsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  analyticsTile: { width: '31%', backgroundColor: colors.white, borderRadius: radius.md, padding: 10, borderLeftWidth: 3 },
  analyticsValue: { fontSize: 16, fontWeight: '800', color: colors.inkNavy, marginTop: 4 },
  analyticsLabel: { fontSize: 9, color: colors.inkGrey, marginTop: 2 },
  topActionsBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14 },
  topActionsTitle: { fontSize: 12.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 10 },
  topActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  topActionLabel: { width: 100, fontSize: 10.5, color: colors.inkGrey },
  topActionTrack: { flex: 1, height: 8, backgroundColor: colors.sand, borderRadius: 4, overflow: 'hidden' },
  topActionFill: { height: '100%', backgroundColor: colors.shaktiMaroon, borderRadius: 4 },
  topActionCount: { width: 26, fontSize: 10.5, fontWeight: '700', color: colors.inkNavy, textAlign: 'right' },
});
