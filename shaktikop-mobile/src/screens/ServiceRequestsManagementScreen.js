import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Linking,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { tt } from '../context/LocaleContext';
import { usePreventScreenshot } from '../hooks/usePreventScreenshot';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { PrimaryButton } from '../components/Buttons';
import SafePicker from '../components/SafePicker';
import { formatDateTime, formatDateShort, formatDateTimeFull } from '../utils/datetime';
import { SERVICE_TYPES } from '../data/serviceRequests';

import { SkeletonList, LoadingView } from '../components/LoadingView';
const OTHER_COUNSELLOR = '__other__';
const STATUS_STYLE = {
  'अनुरोध प्राप्त': { bg: colors.marigold, icon: 'hourglass-outline' },
  'सत्र निर्धारित': { bg: colors.sage, icon: 'calendar' },
  'पूर्ण': { bg: colors.inkNavyLight, icon: 'checkmark-done' },
  'रद्द': { bg: colors.alert, icon: 'close-circle' },
};

const PRIORITY_STYLE = {
  'सामान्य': { bg: colors.inkLight, icon: 'remove-outline' },
  'उच्च': { bg: colors.marigold, icon: 'arrow-up' },
  'अति-आवश्यक': { bg: colors.alert, icon: 'flame' },
};

export default function ServiceRequestsManagementScreen({ route }) {
  // 🔒 इसमें सेवा-अनुरोध करने वाली महिलाओं के नाम, मोबाइल व पते दिखते हैं —
  // बाक़ी संवेदनशील स्क्रीनों की तरह यहाँ भी screenshot/recording रोकी जाती है
  usePreventScreenshot();
  const type = route?.params?.type || 'counselling';
  const cfg = SERVICE_TYPES[type] || SERVICE_TYPES.counselling;
  const {
    fetchCounsellingRequests,
    updateCounsellingRequest,
    fetchCounsellingStats,
    fetchCounsellingHistory,
    fetchServiceProviders,
  } = useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('अनुरोध प्राप्त');

  // सत्र तय करने का फ़ॉर्म
  const [editing, setEditing] = useState(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  // ⚠️ नया: पहले तिथि/समय सिर्फ़ टेक्स्ट टाइप करके भरने पड़ते थे (जैसे "2026-08-05")
  // — गलत फ़ॉर्मैट टाइप होने का ख़तरा था। अब असली कैलेंडर/घड़ी picker खुलता है।
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // date("YYYY-MM-DD")/time("HH:MM") स्ट्रिंग्स को picker के लिए Date ऑब्जेक्ट में बदलना
  const dateTimeToDate = () => {
    const now = new Date();
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      const [hh, mm] = (time || '09:00').split(':').map(Number);
      return new Date(y, (m || 1) - 1, d || 1, hh || 9, mm || 0);
    }
    return now;
  };
  const p2 = (n) => String(n).padStart(2, '0');
  const onDatePicked = (event, selected) => {
    setShowDatePicker(false);
    if (event.type === 'dismissed' || !selected) return;
    setDate(`${selected.getFullYear()}-${p2(selected.getMonth() + 1)}-${p2(selected.getDate())}`);
  };
  const onTimePicked = (event, selected) => {
    setShowTimePicker(false);
    if (event.type === 'dismissed' || !selected) return;
    setTime(`${p2(selected.getHours())}:${p2(selected.getMinutes())}`);
  };
  const [venue, setVenue] = useState('');
  const [counsellor, setCounsellor] = useState('');
  const [counsellorPick, setCounsellorPick] = useState(''); // dropdown से चुना गया मान (या OTHER_COUNSELLOR)
  const [providers, setProviders] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // उन्नत सुविधाएं
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  // 🐛 बग फ़िक्स: पहले हर keystroke पर तुरंत API कॉल जाता था — कमज़ोर नेटवर्क पर पुराने
  // keystroke का जवाब बाद में आकर नए, सही परिणाम को चुपचाप overwrite कर सकता था (search
  // "काम नहीं कर रही" जैसा महसूस होता)। अब टाइप करते ही input तो तुरंत अपडेट होता है,
  // पर असली खोज सिर्फ़ 400ms रुकने के बाद ही भेजी जाती है।
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [duration, setDuration] = useState('');
  const [history, setHistory] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [closing, setClosing] = useState(null); // सत्र बंद करने का फ़ॉर्म
  const [outcome, setOutcome] = useState('');
  const [attendance, setAttendance] = useState('');
  const [followUp, setFollowUp] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, s] = await Promise.all([
        fetchCounsellingRequests({ type, search: debouncedSearch.trim() || undefined, priority: priorityFilter || undefined }),
        fetchCounsellingStats({ type }).catch(() => null),
      ]);
      setList(Array.isArray(data) ? data : []);
      if (s) setStats(s);
    } catch (e) {
      // ignore
    }
    setLoading(false);
    setRefreshing(false);
  }, [fetchCounsellingRequests, fetchCounsellingStats, type, debouncedSearch, priorityFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // काउंसलर सूची — सिर्फ़ इसी सेवा-प्रकार व dropdown खुलने पर एक बार लोड होती है
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchServiceProviders({ type });
        if (alive) setProviders(Array.isArray(data) ? data : []);
      } catch (e) {
        // तालिका न बनी हो या permission न हो — dropdown खाली रहेगा, "अन्य" से टाइप कर सकते हैं
        if (alive) setProviders([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchServiceProviders, type]);

  const openEditor = (item) => {
    setEditing(item);
    if (item.scheduledAt) {
      const d = new Date(item.scheduledAt);
      const p = (n) => String(n).padStart(2, '0');
      setDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
      setTime(`${p(d.getHours())}:${p(d.getMinutes())}`);
    } else {
      setDate('');
      setTime('');
    }
    setVenue(item.venue || '');
    setCounsellor(item.counsellorName || '');
    const matched = providers.find((p) => p.name === item.counsellorName);
    setCounsellorPick(item.counsellorName ? (matched ? matched.name : OTHER_COUNSELLOR) : '');
    setNote(item.officerNote || '');
    setRescheduleReason('');
    setDuration(item.sessionDurationMin ? String(item.sessionDurationMin) : '');
  };

  const save = async () => {
    if (busy) return;
    if (!date.trim() || !time.trim()) {
      return Alert.alert(tt('जानकारी अधूरी है'), tt('कृपया सत्र की तिथि व समय दोनों भरें।'));
    }
    // YYYY-MM-DD व HH:MM की जाँच — गलत रूप डालने पर सर्वर पर अमान्य तिथि जाती थी
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) || !/^\d{2}:\d{2}$/.test(time.trim())) {
      return Alert.alert(tt('गलत प्रारूप'), tt('तिथि YYYY-MM-DD और समय HH:MM (24-घंटे) में लिखें।'));
    }
    const iso = new Date(`${date.trim()}T${time.trim()}:00`);
    if (isNaN(iso.getTime())) {
      return Alert.alert(tt('गलत प्रारूप'), tt('तिथि या समय सही नहीं है।'));
    }
    setBusy(true);
    try {
      const isReschedule = !!editing.scheduledAt;
      if (isReschedule && !rescheduleReason.trim()) {
        setBusy(false);
        return Alert.alert(tt('कारण आवश्यक है'), tt('सत्र की तिथि बदलने का कारण लिखें — यह नागरिक को भी बताया जाएगा।'));
      }
      await updateCounsellingRequest(editing.id, {
        scheduledAt: iso.toISOString(),
        venue: venue.trim() || null,
        counsellorName: counsellor.trim() || null,
        officerNote: note.trim() || null,
        sessionDurationMin: duration.trim() || null,
        status: 'सत्र निर्धारित',
        reason: rescheduleReason.trim() || null,
      });
      setEditing(null);
      await load();
      Alert.alert(tt('सत्र निर्धारित'), tt('नागरिक को सूचना भेज दी गई है।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  // प्राथमिकता बदलें — अति-आवश्यक मामले सूची में ऊपर आ जाते हैं
  const cyclePriority = async (item) => {
    const order = ['सामान्य', 'उच्च', 'अति-आवश्यक'];
    const next = order[(order.indexOf(item.priority || 'सामान्य') + 1) % order.length];
    try {
      await updateCounsellingRequest(item.id, { priority: next });
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
  };

  // सत्र बंद करना — उपस्थिति, परिणाम व फ़ॉलो-अप एक साथ
  const openClosing = (item) => {
    setClosing(item);
    setAttendance(item.attendance || '');
    setOutcome(item.outcome || '');
    setFollowUp(!!item.followUpNeeded);
    setDuration(item.sessionDurationMin ? String(item.sessionDurationMin) : '');
  };

  const saveClosing = async () => {
    if (!attendance) {
      return Alert.alert(tt('जानकारी अधूरी है'), tt('कृपया उपस्थिति दर्ज करें।'));
    }
    setBusy(true);
    try {
      await updateCounsellingRequest(closing.id, {
        attendance,
        outcome: outcome.trim() || null,
        followUpNeeded: followUp,
        sessionDurationMin: duration.trim() || null,
        status: attendance === 'उपस्थित' ? 'पूर्ण' : 'सत्र निर्धारित',
      });
      setClosing(null);
      await load();
      Alert.alert(tt('सुरक्षित हुआ'), tt('सत्र का विवरण दर्ज कर दिया गया है।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  // ऑडिट इतिहास — किसने क्या बदला
  const openHistory = async (item) => {
    setHistoryFor(item);
    setHistory(null);
    try {
      setHistory(await fetchCounsellingHistory(item.id));
    } catch (e) {
      setHistory([]);
    }
  };

  const changeStatus = async (item, status) => {
    try {
      await updateCounsellingRequest(item.id, { status });
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
  };

  const counts = {
    'अनुरोध प्राप्त': list.filter((i) => i.status === 'अनुरोध प्राप्त').length,
    'सत्र निर्धारित': list.filter((i) => i.status === 'सत्र निर्धारित').length,
    'पूर्ण': list.filter((i) => i.status === 'पूर्ण').length,
  };

  if (loading) {
    return (
      <SkeletonList rows={6} />
    );
  }

  const renderItem = ({ item }) => {
    const st = STATUS_STYLE[item.status] || STATUS_STYLE['अनुरोध प्राप्त'];
    const pri = PRIORITY_STYLE[item.priority || 'सामान्य'] || PRIORITY_STYLE['सामान्य'];
    const waitDays = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86400000);
    return (
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.cid}>{item.id}</Text>
          {/* प्राथमिकता — दबाकर बदली जा सकती है */}
          <TouchableOpacity
            style={[styles.priPill, { backgroundColor: pri.bg }]}
            onPress={() => cyclePriority(item)}
          >
            <Ionicons name={pri.icon} size={10} color={colors.white} />
            <Text style={styles.priText}>{tt(item.priority || 'सामान्य')}</Text>
          </TouchableOpacity>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Ionicons name={st.icon} size={11} color={colors.white} />
            <Text style={styles.badgeText}>{tt(item.status)}</Text>
          </View>
        </View>

        {/* 7 दिन से ज़्यादा लंबित — तुरंत ध्यान चाहिए */}
        {item.status === 'अनुरोध प्राप्त' && waitDays >= 7 && (
          <View style={styles.slaWarn}>
            <Ionicons name="warning-outline" size={13} color={colors.alert} />
            <Text style={styles.slaWarnText}>
              {waitDays} {tt('दिन से लंबित — तुरंत सत्र तय करें')}
            </Text>
          </View>
        )}

        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>
          {item.fatherName ? `${tt('पिता/पति')}: ${item.fatherName} · ` : ''}
          {[item.policeStation, item.district].filter(Boolean).map(tt).join(', ')}
        </Text>

        {(item.age || item.gender || item.education || item.address) && (
          <Text style={styles.extraMeta}>
            {[
              item.age ? `${tt('उम्र')}: ${item.age}` : null,
              item.gender ? tt(item.gender) : null,
              item.education ? tt(item.education) : null,
              item.address || null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}

        <View style={styles.reasonBox}>
          <Text style={styles.reason}>{tt(item.reasonKey || '—')}</Text>
          {item.reasonDetail ? <Text style={styles.detail}>{item.reasonDetail}</Text> : null}
        </View>

        {item.scheduledAt ? (
          <View style={styles.scheduleBox}>
            <Ionicons name="calendar-outline" size={14} color={colors.sage} />
            <View style={{ flex: 1 }}>
              <Text style={styles.scheduleText}>
                {formatDateTime(item.scheduledAt)}
                {item.venue ? ` · ${item.venue}` : ''}
              </Text>
              {item.counsellorName ? <Text style={styles.subMeta}>{item.counsellorName}</Text> : null}
              {item.rescheduleCount > 0 && (
                <Text style={styles.reschedTag}>
                  {tt('तिथि बदली गई')}: {item.rescheduleCount} {tt('बार')}
                </Text>
              )}
              {item.attendance ? (
                <Text style={[styles.attTag, item.attendance === 'अनुपस्थित' && { color: colors.alert }]}>
                  {tt(item.attendance)}
                  {item.sessionDurationMin ? ` · ${item.sessionDurationMin} ${tt('मिनट')}` : ''}
                </Text>
              ) : null}
              {item.followUpNeeded && <Text style={styles.followTag}>{tt('फ़ॉलो-अप आवश्यक')}</Text>}
            </View>
          </View>
        ) : null}
        {item.outcome ? <Text style={styles.outcomeText}>{item.outcome}</Text> : null}

        <Text style={styles.created}>
          {tt('अनुरोध दिनांक')}: {formatDateShort(item.createdAt)}
        </Text>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${item.mobile}`)}>
            <Ionicons name="call" size={13} color={colors.white} />
            <Text style={styles.actionText}>{tt('कॉल करें')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.inkNavy }]} onPress={() => openEditor(item)}>
            <Ionicons name="calendar" size={13} color={colors.white} />
            <Text style={styles.actionText}>
              {item.scheduledAt ? tt('सत्र बदलें') : tt('सत्र निर्धारित करें')}
            </Text>
          </TouchableOpacity>
          {item.status === 'सत्र निर्धारित' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.sage, flex: 0, paddingHorizontal: 12 }]}
              onPress={() => openClosing(item)}
            >
              <Ionicons name="checkmark-done" size={14} color={colors.white} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.inkLight, flex: 0, paddingHorizontal: 11 }]}
            onPress={() => openHistory(item)}
          >
            <Ionicons name="time-outline" size={14} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* आंकड़े — DSP को एक नज़र में तस्वीर मिल जाए (छोटे, रंगीन कार्ड — आइकन के साथ) */}
      {stats && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statScroll}
          contentContainerStyle={styles.statRow}
        >
          <View style={[styles.statCard, { backgroundColor: stats.urgent_pending > 0 ? colors.alert : '#F06292' }]}>
            <Ionicons name="alert-circle" size={16} color={colors.white} />
            <Text style={styles.statNum}>{stats.urgent_pending}</Text>
            <Text style={styles.statLabel}>{tt('अति-आवश्यक लंबित')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: stats.overdue > 0 ? '#8C1A0F' : '#C98A2B' }]}>
            <Ionicons name="time" size={16} color={colors.white} />
            <Text style={styles.statNum}>{stats.overdue}</Text>
            <Text style={styles.statLabel}>{tt('7+ दिन लंबित')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#1B4A73' }]}>
            <Ionicons name="hourglass" size={16} color={colors.white} />
            <Text style={styles.statNum}>{stats.avg_wait_days}</Text>
            <Text style={styles.statLabel}>{tt('औसत प्रतीक्षा (दिन)')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#6A4C93' }]}>
            <Ionicons name="close-circle" size={16} color={colors.white} />
            <Text style={styles.statNum}>{stats.no_show}</Text>
            <Text style={styles.statLabel}>{tt('अनुपस्थित रहे')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.sage }]}>
            <Ionicons name="repeat" size={16} color={colors.white} />
            <Text style={styles.statNum}>{stats.follow_up}</Text>
            <Text style={styles.statLabel}>{tt('फ़ॉलो-अप बाकी')}</Text>
          </View>
        </ScrollView>
      )}

      {/* खोज व प्राथमिकता फ़िल्टर */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={15} color={colors.inkLight} />
        <TextInput
          style={styles.searchInput}
          placeholder={tt('नाम, मोबाइल या ID से खोजें')}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          maxLength={100}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => { setSearch(''); load(); }}>
            <Ionicons name="close-circle" size={16} color={colors.inkLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.priScroll}
        contentContainerStyle={styles.priRow}
      >
        {['', 'अति-आवश्यक', 'उच्च', 'सामान्य'].map((p) => (
          <TouchableOpacity
            key={p || 'all'}
            style={[styles.priChip, priorityFilter === p && styles.priChipActive]}
            onPress={() => setPriorityFilter(p)}
          >
            <Text style={[styles.priChipText, priorityFilter === p && styles.priChipTextActive]}>
              {p ? tt(p) : tt('सभी प्राथमिकता')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.tabRow}>
        {['अनुरोध प्राप्त', 'सत्र निर्धारित', 'पूर्ण'].map((s) => (
          <TouchableOpacity key={s} style={[styles.tab, tab === s && styles.tabActive]} onPress={() => setTab(s)}>
            <Text style={[styles.tabText, tab === s && styles.tabTextActive]} numberOfLines={1}>
              {tt(s)} ({counts[s] || 0})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={list.filter((i) => i.status === tab)}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.shaktiMaroon}
            colors={[colors.shaktiMaroon]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={cfg.icon} size={32} color={colors.inkLight} />
            <Text style={styles.emptyText}>{tt('इस श्रेणी में कोई अनुरोध नहीं।')}</Text>
          </View>
        }
      />

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tt(cfg.label)} — {tt('समय निर्धारित करें')}</Text>
            <Text style={styles.modalSub}>{editing?.name} · {editing?.mobile}</Text>

            <ScrollView style={{ maxHeight: 340 }}>
              <Text style={styles.label}>{tt('तिथि')}</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={17} color={colors.shaktiMaroon} />
                <Text style={styles.pickerBtnText}>{date ? formatDateShort(date) : tt('तिथि चुनें')}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={dateTimeToDate()}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={onDatePicked}
                />
              )}

              <Text style={styles.label}>{tt('समय')}</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
                <Ionicons name="time-outline" size={17} color={colors.shaktiMaroon} />
                <Text style={styles.pickerBtnText}>{time || tt('समय चुनें')}</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker
                  value={dateTimeToDate()}
                  mode="time"
                  is24Hour
                  onChange={onTimePicked}
                />
              )}

              <Text style={styles.label}>{tt('स्थान')}</Text>
              <TextInput
                style={styles.input}
                value={venue}
                onChangeText={setVenue}
                placeholder={tt('जैसे — महिला हेल्प डेस्क, हजरतगंज')}
                maxLength={150}
              />

              <Text style={styles.label}>{tt('काउंसलर का नाम')}</Text>
              {providers.length > 0 ? (
                <>
                  <View style={styles.pickerWrap}>
                    <SafePicker
                      selectedValue={counsellorPick}
                      onValueChange={(v) => {
                        setCounsellorPick(v);
                        if (v !== OTHER_COUNSELLOR) setCounsellor(v);
                        else setCounsellor('');
                      }}
                      items={[
                        { label: tt('चुनें'), value: '' },
                        ...providers.map((p) => ({
                          label: `${p.name}${p.designation ? ' — ' + p.designation : ''}${p.venue ? ' · ' + p.venue : ''}`,
                          value: p.name,
                        })),
                        { label: tt('अन्य (नाम लिखें)'), value: OTHER_COUNSELLOR },
                      ]}
                    />
                  </View>
                  {counsellorPick === OTHER_COUNSELLOR && (
                    <TextInput
                      style={[styles.input, { marginTop: 8 }]}
                      value={counsellor}
                      onChangeText={setCounsellor}
                      placeholder={tt('काउंसलर का नाम लिखें')}
                      maxLength={80}
                    />
                  )}
                </>
              ) : (
                <>
                  <TextInput style={styles.input} value={counsellor} onChangeText={setCounsellor} maxLength={80} />
                  <Text style={styles.hintSmall}>
                    {tt('सूची खाली है — Super Admin "काउंसलर प्रबंधन" से सूची बना सकते हैं, तब यहाँ dropdown दिखेगा।')}
                  </Text>
                </>
              )}

              <Text style={styles.label}>{tt('सत्र की अवधि (मिनट)')}</Text>
              <TextInput
                style={styles.input}
                value={duration}
                onChangeText={(v) => setDuration(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="45"
                maxLength={3}
              />

              <Text style={styles.label}>{tt('नागरिक के लिए संदेश (वैकल्पिक)')}</Text>
              <TextInput
                style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={1000}
              />

              {/* पहले से तिथि तय हो तो बदलने का कारण अनिवार्य */}
              {editing?.scheduledAt ? (
                <View style={styles.reschedBox}>
                  <Text style={styles.reschedLabel}>
                    {tt('तिथि बदलने का कारण')} *
                  </Text>
                  <Text style={styles.reschedHint}>
                    {tt('यह कारण नागरिक को भी सूचना में भेजा जाएगा')}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={rescheduleReason}
                    onChangeText={setRescheduleReason}
                    placeholder={tt('जैसे — काउंसलर की अनुपलब्धता')}
                    maxLength={300}
                  />
                </View>
              ) : null}
            </ScrollView>

            <PrimaryButton
              title={busy ? tt('सुरक्षित हो रहा है…') : tt('सत्र निर्धारित करें')}
              onPress={save}
              loading={busy}
              style={{ marginTop: 12 }}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setEditing(null)}>
              <Text style={styles.modalCloseText}>{tt('रद्द करें')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* सत्र बंद करना — उपस्थिति, परिणाम, फ़ॉलो-अप */}
      <Modal visible={!!closing} transparent animationType="slide" onRequestClose={() => setClosing(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tt('सत्र का विवरण दर्ज करें')}</Text>
            <Text style={styles.modalSub}>{closing?.name} · {closing?.id}</Text>

            <ScrollView style={{ maxHeight: 340 }}>
              <Text style={styles.label}>{tt('उपस्थिति')} *</Text>
              <View style={styles.attRow}>
                {['उपस्थित', 'अनुपस्थित'].map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={[
                      styles.attBtn,
                      attendance === a && (a === 'उपस्थित' ? styles.attBtnYes : styles.attBtnNo),
                    ]}
                    onPress={() => setAttendance(a)}
                  >
                    <Ionicons
                      name={a === 'उपस्थित' ? 'checkmark-circle' : 'close-circle'}
                      size={16}
                      color={attendance === a ? colors.white : colors.inkLight}
                    />
                    <Text style={[styles.attBtnText, attendance === a && { color: colors.white }]}>{tt(a)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>{tt('सत्र की अवधि (मिनट)')}</Text>
              <TextInput
                style={styles.input}
                value={duration}
                onChangeText={(v) => setDuration(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="45"
                maxLength={3}
              />

              <Text style={styles.label}>{tt('सत्र का परिणाम / निष्कर्ष')}</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={outcome}
                onChangeText={setOutcome}
                multiline
                placeholder={tt('क्या चर्चा हुई, क्या सलाह दी गई…')}
                maxLength={1000}
              />

              <TouchableOpacity style={styles.followRow} onPress={() => setFollowUp(!followUp)}>
                <Ionicons
                  name={followUp ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={followUp ? colors.sage : colors.inkLight}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.followLabel}>{tt('अगला सत्र आवश्यक है')}</Text>
                  <Text style={styles.followHint}>{tt('फ़ॉलो-अप सूची में दिखेगा')}</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>

            <PrimaryButton
              title={busy ? tt('सुरक्षित हो रहा है…') : tt('विवरण सुरक्षित करें')}
              onPress={saveClosing}
              loading={busy}
              style={{ marginTop: 12 }}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setClosing(null)}>
              <Text style={styles.modalCloseText}>{tt('रद्द करें')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ऑडिट इतिहास */}
      <Modal visible={!!historyFor} transparent animationType="slide" onRequestClose={() => setHistoryFor(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tt('बदलावों का इतिहास')}</Text>
            <Text style={styles.modalSub}>{historyFor?.id}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {history === null ? (
                <Text style={styles.muted}>{tt('लोड हो रहा है…')}</Text>
              ) : history.length === 0 ? (
                <Text style={styles.muted}>{tt('कोई बदलाव दर्ज नहीं।')}</Text>
              ) : (
                history.map((h, i) => (
                  <View key={i} style={styles.hRow}>
                    <View style={styles.hDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hAction}>{tt(ACTION_LABEL[h.action] || h.action)}</Text>
                      <Text style={styles.hTime}>{formatDateTimeFull(h.createdAt)}</Text>
                      <Text style={styles.hActor}>
                        {h.actorName || '—'}{h.actorRole ? ` · ${tt(h.actorRole)}` : ''}
                      </Text>
                      {h.fromValue || h.toValue ? (
                        <Text style={styles.hChange}>
                          {h.fromValue ? `${tt(h.fromValue)} → ` : ''}{tt(h.toValue || '')}
                        </Text>
                      ) : null}
                      {h.reason ? <Text style={styles.hReason}>{tt('कारण')}: {h.reason}</Text> : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setHistoryFor(null)}>
              <Text style={styles.modalCloseText}>{tt('बंद करें')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ACTION_LABEL = {
  created: 'अनुरोध दर्ज हुआ',
  scheduled: 'सत्र निर्धारित किया',
  rescheduled: 'तिथि बदली गई',
  attendance: 'उपस्थिति दर्ज की',
  priority: 'प्राथमिकता बदली',
  closed: 'स्थिति बदली',
  cancelled: 'अनुरोध रद्द किया',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  // 🐛 बग फ़िक्स (लेबल गायब हो जाना): यहाँ maxHeight: 78 लगी थी, जबकि अंदर का कार्ड
  // ही 66 ऊँचा है और ऊपर-नीचे 16 padding — यानी कुल 82। 4px पहले से कट रहा था, और
  // उपयोगकर्ता के फ़ोन में सिस्टम का फ़ॉन्ट-आकार बड़ा हो तो लेबल पूरी तरह कट जाता।
  // इसीलिए स्क्रीनशॉट में कार्ड पर सिर्फ़ आइकन और संख्या दिखती थी, "Urgent pending"
  // जैसे लेबल नहीं। अब ऊँचाई सामग्री से तय होती है, इसलिए फ़ॉन्ट चाहे जितना बड़ा हो,
  // लेबल हमेशा पूरा दिखेगा।
  statScroll: { flexGrow: 0 },
  statRow: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, gap: 7, alignItems: 'flex-start' },
  statCard: { borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center', minWidth: 68, minHeight: 66, justifyContent: 'center' },
  statNum: { fontSize: 15, fontWeight: '800', color: colors.white, marginTop: 2 },
  statLabel: { fontSize: 8.5, color: 'rgba(255,255,255,0.9)', marginTop: 1, textAlign: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, marginHorizontal: 12, marginTop: 10, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 13, color: colors.inkNavy, padding: 0 },
  // 🐛 बग फ़िक्स: पहले इस ScrollView की खुद की कोई height तय नहीं थी (सिर्फ़
  // contentContainerStyle था) — इसलिए chips उपलब्ध खाली vertical जगह भरने के लिए
  // लंबे column जैसे stretch हो जाते थे। अब ScrollView की height तय है और
  // alignItems: 'center' से chips हमेशा compact, बीच में align रहेंगे।
  // 🐛 वही चूक यहाँ भी: maxHeight: 46 में chip (padding 12 + text) मुश्किल से आता था।
  // सिस्टम फ़ॉन्ट बड़ा होने पर text ऊपर-नीचे से कट जाता और सिर्फ़ अक्षरों के टुकड़े
  // (बिंदु जैसे) दिखते — "All priorities/Urgent/High/Normal" पढ़ा ही नहीं जाता था।
  priScroll: { flexGrow: 0 },
  priRow: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 6, alignItems: 'center' },
  priChip: { alignSelf: 'center', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  priChipActive: { backgroundColor: colors.shaktiMaroon, borderColor: colors.shaktiMaroon },
  priChipText: { fontSize: 10.5, fontWeight: '700', color: colors.inkGrey },
  priChipTextActive: { color: colors.white },
  priPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9 },
  priText: { fontSize: 9, fontWeight: '800', color: colors.white },
  slaWarn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF1EE', borderRadius: radius.sm, padding: 7, marginTop: 7 },
  slaWarnText: { fontSize: 10.5, color: colors.alert, fontWeight: '800' },
  subMeta: { fontSize: 11, color: colors.inkLight, marginTop: 2 },
  reschedTag: { fontSize: 10, color: colors.marigold, fontWeight: '700', marginTop: 2 },
  attTag: { fontSize: 10.5, color: colors.sage, fontWeight: '800', marginTop: 2 },
  followTag: { fontSize: 10, color: colors.shaktiMaroon, fontWeight: '700', marginTop: 2 },
  outcomeText: { fontSize: 11.5, color: colors.inkGrey, marginTop: 7, lineHeight: 16, fontStyle: 'italic' },
  reschedBox: { backgroundColor: '#FFF8E6', borderRadius: radius.sm, padding: 10, marginTop: 10 },
  reschedLabel: { fontSize: 11.5, fontWeight: '800', color: '#B26A00' },
  reschedHint: { fontSize: 10, color: colors.inkLight, marginTop: 2, marginBottom: 4 },
  attRow: { flexDirection: 'row', gap: 9, marginTop: 4 },
  attBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border },
  attBtnYes: { backgroundColor: colors.sage, borderColor: colors.sage },
  attBtnNo: { backgroundColor: colors.alert, borderColor: colors.alert },
  attBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.inkGrey },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginTop: 4 },
  followLabel: { fontSize: 13, fontWeight: '700', color: colors.inkNavy },
  followHint: { fontSize: 10.5, color: colors.inkLight, marginTop: 1 },
  muted: { fontSize: 12.5, color: colors.inkLight, fontStyle: 'italic', paddingVertical: 14 },
  hRow: { flexDirection: 'row', gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F2EFE9' },
  hDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.shaktiMaroon, marginTop: 5 },
  hAction: { fontSize: 12.5, fontWeight: '800', color: colors.inkNavy },
  hTime: { fontSize: 10.5, color: colors.shaktiMaroon, fontWeight: '700', marginTop: 1 },
  hActor: { fontSize: 10.5, color: colors.inkLight, marginTop: 1 },
  hChange: { fontSize: 11, color: colors.inkGrey, marginTop: 2 },
  hReason: { fontSize: 10.5, color: colors.inkGrey, marginTop: 2, fontStyle: 'italic' },
  tabRow: { flexDirection: 'row', gap: 6, padding: 12, paddingBottom: 0 },
  tab: { flex: 1, paddingVertical: 9, paddingHorizontal: 4, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.inkNavy, borderColor: colors.inkNavy },
  tabText: { fontSize: 10.5, fontWeight: '700', color: colors.inkGrey },
  tabTextActive: { color: colors.white },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 11, marginBottom: 9, borderWidth: 1, borderColor: colors.border },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cid: { flex: 1, fontSize: 11.5, fontWeight: '800', color: colors.inkNavy },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 9.5, fontWeight: '800', color: colors.white },
  name: { fontSize: 13.5, fontWeight: '800', color: colors.inkNavy, marginTop: 5 },
  meta: { fontSize: 11, color: colors.inkLight, marginTop: 1 },
  extraMeta: { fontSize: 11, color: colors.inkGrey, marginTop: 3, lineHeight: 15 },
  reasonBox: { backgroundColor: colors.sand, borderRadius: radius.sm, padding: 8, marginTop: 6 },
  reason: { fontSize: 12, fontWeight: '700', color: colors.inkNavy },
  detail: { fontSize: 11, color: colors.inkGrey, marginTop: 3, lineHeight: 15 },
  scheduleBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F4F9F6', borderRadius: radius.sm, padding: 7, marginTop: 6 },
  scheduleText: { flex: 1, fontSize: 11.5, fontWeight: '600', color: colors.inkNavy },
  created: { fontSize: 10, color: colors.inkLight, marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.shaktiMaroon, paddingVertical: 6, borderRadius: radius.md },
  actionText: { fontSize: 11, fontWeight: '700', color: colors.white },
  empty: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { fontSize: 13, color: colors.inkGrey, marginTop: 10 },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,42,68,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16 },
  modalTitle: { fontSize: 15.5, fontWeight: '800', color: colors.inkNavy },
  modalSub: { fontSize: 12, color: colors.inkLight, marginTop: 3, marginBottom: 10 },
  label: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey, marginBottom: 5, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, color: colors.inkNavy },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 11 },
  pickerBtnText: { fontSize: 13, color: colors.inkNavy, fontWeight: '600' },
  pickerWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.white, overflow: 'hidden' },
  hintSmall: { fontSize: 10, color: colors.inkLight, marginTop: 4, fontStyle: 'italic' },
  modalClose: { alignItems: 'center', paddingVertical: 11 },
  modalCloseText: { fontSize: 13, fontWeight: '700', color: colors.inkGrey },
});
