import React, { useState, useEffect, useCallback, useRef } from 'react';
import { tt } from '../context/LocaleContext';
import { usePreventScreenshot } from '../hooks/usePreventScreenshot';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Animated,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { colors, radius } from '../theme/colors';
import { ALL_STATUSES, CATEGORY_DEFS } from '../data/constants';
import { DISTRICTS, stationsForDistrict } from '../data/districts';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import LiveLocationStatus from '../components/LiveLocationStatus';
import EmptyState from '../components/EmptyState';

import { formatDate, formatTimeFull } from '../utils/datetime';
// 🐛 बग फ़िक्स: id व name कॉलम की चौड़ाई नई (लंबी, random-format) शिकायत-ID और
// लंबे नाम/उपनाम वाले पीड़िताओं के लिए थोड़ी तंग पड़ रही थी — text कट सकता था
// (ellipsis "…" दिखता)। id थोड़ा चौड़ा किया, name के लिए 1 की जगह 2 पंक्तियाँ दीं।
const COL = { id: 128, cat: 140, name: 110, mobile: 105, status: 100, liveLoc: 165, date: 150, actions: 150 };
const TABLE_WIDTH = Object.values(COL).reduce((a, b) => a + b, 0);

// 🐛 बग फ़िक्स: टेबल के कॉलम हमेशा एक तय (fixed) कुल चौड़ाई (TABLE_WIDTH) में बनते
// थे — फ़ोन पर सही फ़िट बैठते, पर टैबलेट/landscape जैसी चौड़ी स्क्रीन पर टेबल स्क्रीन
// के बाईं तरफ़ सिमटा रहता, दाईं तरफ़ बहुत सारी खाली जगह बच जाती (देखें उपयोगकर्ता की
// स्क्रीनशॉट — "perfect" नहीं दिखता था)। अब अगर स्क्रीन टेबल की न्यूनतम चौड़ाई से
// ज़्यादा चौड़ी हो, तो हर कॉलम अनुपात में बड़ा होकर पूरी उपलब्ध जगह भरता है — संकरी
// (फ़ोन) स्क्रीन पर पहले जैसा ही व्यवहार (क्षैतिज स्क्रॉल) बना रहता है।
function scaleColumns(availableWidth) {
  if (!availableWidth || availableWidth <= TABLE_WIDTH) {
    return { col: COL, width: TABLE_WIDTH };
  }
  const factor = availableWidth / TABLE_WIDTH;
  const col = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, Math.round(v * factor)]));
  return { col, width: Object.values(col).reduce((a, b) => a + b, 0) };
}

// तालिका में तारीख़-समय — हमेशा अंग्रेज़ी में, दो पंक्तियों में
// 28/07/2026
// 10:10:40 AM
function formatTableDateTime(value) {
  return `${formatDate(value)}\n${formatTimeFull(value)}`;
}

// टेबल लोड होते समय plain spinner की जगह हल्के pulse करते हुए grey placeholder rows दिखाते हैं
function TableSkeleton() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ padding: 16 }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Animated.View key={i} style={[skeletonStyles.row, { opacity: pulse }]}>
          <View style={[skeletonStyles.block, { width: 70 }]} />
          <View style={[skeletonStyles.block, { width: 90 }]} />
          <View style={[skeletonStyles.block, { width: 60, marginLeft: 'auto' }]} />
        </Animated.View>
      ))}
    </View>
  );
}
const skeletonStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  block: { height: 14, borderRadius: 6, backgroundColor: '#EFE3E8' },
});

