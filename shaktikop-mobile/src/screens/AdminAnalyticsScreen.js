import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { categoryDef } from '../data/constants';
import { useApp } from '../context/AppContext';

import { LoadingView } from '../components/LoadingView';

// 🆕 Advanced Analytics — पहले यह स्क्रीन सिर्फ़ hamesha-हर-समय (all-time) का एक
// तय आंकड़ा दिखाती थी, कोई फ़िल्टर नहीं था। अब तारीख़-सीमा, श्रेणी, स्थिति, थाना,
// अधिकारी — सब कुछ फ़िल्टर किया जा सकता है, साथ ही कई नए breakdown भी जुड़े हैं
// (स्थिति-फ़नल, निस्तारण-समय का वितरण, हफ़्ते/घंटे का पैटर्न, पिछली अवधि से तुलना)।

const DATE_PRESETS = [
  { key: '7d', label: '7 दिन', days: 7 },
  { key: '30d', label: '30 दिन', days: 30 },
  { key: '90d', label: '90 दिन', days: 90 },
  { key: '365d', label: '1 साल', days: 365 },
  { key: 'all', label: 'सभी समय', days: null },
];

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

export default function AdminAnalyticsScreen({ route, navigation }) {
  const { fetchAnalyticsOverview, fetchAnalyticsFilterOptions, fetchSlaAtRisk, fetchRepeatOffenders, fetchOfficerWorkload, fetchSosResponseAnalytics, fetchRepeatVictims, user } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [filterOptions, setFilterOptions] = useState(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // 🆕 3 नई शक्तिशाली सुविधाएं — lazily (सिर्फ़ खोलने पर) लोड होती हैं ताकि मुख्य
  // स्क्रीन धीमी न हो
  const [powerSection, setPowerSection] = useState(null); // null | 'sla' | 'offenders' | 'workload' | 'sosresp' | 'victims'
  const [sosRespData, setSosRespData] = useState(null);
  const [victimsData, setVictimsData] = useState(null);
  const [slaData, setSlaData] = useState(null);
  const [offendersData, setOffendersData] = useState(null);
  const [workloadData, setWorkloadData] = useState(null);
  const [powerLoading, setPowerLoading] = useState(false);
  // 🐛 बग फ़िक्स: पहले विफल अनुरोध पर data null ही रहता, और नीचे कार्ड का null-check
  // उसका "सब ठीक है" वाला संदेश दिखा देता ("✔ फ़िलहाल कोई शिकायत SLA-जोखिम में नहीं है")।
  // यानी नेटवर्क-त्रुटि बिल्कुल "कोई ख़तरा नहीं" जैसी दिखती — एडमिन मान लेता कि ध्यान
  // देने लायक़ कुछ है ही नहीं, जबकि जांच असल में चली ही नहीं थी।
  const [powerError, setPowerError] = useState(null);

  const [datePreset, setDatePreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [category, setCategory] = useState(null);
  const [status, setStatus] = useState(null);
  // 🆕 District/Station Explorer से आने पर थाना पहले से भरा हुआ मिलता है
  const [station, setStation] = useState(route?.params?.presetStation || null);
  const [officerId, setOfficerId] = useState(null);

  const activeFilters = useMemo(() => {
    let dateFrom = null;
    let dateTo = null;
    if (datePreset === 'custom') {
      dateFrom = customFrom || null;
      dateTo = customTo || null;
    } else {
      const preset = DATE_PRESETS.find((p) => p.key === datePreset);
      if (preset?.days) {
        const from = new Date();
        from.setDate(from.getDate() - preset.days);
        dateFrom = fmtDate(from);
        dateTo = fmtDate(new Date());
      }
    }
    return { dateFrom, dateTo, category, status, station, officerId };
  }, [datePreset, customFrom, customTo, category, status, station, officerId]);

  const activeFilterCount = [category, status, station, officerId].filter(Boolean).length + (datePreset !== 'all' ? 1 : 0);

  const load = useCallback(async () => {
    try {
      const d = await fetchAnalyticsOverview(activeFilters);
      setData(d);
    } catch (e) {
      // ignore
    }
  }, [fetchAnalyticsOverview, activeFilters]);

  useEffect(() => {
    fetchAnalyticsFilterOptions().then(setFilterOptions).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // 🆕 3 नई सुविधाओं में से किसी एक को खोलना/बंद करना — पहली बार खुलने पर ही
  // डेटा लाया जाता है, बाद में कैश से (दोबारा टैप करने पर फिर से सर्वर-कॉल नहीं)
  const togglePowerSection = async (key) => {
    if (powerSection === key) {
      setPowerSection(null);
      return;
    }
    setPowerSection(key);
    setPowerLoading(true);
    setPowerError(null);
    try {
      if (key === 'sla' && !slaData) setSlaData(await fetchSlaAtRisk());
      if (key === 'offenders' && !offendersData) setOffendersData(await fetchRepeatOffenders());
      if (key === 'workload' && !workloadData) setWorkloadData(await fetchOfficerWorkload());
      if (key === 'sosresp' && !sosRespData) setSosRespData(await fetchSosResponseAnalytics());
      if (key === 'victims' && !victimsData) setVictimsData(await fetchRepeatVictims());
    } catch (e) {
      setPowerError(e.message || tt('जानकारी नहीं मिल सकी'));
    }
    setPowerLoading(false);
  };

  const resetFilters = () => {
    setDatePreset('30d');
    setCustomFrom('');
    setCustomTo('');
    setCategory(null);
    setStatus(null);
    setStation(null);
    setOfficerId(null);
  };

  if (loading || !data) {
    return (
      <View style={styles.container}>
        <LoadingView />
      </View>
    );
  }

  const maxMonthly = Math.max(1, ...data.monthlyTrend.map((m) => m.total));
  const maxCategory = Math.max(1, ...data.byCategory.map((c) => c.total));
  const maxDistrict = Math.max(1, ...data.byDistrict.map((d) => d.total));
  const maxStation = Math.max(1, ...data.byStation.map((s) => s.total));
  const maxDow = Math.max(1, ...data.byDayOfWeek.map((d) => d.total));
  const maxHour = Math.max(1, ...data.byHour.map((h) => h.total));
  const rtd = data.responseTimeDistribution;
  const maxRtd = Math.max(1, rtd.under2h, rtd.h2to6, rtd.h6to24, rtd.d1to3, rtd.d3to7, rtd.over7d);
  const statusColor = { दर्ज: colors.marigold, 'अधिकारी नियुक्त': colors.inkNavyLight, 'कार्यवाही जारी': colors.shaktiMaroon, निस्तारित: colors.sage, अस्वीकृत: colors.alert };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('विश्लेषण डैशबोर्ड')}</Text>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterPanelOpen(true)}>
          <Ionicons name="options-outline" size={17} color={colors.white} />
          <Text style={styles.filterBtnText}>{tt('फ़िल्टर')}</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 🆕 District → Station Explorer तक त्वरित पहुंच */}
      <TouchableOpacity style={styles.explorerBanner} onPress={() => navigation.navigate('DistrictExplorer')} activeOpacity={0.85}>
        <Ionicons name="map-outline" size={18} color={colors.white} />
        <View style={{ flex: 1 }}>
          <Text style={styles.explorerBannerTitle}>{tt('ज़िला व थाना Explorer')}</Text>
          <Text style={styles.explorerBannerSub}>{tt('हर ज़िले/थाने का तुलनात्मक Analytics देखें')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.white} />
      </TouchableOpacity>

      {/* 🐛 बग फ़िक्स: पहले सिर्फ़ district_admin को यह "दायरा" संदेश दिखता था —
          DSP/ASP/SSP/IG/DIG को कोई संकेत ही नहीं मिलता था कि वे किस दायरे का
          डेटा देख रहे हैं, जिससे भ्रम हो सकता था (जैसे लगे कि यह पूरे राज्य का है)। */}
      {user?.rangeDistricts && user.rangeDistricts.length > 0 ? (
        <View style={styles.scopeNoteRow}>
          <Ionicons name="location-outline" size={13} color={colors.inkGrey} />
          <Text style={styles.scopeNote}>दिखाया जा रहा डेटा आपके Range ({user.rangeDistricts.map((d) => tt(d)).join(', ')}) तक सीमित है</Text>
        </View>
      ) : user?.circleStations && user.circleStations.length > 0 ? (
        <View style={styles.scopeNoteRow}>
          <Ionicons name="location-outline" size={13} color={colors.inkGrey} />
          <Text style={styles.scopeNote}>दिखाया जा रहा डेटा आपके सर्किल के थानों ({user.circleStations.map((s) => tt(s)).join(', ')}) तक सीमित है</Text>
        </View>
      ) : (user?.adminRole === 'district_admin' || (user?.adminRole === 'monitor' && user?.district)) ? (
        <View style={styles.scopeNoteRow}>
          <Ionicons name="location-outline" size={13} color={colors.inkGrey} />
          <Text style={styles.scopeNote}>दिखाया जा रहा डेटा सिर्फ़ {tt(user.district)} ज़िले का है</Text>
        </View>
      ) : null}

      {/* सक्रिय फ़िल्टर-चिप्स */}
      {activeFilterCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {datePreset !== 'all' && (
            <Chip
              label={datePreset === 'custom' ? `${customFrom || '…'} → ${customTo || '…'}` : DATE_PRESETS.find((p) => p.key === datePreset)?.label}
              onClear={() => setDatePreset('all')}
            />
          )}
          {category && <Chip label={category} onClear={() => setCategory(null)} />}
          {status && <Chip label={status} onClear={() => setStatus(null)} />}
          {station && <Chip label={tt(station)} onClear={() => setStation(null)} />}
          {officerId && (
            <Chip
              label={filterOptions?.officers.find((o) => o.id === officerId)?.name || officerId}
              onClear={() => setOfficerId(null)}
            />
          )}
          <TouchableOpacity onPress={resetFilters} style={styles.clearAllBtn}>
            <Text style={styles.clearAllText}>{tt('सब हटाएं')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* सारांश KPI कार्ड्स — तुलना (% बदलाव) के साथ अगर तारीख़-सीमा चुनी हो */}
      <View style={styles.summaryGrid}>
        <SummaryCard
          icon="documents-outline"
          label={tt('कुल शिकायतें')}
          value={data.summary.total}
          color={colors.inkNavy}
          changePercent={data.comparison?.totalChangePercent}
        />
        <SummaryCard icon="checkmark-circle-outline" label={tt('निस्तारण दर')} value={`${data.summary.resolutionRate}%`} color={colors.sage} />
        <SummaryCard icon="time-outline" label={tt('औसत समय')} value={data.summary.avgResolutionHours ? `${data.summary.avgResolutionHours} घं.` : '—'} color={colors.marigold} />
        <SummaryCard icon="star-outline" label={tt('औसत रेटिंग')} value={data.summary.avgRating || '—'} color={colors.shaktiMaroon} />
        <SummaryCard icon="alert-circle-outline" label={tt('SOS')} value={data.summary.sosCount} color={colors.alert} />
        <SummaryCard icon="hourglass-outline" label={tt('लंबित')} value={data.summary.pending} color={colors.inkNavyLight} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('महीने-दर-महीने ट्रेंड')}</Text>
        <View style={styles.barChart}>
          {data.monthlyTrend.map((m) => (
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

      {/* 🆕 स्थिति-फ़नल — कहां शिकायतें अटकी हैं */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('स्थिति-अनुसार बंटवारा')}</Text>
        {data.byStatus.map((s) => (
          <View key={s.status} style={styles.hBarRow}>
            <Text style={styles.hBarLabel} numberOfLines={1}>{tt(s.status)}</Text>
            <View style={styles.hBarTrack}>
              <View style={[styles.hBarFill, { width: `${(s.total / data.summary.total) * 100}%`, backgroundColor: statusColor[s.status] || colors.inkGrey }]} />
            </View>
            <Text style={styles.hBarNum}>{s.total}</Text>
          </View>
        ))}
      </View>

      {/* 🆕 निस्तारण-समय का वितरण */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('निस्तारण-समय का वितरण')}</Text>
        {[
          { label: '< 2 घं.', val: rtd.under2h, color: colors.sage },
          { label: '2-6 घं.', val: rtd.h2to6, color: colors.sage },
          { label: '6-24 घं.', val: rtd.h6to24, color: colors.marigold },
          { label: '1-3 दिन', val: rtd.d1to3, color: colors.marigold },
          { label: '3-7 दिन', val: rtd.d3to7, color: colors.alert },
          { label: '> 7 दिन', val: rtd.over7d, color: colors.alert },
        ].map((row) => (
          <View key={row.label} style={styles.hBarRow}>
            <Text style={styles.hBarLabel} numberOfLines={1}>{row.label}</Text>
            <View style={styles.hBarTrack}>
              <View style={[styles.hBarFill, { width: `${(row.val / maxRtd) * 100}%`, backgroundColor: row.color }]} />
            </View>
            <Text style={styles.hBarNum}>{row.val}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('श्रेणी अनुसार')}</Text>
        {data.byCategory.map((c) => {
          const def = categoryDef(c.category);
          return (
            <View key={c.category} style={styles.hBarRow}>
              <Text style={styles.hBarLabel} numberOfLines={1}>{c.category}</Text>
              <View style={styles.hBarTrack}>
                <View style={[styles.hBarFill, { width: `${(c.total / maxCategory) * 100}%`, backgroundColor: def.color }]} />
              </View>
              <Text style={styles.hBarNum}>{c.total}</Text>
            </View>
          );
        })}
      </View>

      {data.byStation.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('थाना अनुसार (शीर्ष 15)')}</Text>
          {data.byStation.map((s) => (
            <View key={s.station} style={styles.hBarRow}>
              <Text style={styles.hBarLabel} numberOfLines={1}>{tt(s.station)}</Text>
              <View style={styles.hBarTrack}>
                <View style={[styles.hBarFill, { width: `${(s.total / maxStation) * 100}%`, backgroundColor: colors.inkNavyLight }]} />
              </View>
              <Text style={styles.hBarNum}>{s.total}</Text>
            </View>
          ))}
        </View>
      )}

      {data.byDistrict.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('ज़िला अनुसार (शीर्ष 10)')}</Text>
          {data.byDistrict.map((d) => (
            <View key={tt(d.district)} style={styles.hBarRow}>
              <Text style={styles.hBarLabel} numberOfLines={1}>{tt(d.district)}</Text>
              <View style={styles.hBarTrack}>
                <View style={[styles.hBarFill, { width: `${(d.total / maxDistrict) * 100}%`, backgroundColor: colors.inkNavy }]} />
              </View>
              <Text style={styles.hBarNum}>{d.total}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 🆕 हफ़्ते के दिन का पैटर्न — staffing-योजना के लिए */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('हफ़्ते के किस दिन ज़्यादा शिकायतें आती हैं')}</Text>
        <View style={styles.barChart}>
          {data.byDayOfWeek.map((d) => (
            <View key={d.day} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { width: 14, height: `${(d.total / maxDow) * 100}%`, backgroundColor: colors.shaktiMaroon }]} />
              </View>
              <Text style={styles.barLabel}>{tt(d.day).slice(0, 3)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 🆕 दिन के किस समय — patrol/staffing के लिए उपयोगी */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('दिन के किस समय ज़्यादा शिकायतें आती हैं')}</Text>
        <View style={styles.hourChart}>
          {data.byHour.map((h) => (
            <View key={h.hour} style={styles.hourCol}>
              <View style={[styles.hourBar, { height: Math.max(4, (h.total / maxHour) * 60) }]} />
              {h.hour % 3 === 0 && <Text style={styles.hourLabel}>{h.hour}</Text>}
            </View>
          ))}
        </View>
      </View>

      {/* 🆕 3 नई शक्तिशाली सुविधाएं — सिर्फ़ "क्या हुआ" नहीं, "अभी क्या करना है" */}
      <View style={{ marginTop: 6 }}>
        <PowerSectionToggle
          icon="warning-outline"
          title={tt('SLA जोखिम — तुरंत ध्यान चाहिए')}
          activeKey="sla"
          powerSection={powerSection}
          onToggle={togglePowerSection}
        >
          <SlaAtRiskCard data={slaData} loading={powerLoading} error={powerError} navigation={navigation} />
        </PowerSectionToggle>

        <PowerSectionToggle
          icon="person-remove-outline"
          title={tt('दोहराए-आरोपी (पैटर्न-पहचान)')}
          activeKey="offenders"
          powerSection={powerSection}
          onToggle={togglePowerSection}
        >
          <RepeatOffendersCard data={offendersData} loading={powerLoading} error={powerError} navigation={navigation} />
        </PowerSectionToggle>

        <PowerSectionToggle
          icon="people-outline"
          title={tt('अधिकारी कार्यभार — कौन अधिक व्यस्त है')}
          activeKey="workload"
          powerSection={powerSection}
          onToggle={togglePowerSection}
        >
          <OfficerWorkloadCard data={workloadData} loading={powerLoading} error={powerError} />
        </PowerSectionToggle>

        <PowerSectionToggle
          icon="alarm-outline"
          title={tt('SOS पर प्रतिक्रिया — कितनी देर में देखा गया')}
          activeKey="sosresp"
          powerSection={powerSection}
          onToggle={togglePowerSection}
        >
          <SosResponseCard data={sosRespData} loading={powerLoading} error={powerError} />
        </PowerSectionToggle>

        <PowerSectionToggle
          icon="repeat-outline"
          title={tt('बार-बार शिकायत करने वाली पीड़िताएं')}
          activeKey="victims"
          powerSection={powerSection}
          onToggle={togglePowerSection}
        >
          <RepeatVictimsCard data={victimsData} loading={powerLoading} error={powerError} />
        </PowerSectionToggle>
      </View>

      <FilterPanelModal
        visible={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        filterOptions={filterOptions}
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
        category={category}
        setCategory={setCategory}
        status={status}
        setStatus={setStatus}
        station={station}
        setStation={setStation}
        officerId={officerId}
        setOfficerId={setOfficerId}
        onReset={resetFilters}
      />
    </ScrollView>
  );
}

function Chip({ label, onClear }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
      <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={15} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

function SummaryCard({ icon, label, value, color, changePercent }) {
  return (
    <View style={[styles.summaryCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      {changePercent != null && (
        <View style={styles.changeRow}>
          <Ionicons
            name={changePercent >= 0 ? 'arrow-up' : 'arrow-down'}
            size={11}
            color={changePercent >= 0 ? colors.sage : colors.alert}
          />
          <Text style={[styles.changeText, { color: changePercent >= 0 ? colors.sage : colors.alert }]}>
            {Math.abs(changePercent)}% {tt('पिछली अवधि से')}
          </Text>
        </View>
      )}
    </View>
  );
}

function PowerSectionToggle({ icon, title, activeKey, powerSection, onToggle, children }) {
  const open = powerSection === activeKey;
  return (
    <View style={styles.powerCard}>
      <TouchableOpacity style={styles.powerHeader} onPress={() => onToggle(activeKey)}>
        <Ionicons name={icon} size={18} color={colors.shaktiMaroon} />
        <Text style={styles.powerTitle}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkLight} />
      </TouchableOpacity>
      {open && <View style={styles.powerBody}>{children}</View>}
    </View>
  );
}

// साझा त्रुटि-पंक्ति — आइकॉन + संदेश, इस स्क्रीन के हर power-card में एक जैसी दिखे
function ErrorRow({ message }) {
  return (
    <View style={styles.inlineWarnRow}>
      <Ionicons name="alert-circle" size={15} color={colors.alert} />
      <Text style={styles.powerErrorText}>{message}</Text>
    </View>
  );
}

// 🆕 SLA जोखिम — अभी खुली शिकायतें जो अपनी समय-सीमा के करीब/पार हैं
function SlaAtRiskCard({ data, loading, error, navigation }) {
  if (loading) return <LoadingView />;
  if (error) return <ErrorRow message={error} />;
  if (!data || data.items.length === 0) {
    return <Text style={styles.powerEmptyText}>{tt('फ़िलहाल कोई शिकायत SLA-जोखिम में नहीं है।')}</Text>;
  }
  return (
    <View>
      <Text style={styles.powerHint}>
        {tt(`SLA सीमा: ${data.slaHours} घंटे — नीचे वे शिकायतें हैं जो ${data.thresholdHours} घंटे या उससे ज़्यादा से खुली हैं।`)}
      </Text>
      {data.items.slice(0, 15).map((it) => (
        <TouchableOpacity
          key={it.id}
          style={[styles.powerRow, it.breached && styles.powerRowBreached]}
          onPress={() => navigation.navigate('ComplaintDetail', { id: it.id })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.powerRowTitle}>{it.id} · {tt(it.category)}</Text>
            <Text style={styles.powerRowSub}>
              {tt(it.district || '—')} · {tt(it.policeStation || '—')} · {it.officerName || tt('अनियुक्त')}
            </Text>
          </View>
          <Text style={[styles.powerRowBadge, it.breached && { color: colors.alert }]}>
            {it.hoursOpen} {tt('घं.')}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// 🆕 दोहराए-आरोपी — पूरे scope में सबसे ज़्यादा शिकायतों वाले आरोपी
function RepeatOffendersCard({ data, loading, error, navigation }) {
  if (loading) return <LoadingView />;
  if (error) return <ErrorRow message={error} />;
  if (!data || data.length === 0) {
    return <Text style={styles.powerEmptyText}>{tt('कोई दोहराया गया आरोपी नहीं मिला।')}</Text>;
  }
  return (
    <View>
      <Text style={styles.powerHint}>{tt('गोपनीयता के लिए पीड़िताओं की पहचान कभी नहीं दिखाई जाती।')}</Text>
      {data.map((o, i) => (
        <View key={i} style={styles.powerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.powerRowTitle}>{o.accusedName || tt('नाम उपलब्ध नहीं')}</Text>
            <Text style={styles.powerRowSub} numberOfLines={1}>{o.categories.map((c) => tt(c)).join(', ')}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('ComplaintDetail', { id: o.complaintIds[0] })}>
            <Text style={[styles.powerRowBadge, { color: colors.alert }]}>{o.complaintCount} {tt('शिकायतें')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// 🆕 अधिकारी कार्यभार — कौन overloaded है
// SOS पर प्रतिक्रिया-समय। औसत के साथ median व p90 भी दिखाते हैं — औसत अकेला धोखा
// देता है: कुछ बहुत तेज़ और कुछ बहुत धीमे मिलकर "ठीक-ठाक" औसत बना देते हैं, जबकि
// असल में हर दसवें SOS को बहुत देर लगी होती है। p90 वही छिपी देरी सामने लाता है।
function SosResponseCard({ data, loading, error }) {
  if (loading) return <Text style={styles.powerHint}>{tt('लोड हो रहा है…')}</Text>;
  if (error) return <Text style={[styles.powerHint, { color: colors.alert }]}>{error}</Text>;
  if (!data) return null;
  if (!data.totalSos) return <Text style={styles.powerHint}>{tt('इस दायरे में कोई SOS दर्ज नहीं है।')}</Text>;

  return (
    <View>
      <View style={styles.sosStatRow}>
        <SosStat label={tt('कुल SOS')} value={data.totalSos} />
        <SosStat label={tt('कभी नहीं देखे')} value={data.neverSeen} danger={data.neverSeen > 0} />
        <SosStat label={tt('औसत मिनट')} value={data.avgMinutes ?? '—'} />
      </View>
      <View style={styles.sosStatRow}>
        <SosStat label={tt('आधे मामले (median)')} value={data.medianMinutes ?? '—'} />
        <SosStat label={tt('सबसे धीमे 10% (p90)')} value={data.p90Minutes ?? '—'} danger={data.p90Minutes > 15} />
      </View>

      {data.neverSeen > 0 && (
        <View style={styles.inlineWarnRow}>
          <Ionicons name="warning" size={14} color={colors.alert} />
          <Text style={[styles.powerHint, { color: colors.alert, fontWeight: '700' }]}>
            {data.neverSeen} {tt('SOS ऐसे हैं जिन्हें किसी अधिकारी ने अब तक खोला ही नहीं')}
          </Text>
        </View>
      )}

      {data.byStation?.length > 0 && (
        <>
          <Text style={styles.powerSubTitle}>{tt('थाना-वार (सबसे चिंताजनक ऊपर)')}</Text>
          {data.byStation.slice(0, 10).map((s, i) => (
            <View key={i} style={styles.victimRow}>
              <Text style={styles.victimRef}>{tt(s.station)} · {tt(s.district)}</Text>
              <Text style={styles.victimMeta}>
                {s.totalSos} SOS{s.neverSeen > 0 ? ` · ${s.neverSeen} ${tt('अनदेखे')}` : ''}
                {s.avgMinutes != null ? ` · ${s.avgMinutes} ${tt('मिनट औसत')}` : ''}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function SosStat({ label, value, danger }) {
  return (
    <View style={styles.sosStat}>
      <Text style={[styles.sosStatValue, danger && { color: colors.alert }]}>{value}</Text>
      <Text style={styles.sosStatLabel}>{label}</Text>
    </View>
  );
}

// बार-बार शिकायत करने वाली पीड़िताएं — बढ़ते ख़तरे का संकेत।
// 🔒 यहाँ पहचान कभी नहीं दिखती (बैकएंड नाम/मोबाइल भेजता ही नहीं) — सिर्फ़ एक छोटा
// ref, गिनती और पैटर्न। अधिकारी को विवरण चाहिए तो वह शिकायत खोलकर देखे, जहाँ
// सामान्य पहुँच-नियम लागू होते हैं।
function RepeatVictimsCard({ data, loading, error }) {
  if (loading) return <Text style={styles.powerHint}>{tt('लोड हो रहा है…')}</Text>;
  if (error) return <Text style={[styles.powerHint, { color: colors.alert }]}>{error}</Text>;
  if (!data) return null;
  if (!data.victims?.length) return <Text style={styles.powerHint}>{tt('इस दायरे में ऐसा कोई मामला नहीं मिला।')}</Text>;

  return (
    <View>
      <Text style={styles.powerHint}>
        {tt('एक ही व्यक्ति की कई शिकायतें अक्सर बढ़ते ख़तरे का संकेत होती हैं। निजता के लिए पहचान नहीं दिखाई जाती।')}
      </Text>
      {data.victims.slice(0, 15).map((v, i) => (
        <View key={i} style={styles.victimRow}>
          <Text style={styles.victimRef}>
            #{v.ref} · {v.complaintCount} {tt('शिकायतें')}
            {v.sosCount > 0 ? ` · SOS ${v.sosCount}` : ''}
          </Text>
          <Text style={styles.victimMeta}>
            {(v.categories || []).map((x) => tt(x)).join(', ')}
            {v.districts?.length ? ` · ${v.districts.map((d) => tt(d)).join(', ')}` : ''}
            {v.stillOpen > 0 ? ` · ${v.stillOpen} ${tt('अभी खुली')}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function OfficerWorkloadCard({ data, loading, error }) {
  if (loading) return <LoadingView />;
  if (error) return <ErrorRow message={error} />;
  if (!data || data.officers.length === 0) {
    return <Text style={styles.powerEmptyText}>{tt('कोई डेटा उपलब्ध नहीं।')}</Text>;
  }
  return (
    <View>
      <Text style={styles.powerHint}>{tt(`औसत सक्रिय मामले प्रति अधिकारी: ${data.averageActiveCases}`)}</Text>
      {data.officers.slice(0, 15).map((o) => (
        <View key={o.id} style={[styles.powerRow, o.overloaded && styles.powerRowBreached]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.powerRowTitle}>{o.name}</Text>
            <Text style={styles.powerRowSub}>{tt(o.station || '—')} · {tt(o.district || '—')}</Text>
          </View>
          <Text style={[styles.powerRowBadge, o.overloaded && { color: colors.alert }]}>
            {o.activeCases} {tt('सक्रिय')}{o.activeSos > 0 ? ` · SOS ${o.activeSos}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FilterPanelModal({
  visible, onClose, filterOptions,
  datePreset, setDatePreset, customFrom, setCustomFrom, customTo, setCustomTo,
  category, setCategory, status, setStatus, station, setStation, officerId, setOfficerId, onReset,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{tt('फ़िल्टर')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.inkGrey} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 480 }}>
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
              <TouchableOpacity
                style={[styles.pillBtn, datePreset === 'custom' && styles.pillBtnActive]}
                onPress={() => setDatePreset('custom')}
              >
                <Text style={[styles.pillBtnText, datePreset === 'custom' && styles.pillBtnTextActive]}>{tt('कस्टम')}</Text>
              </TouchableOpacity>
            </View>
            {datePreset === 'custom' && (
              <View style={styles.customDateRow}>
                <TextInput
                  style={styles.dateInput}
                  value={customFrom}
                  onChangeText={setCustomFrom}
                  placeholder="YYYY-MM-DD (से)"
                  placeholderTextColor={colors.inkLight}
                  maxLength={10}
                />
                <TextInput
                  style={styles.dateInput}
                  value={customTo}
                  onChangeText={setCustomTo}
                  placeholder="YYYY-MM-DD (तक)"
                  placeholderTextColor={colors.inkLight}
                  maxLength={10}
                />
              </View>
            )}

            {filterOptions?.categories?.length > 0 && (
              <>
                <Text style={styles.filterLabel}>{tt('श्रेणी')}</Text>
                <View style={styles.chipRow}>
                  {filterOptions.categories.map((c) => (
                    <TouchableOpacity key={c} style={[styles.pillBtn, category === c && styles.pillBtnActive]} onPress={() => setCategory(category === c ? null : c)}>
                      <Text style={[styles.pillBtnText, category === c && styles.pillBtnTextActive]} numberOfLines={1}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {filterOptions?.statuses?.length > 0 && (
              <>
                <Text style={styles.filterLabel}>{tt('स्थिति')}</Text>
                <View style={styles.chipRow}>
                  {filterOptions.statuses.map((s) => (
                    <TouchableOpacity key={s} style={[styles.pillBtn, status === s && styles.pillBtnActive]} onPress={() => setStatus(status === s ? null : s)}>
                      <Text style={[styles.pillBtnText, status === s && styles.pillBtnTextActive]} numberOfLines={1}>{tt(s)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {filterOptions?.stations?.length > 0 && (
              <>
                <Text style={styles.filterLabel}>{tt('थाना')}</Text>
                <View style={styles.chipRow}>
                  {filterOptions.stations.map((s) => (
                    <TouchableOpacity key={s} style={[styles.pillBtn, station === s && styles.pillBtnActive]} onPress={() => setStation(station === s ? null : s)}>
                      <Text style={[styles.pillBtnText, station === s && styles.pillBtnTextActive]} numberOfLines={1}>{tt(s)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {filterOptions?.officers?.length > 0 && (
              <>
                <Text style={styles.filterLabel}>{tt('अधिकारी')}</Text>
                <View style={styles.chipRow}>
                  {filterOptions.officers.map((o) => (
                    <TouchableOpacity key={o.id} style={[styles.pillBtn, officerId === o.id && styles.pillBtnActive]} onPress={() => setOfficerId(officerId === o.id ? null : o.id)}>
                      <Text style={[styles.pillBtnText, officerId === o.id && styles.pillBtnTextActive]} numberOfLines={1}>{o.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.resetBtn} onPress={onReset}>
              <Text style={styles.resetBtnText}>{tt('सब हटाएं')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={onClose}>
              <Text style={styles.applyBtnText}>{tt('लागू करें')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sosStatRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  sosStat: { flex: 1, backgroundColor: colors.sand, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  sosStatValue: { fontSize: 17, fontWeight: '800', color: colors.inkNavy },
  sosStatLabel: { fontSize: 10, color: colors.inkGrey, marginTop: 2, textAlign: 'center' },
  powerSubTitle: { fontSize: 12.5, fontWeight: '700', color: colors.inkNavy, marginTop: 12, marginBottom: 6 },
  victimRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  victimRef: { fontSize: 12.5, fontWeight: '700', color: colors.inkNavy },
  victimMeta: { fontSize: 11, color: colors.inkGrey, marginTop: 2 },
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  powerCard: { backgroundColor: colors.white, borderRadius: radius.md, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  powerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  powerTitle: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  powerBody: { paddingHorizontal: 14, paddingBottom: 14 },
  powerHint: { fontSize: 11, color: colors.inkGrey, marginBottom: 10, lineHeight: 15 },
  powerEmptyText: { fontSize: 12.5, color: colors.sage, fontWeight: '600' },
  powerErrorText: { fontSize: 12.5, color: colors.alert, fontWeight: '600' },
  inlineWarnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10 },
  powerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.sand, borderRadius: radius.sm, padding: 10, marginBottom: 6, gap: 8 },
  powerRowBreached: { backgroundColor: '#FDEDEA', borderWidth: 1, borderColor: colors.alert },
  powerRowTitle: { fontSize: 12.5, fontWeight: '700', color: colors.inkNavy },
  powerRowSub: { fontSize: 10.5, color: colors.inkGrey, marginTop: 2 },
  powerRowBadge: { fontSize: 11.5, fontWeight: '800', color: colors.shaktiMaroon },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.shaktiMaroon, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 14 },
  filterBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.white },
  filterBadge: { backgroundColor: colors.white, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  filterBadgeText: { fontSize: 10, fontWeight: '800', color: colors.shaktiMaroon },
  scopeNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: 10 },
  scopeNote: { flex: 1, fontSize: 11.5, color: colors.shaktiMaroon, fontWeight: '700' },
  explorerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.inkNavy,
    borderRadius: radius.md,
    padding: 13,
    marginTop: 12,
    marginBottom: 14,
  },
  explorerBannerTitle: { fontSize: 13.5, fontWeight: '700', color: colors.white },
  explorerBannerSub: { fontSize: 10.5, color: '#C9D4DE', marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.inkNavy, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  chipText: { fontSize: 11.5, color: colors.white, fontWeight: '600', maxWidth: 120 },
  clearAllBtn: { justifyContent: 'center', paddingHorizontal: 8 },
  clearAllText: { fontSize: 11.5, color: colors.alert, fontWeight: '700', textDecorationLine: 'underline' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16, marginTop: 8 },
  summaryCard: { width: '47%', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, borderLeftWidth: 4 },
  summaryValue: { fontSize: 20, fontWeight: '800', color: colors.inkNavy, marginTop: 6 },
  summaryLabel: { fontSize: 11, color: colors.inkGrey, marginTop: 2 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  changeText: { fontSize: 9.5, fontWeight: '700' },
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
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barTrack: { flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: '90%' },
  bar: { width: 5, borderRadius: 2, minHeight: 2 },
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
  hourChart: { flexDirection: 'row', alignItems: 'flex-end', height: 70, gap: 2 },
  hourCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  hourBar: { width: 4, borderRadius: 2, backgroundColor: colors.shaktiMaroon, minHeight: 4 },
  hourLabel: { fontSize: 7, color: colors.inkLight, marginTop: 3 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 18, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 16.5, fontWeight: '800', color: colors.inkNavy },
  filterLabel: { fontSize: 12, fontWeight: '700', color: colors.inkGrey, marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillBtn: { backgroundColor: colors.sand, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 13, maxWidth: 160 },
  pillBtnActive: { backgroundColor: colors.shaktiMaroon },
  pillBtnText: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey },
  pillBtnTextActive: { color: colors.white },
  customDateRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dateInput: {
    flex: 1,
    backgroundColor: colors.sand,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12.5,
    color: colors.inkNavy,
  },
  modalFooter: { flexDirection: 'row', gap: 10, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  resetBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border },
  resetBtnText: { fontSize: 13, fontWeight: '700', color: colors.inkGrey },
  applyBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.shaktiMaroon },
  applyBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },
});
