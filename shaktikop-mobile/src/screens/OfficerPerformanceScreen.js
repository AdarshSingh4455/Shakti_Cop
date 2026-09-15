import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { LoadingView } from '../components/LoadingView';

// 🆕 Advanced Analytics (अधिकारी) — पहले सिर्फ़ hamesha-हर-समय (all-time) के 4
// आंकड़े दिखते थे, कोई फ़िल्टर नहीं था। अब समय-सीमा और श्रेणी से फ़िल्टर कर सकते
// हैं, साथ ही महीने-दर-महीने ट्रेंड और श्रेणी-अनुसार बंटवारा भी जुड़ा है।

const DATE_PRESETS = [
  { key: '7d', label: '7 दिन', days: 7 },
  { key: '30d', label: '30 दिन', days: 30 },
  { key: '90d', label: '90 दिन', days: 90 },
  { key: 'all', label: 'सभी समय', days: null },
];

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

export default function OfficerPerformanceScreen() {
  const { fetchMyPerformance } = useApp();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [datePreset, setDatePreset] = useState('all');
  const [category, setCategory] = useState(null);

  const activeFilters = useMemo(() => {
    let dateFrom = null;
    let dateTo = null;
    const preset = DATE_PRESETS.find((p) => p.key === datePreset);
    if (preset?.days) {
      const from = new Date();
      from.setDate(from.getDate() - preset.days);
      dateFrom = fmtDate(from);
      dateTo = fmtDate(new Date());
    }
    return { dateFrom, dateTo, category };
  }, [datePreset, category]);

  const activeFilterCount = (datePreset !== 'all' ? 1 : 0) + (category ? 1 : 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMyPerformance(activeFilters);
      setStats(data);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [fetchMyPerformance, activeFilters]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !stats) {
    return (
      <View style={styles.container}>
        <LoadingView />
      </View>
    );
  }

  const resolutionRate = stats.totalAssigned > 0 ? Math.round((stats.resolved / stats.totalAssigned) * 100) : 0;
  const maxMonthly = Math.max(1, ...(stats.monthlyTrend || []).map((m) => m.total));
  const maxCategory = Math.max(1, ...(stats.byCategory || []).map((c) => c.total));

  const availableCategories = (stats.byCategory || []).map((c) => c.category);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('मेरा प्रदर्शन')}</Text>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterPanelOpen(true)}>
          <Ionicons name="options-outline" size={16} color={colors.white} />
          <Text style={styles.filterBtnText}>{tt('फ़िल्टर')}</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeFilterCount > 0 && (
        <View style={styles.chipRowInline}>
          {datePreset !== 'all' && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{DATE_PRESETS.find((p) => p.key === datePreset)?.label}</Text>
              <TouchableOpacity onPress={() => setDatePreset('all')}>
                <Ionicons name="close-circle" size={14} color={colors.white} />
              </TouchableOpacity>
            </View>
          )}
          {category && (
            <View style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>{category}</Text>
              <TouchableOpacity onPress={() => setCategory(null)}>
                <Ionicons name="close-circle" size={14} color={colors.white} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={styles.grid}>
        <StatCard icon="documents-outline" num={stats.totalAssigned} label={tt('कुल नियुक्त')} color={colors.inkNavy} />
        <StatCard icon="checkmark-circle-outline" num={stats.resolved} label={tt('निस्तारित')} color={colors.sage} />
        <StatCard icon="sync-outline" num={stats.active} label={tt('सक्रिय')} color={colors.shaktiMaroon} />
        <StatCard icon="close-circle-outline" num={stats.rejected} label={tt('अस्वीकृत')} color={colors.alert} />
      </View>

      <View style={styles.card}>
        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>{tt('निस्तारण दर (Resolution Rate)')}</Text>
          <Text style={styles.rateValue}>{resolutionRate}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${resolutionRate}%` }]} />
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.metricRow}>
          <Ionicons name="time-outline" size={18} color={colors.inkGrey} />
          <View style={{ flex: 1 }}>
            <Text style={styles.metricLabel}>{tt('औसत निस्तारण समय')}</Text>
            <Text style={styles.metricValue}>
              {stats.avgResolutionHours ? `${stats.avgResolutionHours} घंटे` : 'अभी डेटा नहीं'}
            </Text>
          </View>
        </View>
        <View style={styles.metricRow}>
          <Ionicons name="star-outline" size={18} color={colors.marigold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.metricLabel}>{tt('औसत नागरिक रेटिंग')}</Text>
            <Text style={styles.metricValue}>
              {stats.avgRating ? `${stats.avgRating} / 5 (${stats.ratingCount} रेटिंग)` : 'अभी कोई रेटिंग नहीं'}
            </Text>
          </View>
        </View>
      </View>

      {/* 🆕 महीने-दर-महीने ट्रेंड (पिछले 6 महीने) */}
      {stats.monthlyTrend?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('पिछले 6 महीनों का ट्रेंड')}</Text>
          <View style={styles.barChart}>
            {stats.monthlyTrend.map((m) => (
              <View key={m.month} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height: `${(m.total / maxMonthly) * 100}%`, backgroundColor: colors.shaktiMaroon }]} />
                  <View style={[styles.bar, styles.barResolved, { height: `${(m.resolved / maxMonthly) * 100}%` }]} />
                </View>
                <Text style={styles.barLabel}>{m.month.slice(5)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.shaktiMaroon }]} />
              <Text style={styles.legendText}>{tt('कुल')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.sage }]} />
              <Text style={styles.legendText}>{tt('निस्तारित')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 🆕 श्रेणी-अनुसार बंटवारा */}
      {stats.byCategory?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('श्रेणी अनुसार')}</Text>
          {stats.byCategory.map((c) => (
            <View key={c.category} style={styles.hBarRow}>
              <Text style={styles.hBarLabel} numberOfLines={1}>{c.category}</Text>
              <View style={styles.hBarTrack}>
                <View style={[styles.hBarFill, { width: `${(c.total / maxCategory) * 100}%`, backgroundColor: colors.shaktiMaroon }]} />
              </View>
              <Text style={styles.hBarNum}>{c.total}</Text>
            </View>
          ))}
        </View>
      )}

      <Modal visible={filterPanelOpen} transparent animationType="slide" onRequestClose={() => setFilterPanelOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{tt('फ़िल्टर')}</Text>
              <TouchableOpacity onPress={() => setFilterPanelOpen(false)}>
                <Ionicons name="close" size={22} color={colors.inkGrey} />
              </TouchableOpacity>
            </View>
            <Text style={styles.filterLabel}>{tt('समय-सीमा')}</Text>
            <View style={styles.chipRow}>
              {DATE_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.pillBtn, datePreset === p.key && styles.pillBtnActive]}
                  onPress={() => setDatePreset(p.key)}
                >
                  <Text style={[styles.pillBtnText, datePreset === p.key && styles.pillBtnTextActive]}>{tt(p.label)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {availableCategories.length > 0 && (
              <>
                <Text style={styles.filterLabel}>{tt('श्रेणी')}</Text>
                <View style={styles.chipRow}>
                  {availableCategories.map((c) => (
                    <TouchableOpacity key={c} style={[styles.pillBtn, category === c && styles.pillBtnActive]} onPress={() => setCategory(category === c ? null : c)}>
                      <Text style={[styles.pillBtnText, category === c && styles.pillBtnTextActive]} numberOfLines={1}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => {
                  setDatePreset('all');
                  setCategory(null);
                }}
              >
                <Text style={styles.resetBtnText}>{tt('सब हटाएं')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterPanelOpen(false)}>
                <Text style={styles.applyBtnText}>{tt('लागू करें')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatCard({ icon, num, label, color }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.statNum}>{num}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.shaktiMaroon, borderRadius: radius.md, paddingVertical: 7, paddingHorizontal: 12 },
  filterBtnText: { fontSize: 12, fontWeight: '700', color: colors.white },
  filterBadge: { backgroundColor: colors.white, borderRadius: 9, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  filterBadgeText: { fontSize: 9.5, fontWeight: '800', color: colors.shaktiMaroon },
  chipRowInline: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.inkNavy, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontSize: 11.5, color: colors.white, fontWeight: '600', maxWidth: 120 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: { width: '47%', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, borderLeftWidth: 4 },
  statNum: { fontSize: 22, fontWeight: '800', color: colors.inkNavy, marginTop: 6 },
  statLabel: { fontSize: 11.5, color: colors.inkGrey, marginTop: 2 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 14,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 14 },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rateLabel: { fontSize: 13, fontWeight: '600', color: colors.inkGrey },
  rateValue: { fontSize: 16, fontWeight: '800', color: colors.sage },
  progressTrack: { height: 10, backgroundColor: colors.sand, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.sage, borderRadius: 5 },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  metricLabel: { fontSize: 12, color: colors.inkGrey },
  metricValue: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginTop: 2 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barTrack: { flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: '90%' },
  bar: { width: 6, borderRadius: 2, minHeight: 2 },
  barResolved: { backgroundColor: colors.sage },
  barLabel: { fontSize: 8, color: colors.inkLight, marginTop: 4 },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.inkGrey },
  hBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  hBarLabel: { width: 90, fontSize: 11, color: colors.inkGrey },
  hBarTrack: { flex: 1, height: 10, backgroundColor: colors.sand, borderRadius: 5, overflow: 'hidden' },
  hBarFill: { height: '100%', borderRadius: 5 },
  hBarNum: { width: 30, fontSize: 11, fontWeight: '700', color: colors.inkNavy, textAlign: 'right' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 18, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 16.5, fontWeight: '800', color: colors.inkNavy },
  filterLabel: { fontSize: 12, fontWeight: '700', color: colors.inkGrey, marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillBtn: { backgroundColor: colors.sand, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 13, maxWidth: 160 },
  pillBtnActive: { backgroundColor: colors.shaktiMaroon },
  pillBtnText: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey },
  pillBtnTextActive: { color: colors.white },
  modalFooter: { flexDirection: 'row', gap: 10, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  resetBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border },
  resetBtnText: { fontSize: 13, fontWeight: '700', color: colors.inkGrey },
  applyBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.shaktiMaroon },
  applyBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },
});