export default function AllComplaintsScreen({ navigation, route }) {
  // 🔒 यह टेबल कई पीड़िताओं के नाम/मोबाइल एक साथ दिखाती है
  usePreventScreenshot();
  const { width: windowWidth } = useWindowDimensions();
  // ड्रॉवर/साइड-पैडिंग के लिए मोटा-मोटा हिसाब — असली उपलब्ध जगह इससे थोड़ी कम होती है
  const { col: COL_S, width: TABLE_WIDTH_S } = scaleColumns(windowWidth - 32);
  const { queryComplaints, officers, transferOfficers, assign, user, districtsVersion } = useApp();
  const isMonitor = user?.adminRole === 'monitor';
  const isSHO = user?.role === 'officer' && user?.rank === 'SHO';
  const canAssign = (user?.role === 'admin' && !isMonitor) || isSHO;
  // 🐛 बग फ़िक्स: यहाँ पहले हमेशा `officers` (सिर्फ़ admin के लिए fetch होती है) इस्तेमाल
  // होती थी — SHO के लिए यह हमेशा खाली रहती, इसलिए "Assign" बटन दिखता तो था (canAssign
  // में SHO शामिल था) पर उसके अंदर का dropdown खाली होता — कोई अधिकारी चुना ही नहीं जा
  // सकता था। अब SHO के लिए पहले से मौजूद `transferOfficers` सूची इस्तेमाल होती है,
  // अपने ही थाने के अधिकारियों तक सीमित (backend भी यही नियम लागू करता है)।
  const assignableOfficers = user?.role === 'admin'
    ? officers
    : isSHO
    ? transferOfficers.filter((o) => (o.station || '').trim().toLowerCase() === (user?.station || '').trim().toLowerCase())
    : [];
  const [status, setStatus] = useState(route.params?.status || '');
  const [category, setCategory] = useState(route.params?.category || '');
  const [officerId, setOfficerId] = useState('');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);
  // तिथि की डिफ़ॉल्ट सीमा — 1 जनवरी 2026 से लेकर आज तक (आज की तारीख़ अपने-आप बदलती रहती है)
  const todayStr = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(route.params?.dateFrom || '2026-01-01');
  const [dateTo, setDateTo] = useState(route.params?.dateTo || todayStr);
  const [fDistrict, setFDistrict] = useState('');
  const [fStation, setFStation] = useState('');
  const [sosOnly, setSosOnly] = useState(route.params?.sosOnly || false);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  // 🆕 पेज-आधारित navigation — हर स्क्रीन पर ज़्यादा-से-ज़्यादा 100 शिकायतें, "अगला"
  // दबाने पर अगली 100 (मौजूदा सूची में जुड़ती नहीं, उसकी जगह लेती है)। बैकएंड में
  // सर्वर के भारी पड़ने से बचाव के लिए पहले से एक पेज-सीमा जुड़ी है — यह उसी के
  // साथ काम करता है।
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0); // 0-आधारित — पेज 0 = पहला पन्ना
  const [hasNextPage, setHasNextPage] = useState(false);

  const [assignModal, setAssignModal] = useState(null); // शिकायत object जिसे assign करना है
  const [assignOfficerId, setAssignOfficerId] = useState(assignableOfficers[0]?.id || null);
  const [assignBusy, setAssignBusy] = useState(false);

  const loadPage = useCallback(
    async (targetPage) => {
      setLoading(true);
      try {
        const data = await queryComplaints({
          status, category, officerId, sort, search: debouncedSearch, dateFrom, dateTo,
          district: fDistrict || undefined, policeStation: fStation || undefined, sosOnly: sosOnly || undefined,
          limit: PAGE_SIZE + 1, offset: targetPage * PAGE_SIZE, // 1 ज़्यादा मांगते हैं — सिर्फ़ यह जानने के लिए कि "अगला" पेज है या नहीं, दिखाते हमेशा 100 ही हैं
        });
        setHasNextPage(data.length > PAGE_SIZE);
        setList(data.slice(0, PAGE_SIZE));
        setPage(targetPage);
      } catch (e) {
        // चुपचाप छोड़ें, नीचे empty state दिखेगा
      }
      setLoading(false);
    },
    [status, category, officerId, sort, debouncedSearch, dateFrom, dateTo, fDistrict, fStation, sosOnly, queryComplaints]
  );

  const load = useCallback(() => loadPage(0), [loadPage]); // फ़िल्टर बदलने पर हमेशा पहले पन्ने से शुरू
  const goNextPage = () => loadPage(page + 1);
  const goPrevPage = () => loadPage(Math.max(0, page - 1));

  useEffect(() => {
    load();
  }, [load]);

  // ⚠️ useState सिर्फ़ पहली बार route.params पढ़ता है। डैशबोर्ड के कार्ड से दोबारा आने पर
  // यह स्क्रीन पहले से खुली रहती है, इसलिए नया filter लागू ही नहीं होता था —
  // "लंबित" दबाने के बाद "नियुक्त" दबाने पर भी पुरानी सूची ही दिखती रहती थी।
  // अब हर बार params बदलने पर filters ताज़ा हो जाते हैं।
  useEffect(() => {
    const p = route.params || {};
    setStatus(p.status || '');
    setCategory(p.category || '');
    setOfficerId(p.officerId || '');
    setFDistrict(p.district || '');
    setFStation(p.policeStation || '');
    setSosOnly(!!p.sosOnly);
    setDateFrom(p.dateFrom || '2026-01-01');
    setDateTo(p.dateTo || new Date().toISOString().slice(0, 10));
    setSearch('');
  }, [route.params]);

  const clearFilters = () => {
    setStatus('');
    setCategory('');
    setOfficerId('');
    setSort('newest');
    setSearch('');
    setFDistrict('');
    setFStation('');
    // तिथि डिफ़ॉल्ट पर लौटती है — 1 जनवरी 2026 से आज तक
    setDateFrom('2026-01-01');
    setDateTo(new Date().toISOString().slice(0, 10));
  };

  const openAssign = (complaint) => {
    setAssignOfficerId(assignableOfficers[0]?.id || null);
    setAssignModal(complaint);
  };

  const submitAssign = async () => {
    if (assignBusy) return;
    if (!assignOfficerId) {
      Alert.alert(tt('कोई अधिकारी उपलब्ध नहीं'));
      return;
    }
    setAssignBusy(true);
    try {
      await assign(assignModal.id, assignOfficerId);
      setAssignModal(null);
      load();
      Alert.alert(tt('अधिकारी नियुक्त किया गया'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setAssignBusy(false);
  };

  // ---------- निर्यात (कई formats) ----------
  const buildRows = () =>
    list.map((c) => ({
      id: c.id,
      category: c.category,
      status: c.status,
      district: c.district || '—',
      policeStation: c.policeStation || '—',
      victimName: c.victimName,
      victimMobile: c.victimMobile || '—',
      officer: c.officer || '—',
      date: formatDate(c.createdAt),
    }));

  const exportCsv = async () => {
    setExportMenuOpen(false);
    // 🔒 सुरक्षा: UI बटन के अलावा यहाँ भी जांच — सिर्फ़ Admin
    if (user?.role !== 'admin') return;

    if (list.length === 0) return Alert.alert(tt('कुछ भी नहीं है'), tt('निर्यात के लिए कोई शिकायत नहीं है।'));
    const headers = ['ID', 'श्रेणी', 'स्थिति', 'ज़िला', 'थाना', 'पीड़ित का नाम', 'मोबाइल', 'नियुक्त अधिकारी', 'दर्ज तिथि'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = buildRows().map((r) => Object.values(r).map(escape).join(','));
    const csv = [headers.map(escape).join(','), ...rows].join('\n');
    const fileUri = FileSystem.documentDirectory + `shaktikop-complaints-${Date.now()}.csv`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await shareOrShow(fileUri, 'text/csv');
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('CSV निर्यात नहीं हो सका।'));
    }
  };

  // Excel निर्यात — HTML तालिका को .xls के रूप में सेव करते हैं। Excel इसे सीधे खोल लेता है,
  // हिंदी अक्षर व स्तंभ-चौड़ाई सही रहती है, और किसी अतिरिक्त library की ज़रूरत नहीं पड़ती।
  const exportExcel = async () => {
    setExportMenuOpen(false);
    // 🔒 सुरक्षा: UI बटन के अलावा यहाँ भी जांच — सिर्फ़ Admin
    if (user?.role !== 'admin') return;

    if (list.length === 0) return Alert.alert(tt('कुछ भी नहीं है'), tt('निर्यात के लिए कोई शिकायत नहीं है।'));
    const headers = ['ID', tt('श्रेणी'), tt('स्थिति'), tt('ज़िला'), tt('थाना'), tt('पीड़ित का नाम'), tt('मोबाइल'), tt('नियुक्त अधिकारी'), tt('दर्ज तिथि')];
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = buildRows()
      .map((r) => `<tr>${Object.values(r).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)
      .join('');
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" />
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Complaints</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>table{border-collapse:collapse}th{background:#0F2A44;color:#fff;font-weight:bold}
th,td{border:1px solid #999;padding:6px;font-size:12px;mso-number-format:"\\@"}</style></head><body>
<table><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${body}</table>
</body></html>`;
    const fileUri = FileSystem.documentDirectory + `shaktikop-complaints-${Date.now()}.xls`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, html, { encoding: FileSystem.EncodingType.UTF8 });
      await shareOrShow(fileUri, 'application/vnd.ms-excel');
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('Excel निर्यात नहीं हो सका।'));
    }
  };

  const exportJson = async () => {
    setExportMenuOpen(false);
    // 🔒 सुरक्षा: UI बटन के अलावा यहाँ भी जांच — सिर्फ़ Admin
    if (user?.role !== 'admin') return;

    if (list.length === 0) return Alert.alert(tt('कुछ भी नहीं है'), tt('निर्यात के लिए कोई शिकायत नहीं है।'));
    const fileUri = FileSystem.documentDirectory + `shaktikop-complaints-${Date.now()}.json`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(buildRows(), null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      await shareOrShow(fileUri, 'application/json');
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('JSON निर्यात नहीं हो सका।'));
    }
  };

  const exportPdf = async () => {
    setExportMenuOpen(false);
    // 🔒 सुरक्षा: UI बटन के अलावा यहाँ भी जांच — सिर्फ़ Admin
    if (user?.role !== 'admin') return;

    if (list.length === 0) return Alert.alert(tt('कुछ भी नहीं है'), tt('निर्यात के लिए कोई शिकायत नहीं है।'));
    const escPdf = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rowsHtml = buildRows()
      .map(
        (r) => `<tr>
          <td>${escPdf(r.id)}</td><td>${escPdf(r.category)}</td><td>${escPdf(r.status)}</td><td>${escPdf(r.district)}</td>
          <td>${escPdf(r.victimName)}</td><td>${escPdf(r.victimMobile)}</td><td>${escPdf(r.officer)}</td><td>${escPdf(r.date)}</td>
        </tr>`
      )
      .join('');
    const html = `
      <html><body style="font-family:sans-serif;padding:20px;">
        <h2 style="color:#7A1836;">ShaktiCop — शिकायत सूची (${list.length})</h2>
        <table style="width:100%;border-collapse:collapse;font-size:11px;" border="1" cellpadding="6">
          <tr style="background:#F3EFE6;font-weight:bold;">
            <td>ID</td><td>${tt('श्रेणी')}</td><td>${tt('स्थिति')}</td><td>${tt('ज़िला')}</td><td>${tt('नाम')}</td><td>${tt('मोबाइल')}</td><td>${tt('अधिकारी')}</td><td>${tt('तिथि')}</td>
          </tr>
          ${rowsHtml}
        </table>
      </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await shareOrShow(uri, 'application/pdf');
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('PDF निर्यात नहीं हो सका।'));
    }
  };

  const shareOrShow = async (fileUri, mimeType) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: 'शिकायत सूची निर्यात' });
    } else {
      Alert.alert(tt('फ़ाइल तैयार'), `सुरक्षित हुई: ${fileUri}`);
    }
  };

  const renderHeaderCell = (label, width) => (
    <View style={[styles.th, { width }]}>
      <Text style={styles.thText}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        {/* 🐛 बग फ़िक्स: यहाँ सिर्फ़ ({list.length}) दिखता था, पर list हमेशा एक पेज
            (ज़्यादा से ज़्यादा 100) तक ही सीमित है — जबकि डैशबोर्ड के कार्ड पूरा,
            बिना-पेजिंग वाला आंकड़ा दिखाते हैं। नतीजा: कार्ड पर "250" देखकर टैप करने
            पर यह स्क्रीन "(100)" दिखाती — लगता जैसे डेटा गायब हो गया हो। अब जब एक
            से ज़्यादा पेज हों, तो पेज-संख्या भी साफ़ दिखती है। */}
        <Text style={styles.title}>
          {tt('सभी शिकायतें')} ({list.length}
          {(hasNextPage || page > 0) ? ` · ${tt('पेज')} ${page + 1}` : ''})
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* 🔒 सुरक्षा फ़िक्स (गंभीर): यह निर्यात बटन पहले हर भूमिका (officer समेत) को
              दिखता था, और इसमें पीड़िता का नाम + मोबाइल नंबर भी शामिल होता है। अधिकारी
              का फ़ोन खो जाए, चोरी हो जाए, या ग़लती से किसी के साथ share हो जाए, तो पूरा
              victim database (CSV/Excel/PDF/JSON के रूप में, फ़ोन की स्थानीय स्टोरेज में
              सेव) लीक हो सकता था — इस ऐप के मक़सद (महिला सुरक्षा/घरेलू हिंसा) को देखते
              हुए यह ख़ासतौर पर ख़तरनाक है। अब bulk export सिर्फ़ Admin (जिनका काम ही
              consolidated रिपोर्टिंग है) तक सीमित है — अधिकारी अब भी हर शिकायत का पूरा
              विवरण खोलकर देख सकते हैं (अपने काम के लिए ज़रूरी), बस पूरी सूची अपने
              निजी फ़ोन में bulk फ़ाइल के रूप में सेव/शेयर नहीं कर सकते। */}
          {user?.role === 'admin' && (
            <TouchableOpacity style={styles.filterToggle} onPress={() => setExportMenuOpen((s) => !s)}>
              <Ionicons name="download-outline" size={16} color={colors.inkNavy} />
              <Text style={styles.filterToggleText}>{tt('निर्यात')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.filterToggle} onPress={() => setShowFilters((s) => !s)}>
            <Ionicons name="options-outline" size={16} color={colors.inkNavy} />
            <Text style={styles.filterToggleText}>{tt('फ़िल्टर')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🆕 दायरा-संकेत — सभी monitoring-roles को साफ़ दिखे कि वे किस दायरे की सूची देख रहे हैं */}
      {user?.rangeDistricts && user.rangeDistricts.length > 0 ? (
        <View style={styles.scopeNoteRow}>
          <Ionicons name="location-outline" size={13} color={colors.inkGrey} />
          <Text style={styles.scopeNote}>{tt('आपका Range')}: {user.rangeDistricts.map((d) => tt(d)).join(', ')}</Text>
        </View>
      ) : user?.circleStations && user.circleStations.length > 0 ? (
        <View style={styles.scopeNoteRow}>
          <Ionicons name="location-outline" size={13} color={colors.inkGrey} />
          <Text style={styles.scopeNote}>{tt('आपका सर्किल')}: {user.circleStations.map((s) => tt(s)).join(', ')}</Text>
        </View>
      ) : user?.district && (user?.adminRole === 'district_admin' || user?.adminRole === 'monitor') ? (
        <View style={styles.scopeNoteRow}>
          <Ionicons name="location-outline" size={13} color={colors.inkGrey} />
          <Text style={styles.scopeNote}>{tt('आपका ज़िला')}: {tt(user.district)}</Text>
        </View>
      ) : null}

      {user?.role === 'admin' && exportMenuOpen && (
        <View style={styles.exportMenu}>
          {/* 🐛 बग फ़िक्स: सभी निर्यात (Excel/CSV/PDF/JSON) सिर्फ़ मौजूदा पेज (ज़्यादा से
              ज़्यादा 100 शिकायतें) पर चलते हैं — पहले इसका कोई संकेत ही नहीं था, इसलिए
              एडमिन को लगता कि पूरी सूची निर्यात हो गई, जबकि फ़ाइल अधूरी होती। */}
          {(hasNextPage || page > 0) && (
            <Text style={styles.exportScopeHint}>
              {tt('निर्यात सिर्फ़ इसी पेज की शिकायतों का होगा')} ({list.length})
            </Text>
          )}
          <TouchableOpacity style={styles.exportOption} onPress={exportExcel}>
            <Ionicons name="grid-outline" size={18} color={colors.sage} />
            <Text style={styles.exportOptionText}>{tt('Excel (.xls)')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportOption} onPress={exportCsv}>
            <Ionicons name="grid-outline" size={15} color={colors.inkNavy} />
            <Text style={styles.exportOptionText}>{tt('CSV (Excel में खुलती है)')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportOption} onPress={exportPdf}>
            <Ionicons name="document-text-outline" size={15} color={colors.inkNavy} />
            <Text style={styles.exportOptionText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportOption} onPress={exportJson}>
            <Ionicons name="code-slash-outline" size={15} color={colors.inkNavy} />
            <Text style={styles.exportOptionText}>JSON</Text>
          </TouchableOpacity>
        </View>
      )}

      {showFilters && (
        <ScrollView style={styles.filterPanel} contentContainerStyle={{ padding: 14 }}>
          <FilterField label={tt('नाम / मोबाइल / ID से खोजें')}>
            <TextInput style={styles.searchInput} placeholder={tt('खोजें…')} value={search} onChangeText={setSearch} maxLength={100} />
          </FilterField>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <FilterField label={tt('दिनांक से (YYYY-MM-DD)')}>
                <TextInput style={styles.searchInput} placeholder="YYYY-MM-DD" value={dateFrom} onChangeText={setDateFrom} maxLength={10} />
              </FilterField>
            </View>
            <View style={{ flex: 1 }}>
              <FilterField label={tt('दिनांक तक (YYYY-MM-DD)')}>
                <TextInput style={styles.searchInput} placeholder="YYYY-MM-DD" value={dateTo} onChangeText={setDateTo} maxLength={10} />
              </FilterField>
            </View>
          </View>
          <FilterField label={tt('ज़िला')}>
            <View style={styles.pickerWrap}>
              <Picker
                key={`d-${districtsVersion}`}
                selectedValue={fDistrict}
                onValueChange={(v) => {
                  setFDistrict(v);
                  setFStation(''); // ज़िला बदलने पर थाना रीसेट — वरना बेमेल जोड़ी रह जाती है
                }}
              >
                <Picker.Item label={tt('सभी')} value="" />
                {DISTRICTS.map((d) => (
                  <Picker.Item key={d} label={tt(d)} value={d} />
                ))}
              </Picker>
            </View>
          </FilterField>
          <FilterField label={tt('थाना')}>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={fStation} onValueChange={setFStation} enabled={!!fDistrict}>
                <Picker.Item label={fDistrict ? tt('सभी') : tt('पहले ज़िला चुनें')} value="" />
                {(fDistrict ? stationsForDistrict(fDistrict) : []).map((s) => (
                  <Picker.Item key={s} label={tt(s)} value={s} />
                ))}
              </Picker>
            </View>
          </FilterField>
          <FilterField label={tt('स्थिति')}>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={status} onValueChange={setStatus}>
                <Picker.Item label={tt('सभी')} value="" />
                {ALL_STATUSES.map((s) => (
                  <Picker.Item key={s} label={tt(s)} value={s} />
                ))}
              </Picker>
            </View>
          </FilterField>
          <FilterField label={tt('श्रेणी')}>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={category} onValueChange={setCategory}>
                <Picker.Item label={tt('सभी')} value="" />
                {CATEGORY_DEFS.map((c) => (
                  <Picker.Item key={c.key} label={tt(c.label)} value={c.key} />
                ))}
              </Picker>
            </View>
          </FilterField>
          <FilterField label={tt('अधिकारी')}>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={officerId} onValueChange={setOfficerId}>
                <Picker.Item label={tt('सभी')} value="" />
                {officers.map((o) => (
                  <Picker.Item key={o.id} label={`${o.name}${o.pno ? ' (' + o.pno + ')' : ''}`} value={o.id} />
                ))}
              </Picker>
            </View>
          </FilterField>
          <FilterField label={tt('क्रम')}>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={sort} onValueChange={setSort}>
                <Picker.Item label={tt('सबसे नई पहले')} value="newest" />
                <Picker.Item label={tt('सबसे पुरानी पहले')} value="oldest" />
              </Picker>
            </View>
          </FilterField>
          <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
            <Text style={styles.clearBtnText}>{tt('फ़िल्टर हटाएं')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {loading ? (
        <TableSkeleton />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
          <View style={{ width: TABLE_WIDTH_S }}>
            <View style={styles.theadRow}>
              {renderHeaderCell('ID', COL_S.id)}
              {renderHeaderCell(tt('श्रेणी'), COL_S.cat)}
              {renderHeaderCell(tt('नाम'), COL_S.name)}
              {renderHeaderCell(tt('मोबाइल'), COL_S.mobile)}
              {renderHeaderCell(tt('स्थिति'), COL_S.status)}
              {renderHeaderCell(tt('लाइव लोकेशन'), COL_S.liveLoc)}
              {renderHeaderCell(tt('तिथि'), COL_S.date)}
              {renderHeaderCell(tt('कार्रवाई'), COL_S.actions)}
            </View>
            <FlatList
              data={list}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
              renderItem={({ item, index }) => (
                <View style={[styles.tr, index % 2 === 1 && styles.trAlt]}>
                  <View style={{ width: COL_S.id }}>
                    <Text style={styles.tdMono} numberOfLines={1}>{item.id}</Text>
                  </View>
                  <View style={{ width: COL_S.cat }}>
                    <Text style={styles.td} numberOfLines={2}>{item.category}</Text>
                  </View>
                  <View style={{ width: COL_S.name }}>
                    <Text style={styles.td} numberOfLines={2}>{item.victimName}</Text>
                  </View>
                  <View style={{ width: COL_S.mobile }}>
                    <Text style={styles.td} numberOfLines={1}>{item.victimMobile || '—'}</Text>
                  </View>
                  <View style={{ width: COL_S.status }}>
                    <StatusBadge status={item.status} />
                  </View>
                  <View style={{ width: COL_S.liveLoc, paddingRight: 8 }}>
                    <LiveLocationStatus complaint={item} compact />
                  </View>
                  <View style={{ width: COL_S.date }}>
                    <Text style={styles.td} numberOfLines={2}>{formatTableDateTime(item.createdAt)}</Text>
                  </View>
                  <View style={[styles.actionsCell, { width: COL_S.actions }]}>
                    <TouchableOpacity style={styles.viewBtn} onPress={() => navigation.navigate('ComplaintDetail', { id: item.id })}>
                      <Ionicons name="eye-outline" size={13} color={colors.white} />
                      <Text style={styles.viewBtnText}>View</Text>
                    </TouchableOpacity>
                    {item.status === 'दर्ज' && canAssign && (
                      <TouchableOpacity style={styles.assignBtn} onPress={() => openAssign(item)}>
                        <Ionicons name="person-add-outline" size={13} color={colors.white} />
                        <Text style={styles.viewBtnText}>Assign</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
              ListEmptyComponent={
                !loading && (
                  <View style={{ width: TABLE_WIDTH_S }}>
                    <EmptyState
                      icon="document-text-outline"
                      title="इस फ़िल्टर में कोई शिकायत नहीं मिली।"
                      subtitle="कोई और फ़िल्टर आज़माएं, या खींचकर नीचे रीफ़्रेश करें।"
                      actionLabel="फ़िल्टर साफ़ करें"
                      onAction={clearFilters}
                    />
                  </View>
                )
              }
              ListFooterComponent={
                list.length > 0 && (page > 0 || hasNextPage) ? (
                  <View style={{ width: TABLE_WIDTH_S, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 16 }}>
                    <TouchableOpacity
                      style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
                      onPress={goPrevPage}
                      disabled={page === 0 || loading}
                    >
                      <Ionicons name="chevron-back" size={15} color={page === 0 ? colors.inkLight : colors.shaktiMaroon} />
                      <Text style={[styles.pageBtnText, page === 0 && styles.pageBtnTextDisabled]}>{tt('पिछला')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.pageIndicator}>{tt('पेज')} {page + 1}</Text>
                    <TouchableOpacity
                      style={[styles.pageBtn, !hasNextPage && styles.pageBtnDisabled]}
                      onPress={goNextPage}
                      disabled={!hasNextPage || loading}
                    >
                      <Text style={[styles.pageBtnText, !hasNextPage && styles.pageBtnTextDisabled]}>{tt('अगला')}</Text>
                      <Ionicons name="chevron-forward" size={15} color={!hasNextPage ? colors.inkLight : colors.shaktiMaroon} />
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          </View>
        </ScrollView>
      )}

      {/* ---------- अधिकारी नियुक्ति मोडल ---------- */}
      <Modal visible={!!assignModal} animationType="slide" transparent onRequestClose={() => setAssignModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{tt('अधिकारी नियुक्त करें')}</Text>
            <Text style={styles.modalSub}>शिकायत {assignModal?.id}</Text>
            <View style={[styles.pickerWrap, { marginTop: 12 }]}>
              <Picker selectedValue={assignOfficerId} onValueChange={setAssignOfficerId}>
                {assignableOfficers.map((o) => (
                  <Picker.Item key={o.id} label={`${o.name}${o.pno ? ' (' + o.pno + ')' : ''}${o.station ? ' · ' + o.station : ''}`} value={o.id} />
                ))}
              </Picker>
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAssignModal(null)}>
                <Text style={styles.modalCancelText}>{tt('रद्द करें')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={submitAssign} disabled={assignBusy}>
                <Text style={styles.modalSubmitText}>{assignBusy ? 'सुरक्षित हो रहा है…' : 'नियुक्त करें'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FilterField({ label, children }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.filterLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.inkNavy },
  exportScopeHint: { fontSize: 11, color: colors.alert, fontWeight: '700', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, lineHeight: 15 },
  scopeNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginHorizontal: 16, marginTop: 6, marginBottom: 4 },
  scopeNote: { flex: 1, fontSize: 11.5, color: colors.shaktiMaroon, fontWeight: '700' },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  filterToggleText: { fontSize: 12, fontWeight: '700', color: colors.inkNavy },

  exportMenu: { backgroundColor: colors.white, marginHorizontal: 16, borderRadius: radius.md, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  exportOption: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  exportOptionText: { fontSize: 13, color: colors.inkNavy, fontWeight: '600' },

  filterPanel: { backgroundColor: colors.white, marginHorizontal: 16, borderRadius: radius.lg, maxHeight: 420, marginBottom: 10 },
  filterLabel: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginBottom: 4 },
  searchInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13.5 },
  row2: { flexDirection: 'row', gap: 10 },
  pickerWrap: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  clearBtn: { alignSelf: 'flex-start', marginTop: 4 },
  clearBtnText: { color: colors.shaktiMaroon, fontWeight: '700', fontSize: 12.5 },

  theadRow: { flexDirection: 'row', backgroundColor: colors.inkNavy, paddingVertical: 10, paddingHorizontal: 16 },
  th: { paddingHorizontal: 4 },
  thText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.white },
  trAlt: { backgroundColor: '#FBF9F5' },
  td: { fontSize: 11.5, color: colors.inkGrey, paddingHorizontal: 4 },
  tdMono: { fontSize: 10.5, color: colors.inkNavy, fontWeight: '700', paddingHorizontal: 4 },
  actionsCell: { flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.inkNavy, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  assignBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.shaktiMaroon, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  viewBtnText: { color: colors.white, fontSize: 10.5, fontWeight: '700' },

  emptyText: { textAlign: 'center', color: colors.inkLight, fontSize: 13 },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.shaktiMaroon,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pageBtnDisabled: { borderColor: colors.border },
  pageBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
  pageBtnTextDisabled: { color: colors.inkLight },
  pageIndicator: { fontSize: 12.5, fontWeight: '700', color: colors.inkNavy },
  emptySubText: { textAlign: 'center', color: colors.inkLight, fontSize: 11.5, marginTop: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.inkNavy },
  modalSub: { fontSize: 12, color: colors.inkLight, marginTop: 3 },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  modalCancelText: { color: colors.inkGrey, fontWeight: '700', fontSize: 13 },
  modalSubmitBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.shaktiMaroon, alignItems: 'center' },
  modalSubmitText: { color: colors.white, fontWeight: '700', fontSize: 13 },
});
