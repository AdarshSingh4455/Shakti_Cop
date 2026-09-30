import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatDateShort, formatDateTimeFull } from '../utils/datetime';

import { SkeletonList, LoadingView } from '../components/LoadingView';
// ============================================================
// ATR — कार्यवाही आख्या (Action Taken Report)
// शिकायत दर्ज होने से बंद होने तक की पूरी कहानी, जवाबदेही के आंकड़ों सहित।
// सिर्फ़ DSP व उससे ऊपर के अधिकारियों के लिए।
// ============================================================

function Stat({ label, value, tone }) {
  return (
    <View style={[styles.stat, tone === 'bad' && styles.statBad, tone === 'good' && styles.statGood]}>
      <Text style={[styles.statValue, tone === 'bad' && { color: colors.alert }, tone === 'good' && { color: colors.sage }]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{tt(label)}</Text>
    </View>
  );
}

// हर तरह की घटना का अपना रंग व आइकॉन — नज़र दौड़ाते ही समझ आ जाए
const EVENT_STYLE = {
  created: { icon: 'document-text', color: colors.inkNavy, label: 'दर्ज' },
  viewed: { icon: 'eye', color: colors.inkNavyLight, label: 'देखी' },
  assigned: { icon: 'person-add', color: colors.shaktiMaroon, label: 'नियुक्ति' },
  status: { icon: 'sync', color: colors.marigold, label: 'स्थिति' },
  visit: { icon: 'navigate', color: colors.sage, label: 'विज़िट' },
  note: { icon: 'create', color: colors.inkGrey, label: 'टिप्पणी' },
  checklist: { icon: 'checkmark-done', color: colors.sage, label: 'जांच' },
  sos: { icon: 'alert-circle', color: colors.alert, label: 'SOS' },
  safe: { icon: 'shield-checkmark', color: colors.sage, label: 'सुरक्षित' },
  feedback: { icon: 'star', color: colors.marigold, label: 'प्रतिक्रिया' },
  verified: { icon: 'ribbon', color: colors.sage, label: 'सत्यापित' },
};

// दो घटनाओं के बीच का अंतराल — देरी तुरंत दिखे
function gapText(mins) {
  if (!mins || mins < 1) return null;
  if (mins < 60) return `${mins} मिनट बाद`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} घंटे ${mins % 60 ? (mins % 60) + ' मिनट ' : ''}बाद`;
  const d = Math.floor(h / 24);
  return `${d} दिन ${h % 24 ? (h % 24) + ' घंटे ' : ''}बाद`;
}

function hrs(v) {
  if (v === null || v === undefined) return '—';
  return v < 24 ? `${v} ${tt('घं')}` : `${Math.round((v / 24) * 10) / 10} ${tt('दिन')}`;
}

export default function AtrScreen() {
  const { fetchAtrSummary, fetchAtr } = useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | open | breached | unopened

  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAtrSummary();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, [fetchAtrSummary]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id) => {
    setDetailBusy(true);
    try {
      const d = await fetchAtr(id);
      setDetail(d);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setDetailBusy(false);
  };

  // ---------- PDF ----------
  const exportPdf = async () => {
    if (!detail) return;
    const d = detail;
    const esc = (v) => String(v ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const row = (k, v) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`;

    // सेकंड तक सटीक, सारे स्रोतों की घटनाएं एक ही क्रम में
    const timelineRows = (d.events || [])
      .map((e) => {
        const st = EVENT_STYLE[e.kind] || EVENT_STYLE.status;
        const gap = gapText(e.gapMinutes);
        return `<tr>
          <td style="white-space:nowrap">${esc(formatDateTimeFull(e.at))}${gap ? `<br/><span style="color:#999;font-size:9px">(${esc(gap)})</span>` : ''}</td>
          <td><b>${esc(e.title)}</b><br/><span style="color:#888;font-size:9px">${esc(st.label)}</span></td>
          <td>${esc(e.actor)}<br/><span style="color:#888;font-size:9px">${esc(e.actorRole || '')}</span></td>
          <td>${esc(e.detail || '—')}${e.hasAttachment ? '<br/>प्रमाण संलग्न' : ''}${e.hasVoiceNote ? '<br/>आवाज़ संलग्न' : ''}</td>
        </tr>`;
      })
      .join('');

    const checklistRows = (d.checklist || [])
      .map((c) => `<li>${c.done ? '☑' : '☐'} ${esc(c.label)}</li>`)
      .join('');

    const visitRows = (d.fieldVisits || [])
      .map(
        (v) => `<tr><td>${esc(formatDateTime(v.createdAt))}</td><td>${esc(v.officerName)}</td>
        <td>${v.latitude?.toFixed(5)}, ${v.longitude?.toFixed(5)}</td><td>${esc(v.note || '—')}</td></tr>`
      )
      .join('');

    const m = d.metrics;
    const html = `<html><head><meta charset="UTF-8" /><style>
      body{font-family:sans-serif;padding:26px;color:#1a1a1a;font-size:12px}
      h1{color:#7A1836;font-size:19px;margin:0 0 2px}
      .sub{color:#666;font-size:11px;margin-bottom:16px}
      h2{color:#0F2A44;font-size:13px;margin:20px 0 6px;border-bottom:2px solid #0F2A44;padding-bottom:3px}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}
      td,th{border:1px solid #ccc;padding:5px 7px;font-size:11px;text-align:left;vertical-align:top}
      th{background:#0F2A44;color:#fff}
      .k{background:#F5F2ED;font-weight:bold;width:32%}
      .badge{display:inline-block;padding:3px 9px;border-radius:9px;color:#fff;font-size:10px;font-weight:bold}
      .ok{background:#2E7D5B}.bad{background:#B23A2E}
      ul{margin:4px 0;padding-left:18px}li{margin:2px 0}
      .foot{margin-top:24px;border-top:1px solid #ccc;padding-top:8px;color:#888;font-size:10px}
    </style></head><body>
      <h1>कार्यवाही आख्या (Action Taken Report)</h1>
      <div class="sub">ShaktiCop · उत्तर प्रदेश पुलिस — मिशन शक्ति &nbsp;|&nbsp; ${esc(formatDateTime(new Date()))}</div>

      <h2>1. शिकायत का विवरण</h2>
      <table>
        ${row('शिकायत ID', d.complaint.id)}
        ${row('श्रेणी', d.complaint.category)}
        ${row('वर्तमान स्थिति', d.complaint.status)}
        ${row('प्राथमिकता', d.complaint.priority)}
        ${row('ज़िला / थाना', `${d.complaint.district || '—'} / ${d.complaint.policeStation || '—'}`)}
        ${row('दर्ज दिनांक', formatDateTime(d.complaint.createdAt))}
        ${row('पीड़ित का नाम', d.complaint.isAnonymous ? 'गुमनाम शिकायत' : d.complaint.victimName)}
        ${row('मोबाइल', d.complaint.isAnonymous ? '—' : d.complaint.victimMobile)}
        ${row('स्थान', d.complaint.location)}
        ${row('विवरण', d.complaint.description)}
      </table>

      <h2>2. नियुक्त अधिकारी</h2>
      <table>
        ${d.officer
          ? row('नाम', `${d.officer.name} (${d.officer.rank || ''})`) +
            row('PNO', d.officer.badgeId) +
            row('थाना', d.officer.station) +
            row('मोबाइल', d.officer.mobile)
          : row('स्थिति', 'अभी तक कोई अधिकारी नियुक्त नहीं')}
      </table>

      <h2>3. जवाबदेही — समय विश्लेषण</h2>
      <table>
        ${row('नियुक्ति में लगा समय', hrs(m.hoursToAssign))}
        ${row('पहली कार्यवाही तक', hrs(m.hoursToFirstAction))}
        ${row('अधिकारी ने पहली बार खोली', m.hoursToOpen === null ? 'कभी नहीं खोली' : hrs(m.hoursToOpen))}
        ${row('निस्तारण में कुल समय', hrs(m.hoursToClose))}
        ${row('निर्धारित SLA', `${m.slaHours} घंटे`)}
        <tr><td class="k">SLA अनुपालन</td><td><span class="badge ${m.slaBreached ? 'bad' : 'ok'}">${
          m.slaBreached ? 'SLA का उल्लंघन' : 'SLA के भीतर'
        }</span></td></tr>
        ${row('जांच checklist', `${m.checklistDone} / ${m.checklistTotal} पूर्ण`)}
        ${row('कितनी बार देखी गई', `${m.totalViews ?? 0} बार`)}
        ${row('पहली बार देखी', m.firstViewAt ? formatDateTimeFull(m.firstViewAt) : 'कभी नहीं देखी')}
        ${row('अंतिम बार देखी', m.lastViewAt ? formatDateTimeFull(m.lastViewAt) : '—')}
        ${row('नियुक्ति के बाद पहली नज़र तक', m.hoursAssignToFirstView === null ? 'कभी नहीं देखी' : hrs(m.hoursAssignToFirstView))}
      </table>

      <h2>4. पूरा घटनाक्रम (सेकंड तक सटीक)</h2>
      <table><tr><th>दिनांक व समय</th><th>घटना</th><th>किसने</th><th>विवरण</th></tr>${
        timelineRows || '<tr><td colspan="4">कोई प्रविष्टि नहीं</td></tr>'
      }</table>

      <h2>5. जांच Checklist</h2>
      <ul>${checklistRows || '<li>कोई checklist नहीं</li>'}</ul>

      <h2>6. फील्ड विज़िट (GPS सत्यापित)</h2>
      <table><tr><th>दिनांक</th><th>अधिकारी</th><th>निर्देशांक</th><th>टिप्पणी</th></tr>${
        visitRows || '<tr><td colspan="4">कोई फील्ड विज़िट दर्ज नहीं</td></tr>'
      }</table>

      <h2>7. किसने-कब देखी</h2>
      <table><tr><th>दिनांक व समय</th><th>नाम</th><th>भूमिका</th><th>पद</th></tr>${
        (d.views || [])
          .map(
            (v) => `<tr><td style="white-space:nowrap">${esc(formatDateTimeFull(v.viewedAt))}</td>
            <td>${esc(v.viewerName)}</td><td>${esc(v.viewerRole)}</td><td>${esc(v.viewerRank || '—')}</td></tr>`
          )
          .join('') || '<tr><td colspan="4">किसी ने नहीं देखी</td></tr>'
      }</table>

      <h2>8. SOS व नागरिक प्रतिक्रिया</h2>
      <table>
        ${row('SOS दबाया गया', d.sos.triggered ? `हाँ — ${formatDateTime(d.sos.triggeredAt)}` : 'नहीं')}
        ${row('सुरक्षित पहुँचने की पुष्टि', d.sos.safeArrivalConfirmed ? formatDateTime(d.sos.safeArrivalAt) : '—')}
        ${row('नागरिक की रेटिंग', d.feedback.rating ? `${d.feedback.rating} / 5` : 'प्रतिक्रिया नहीं दी')}
        ${row('नागरिक की टिप्पणी', d.feedback.note)}
        ${row('एडमिन द्वारा सत्यापित', d.verification.adminVerified ? `हाँ — ${d.verification.verifiedBy || ''}` : 'नहीं')}
      </table>

      <div class="foot">
        यह रिपोर्ट ShaktiCop प्रणाली से स्वतः तैयार की गई है।<br/>
        निर्गत करने वाले अधिकारी की समीक्षा हेतु — गोपनीय।
      </div>
    </body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      const target = `${FileSystem.documentDirectory}ATR-${d.complaint.id}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: target });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, { mimeType: 'application/pdf' });
      } else {
        Alert.alert(tt('फ़ाइल तैयार'), target);
      }
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('PDF बनाने में समस्या आई।'));
    }
  };

  // ---------- फ़िल्टर ----------
  const q = search.trim().toLowerCase();
  const visible = list
    .filter((x) => {
      if (filter === 'open') return !x.isClosed;
      if (filter === 'breached') return x.hours > 48 && !x.isClosed;
      if (filter === 'unopened') return x.neverOpened;
      return true;
    })
    .filter(
      (x) =>
        !q ||
        x.id.toLowerCase().includes(q) ||
        (x.officerName || '').toLowerCase().includes(q) ||
        (x.district || '').toLowerCase().includes(q)
    );

  if (loading) {
    return (
      <SkeletonList rows={6} />
    );
  }

  const FILTERS = [
    { key: 'all', label: 'सभी', n: list.length },
    { key: 'open', label: 'लंबित', n: list.filter((x) => !x.isClosed).length },
    { key: 'breached', label: 'SLA पार', n: list.filter((x) => x.hours > 48 && !x.isClosed).length },
    { key: 'unopened', label: 'कभी नहीं खोली', n: list.filter((x) => x.neverOpened).length },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={15} color={colors.inkLight} />
        <TextInput
          style={styles.searchInput}
          placeholder={tt('ID, अधिकारी या ज़िले से खोजें')}
          value={search}
          onChangeText={setSearch}
          maxLength={100}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {tt(f.label)} ({f.n})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={visible}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
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
        renderItem={({ item }) => {
          const breached = item.hours > 48 && !item.isClosed;
          return (
            <TouchableOpacity style={[styles.card, breached && styles.cardBad]} onPress={() => openDetail(item.id)}>
              <View style={styles.cardHead}>
                <Text style={styles.cid}>{item.id}</Text>
                {item.sosTriggered && <Text style={styles.sosTag}>SOS</Text>}
                <View style={[styles.pill, { backgroundColor: item.isClosed ? colors.sage : colors.marigold }]}>
                  <Text style={styles.pillText}>{tt(item.status)}</Text>
                </View>
              </View>
              <Text style={styles.cat}>{tt(item.category)}</Text>
              <Text style={styles.meta}>
                {[item.policeStation, item.district].filter(Boolean).map(tt).join(', ')}
                {item.officerName ? ` · ${item.officerName}` : ` · ${tt('अनियुक्त')}`}
              </Text>
              <View style={styles.cardFoot}>
                <View style={styles.cardFootItem}>
                  <Ionicons name="time-outline" size={12} color={breached ? colors.alert : colors.inkLight} />
                  <Text style={[styles.time, breached && { color: colors.alert, fontWeight: '800' }]}>
                    {hrs(item.hours)}
                  </Text>
                </View>
                <View style={styles.cardFootItem}>
                  <Ionicons name="checkmark-done-outline" size={12} color={colors.inkLight} />
                  <Text style={styles.time}>
                    {item.checklistDone}/{item.checklistTotal}
                  </Text>
                </View>
                {item.neverOpened && <Text style={styles.warn}>{tt('कभी नहीं खोली')}</Text>}
                {item.feedbackRating ? (
                  <View style={styles.cardFootItem}>
                    <Ionicons name="star" size={12} color={colors.marigold} />
                    <Text style={styles.time}>{item.feedbackRating}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={36} color={colors.inkLight} />
            <Text style={styles.emptyText}>{tt('इस फ़िल्टर में कोई शिकायत नहीं।')}</Text>
          </View>
        }
      />

      {detailBusy && (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      )}

      {/* ---------- ATR विवरण ---------- */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        {detail && (
          <View style={{ flex: 1, backgroundColor: colors.sand }}>
            <View style={styles.modalHead}>
              <TouchableOpacity onPress={() => setDetail(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={colors.white} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{tt('कार्यवाही आख्या')}</Text>
                <Text style={styles.modalSub}>{detail.complaint.id}</Text>
              </View>
              <TouchableOpacity onPress={exportPdf} style={styles.pdfBtn}>
                <Ionicons name="download-outline" size={15} color={colors.white} />
                <Text style={styles.pdfBtnText}>PDF</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
              <View style={styles.statRow}>
                <Stat label="नियुक्ति में" value={hrs(detail.metrics.hoursToAssign)} />
                <Stat label="निस्तारण में" value={hrs(detail.metrics.hoursToClose)} />
                <Stat
                  label="SLA"
                  value={detail.metrics.slaBreached ? tt('पार') : tt('ठीक')}
                  tone={detail.metrics.slaBreached ? 'bad' : 'good'}
                />
                <Stat
                  label="Checklist"
                  value={`${detail.metrics.checklistDone}/${detail.metrics.checklistTotal}`}
                />
              </View>

              <View style={styles.statRow}>
                <Stat
                  label="कितनी बार देखी"
                  value={String(detail.metrics.totalViews ?? 0)}
                  tone={(detail.metrics.totalViews ?? 0) === 0 ? 'bad' : undefined}
                />
                <Stat
                  label="नियुक्ति → पहली नज़र"
                  value={hrs(detail.metrics.hoursAssignToFirstView)}
                  tone={
                    detail.metrics.hoursAssignToFirstView === null
                      ? 'bad'
                      : detail.metrics.hoursAssignToFirstView > 12
                      ? 'bad'
                      : 'good'
                  }
                />
                <Stat label="कुल घटनाएं" value={String(detail.metrics.totalEvents ?? 0)} />
              </View>

              {detail.metrics.hoursToOpen === null && (
                <View style={styles.alertBox}>
                  <Ionicons name="warning-outline" size={16} color={colors.alert} />
                  <Text style={styles.alertText}>
                    {tt('नियुक्त अधिकारी ने यह शिकायत अभी तक खोली ही नहीं है।')}
                  </Text>
                </View>
              )}

              <Text style={styles.sectionTitle}>{tt('शिकायत का विवरण')}</Text>
              <View style={styles.card2}>
                <Row k="श्रेणी" v={tt(detail.complaint.category)} />
                <Row k="स्थिति" v={tt(detail.complaint.status)} />
                <Row k="ज़िला / थाना" v={`${tt(detail.complaint.district || '—')} / ${tt(detail.complaint.policeStation || '—')}`} />
                <Row k="दर्ज दिनांक" v={formatDateTime(detail.complaint.createdAt)} />
                <Row k="पीड़ित" v={detail.complaint.isAnonymous ? tt('गुमनाम शिकायत') : detail.complaint.victimName} />
                {detail.complaint.description ? <Row k="विवरण" v={detail.complaint.description} /> : null}
              </View>

              <Text style={styles.sectionTitle}>{tt('नियुक्त अधिकारी')}</Text>
              <View style={styles.card2}>
                {detail.officer ? (
                  <>
                    <Row k="नाम" v={`${detail.officer.name} (${detail.officer.rank || ''})`} />
                    <Row k="PNO" v={detail.officer.badgeId} />
                    <Row k="थाना" v={tt(detail.officer.station || '—')} />
                  </>
                ) : (
                  <Text style={styles.muted}>{tt('अभी तक कोई अधिकारी नियुक्त नहीं')}</Text>
                )}
              </View>

              <View style={styles.trailHead}>
                <Text style={styles.sectionTitle}>{tt('पूरा घटनाक्रम')}</Text>
                <Text style={styles.trailCount}>
                  {(detail.events || []).length} {tt('घटनाएं')}
                </Text>
              </View>
              <View style={styles.card2}>
                {!detail.events || detail.events.length === 0 ? (
                  <Text style={styles.muted}>{tt('कोई प्रविष्टि नहीं')}</Text>
                ) : (
                  detail.events.map((e, i) => {
                    const st = EVENT_STYLE[e.kind] || EVENT_STYLE.status;
                    const gap = gapText(e.gapMinutes);
                    const isLast = i === detail.events.length - 1;
                    return (
                      <View key={i}>
                        {gap ? (
                          <View style={styles.gapRow}>
                            <View style={styles.gapLine} />
                            <Text style={styles.gapText}>{tt(gap)}</Text>
                            <View style={styles.gapLine} />
                          </View>
                        ) : null}
                        <View style={styles.evRow}>
                          <View style={styles.evLeft}>
                            <View style={[styles.evDot, { backgroundColor: st.color }]}>
                              <Ionicons name={st.icon} size={11} color={colors.white} />
                            </View>
                            {!isLast && <View style={styles.evLine} />}
                          </View>
                          <View style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
                            <View style={styles.evTitleRow}>
                              <Text style={styles.evTitle}>{tt(e.title)}</Text>
                              <View style={[styles.evTag, { backgroundColor: st.color + '1A' }]}>
                                <Text style={[styles.evTagText, { color: st.color }]}>{tt(st.label)}</Text>
                              </View>
                            </View>
                            {/* सेकंड तक सटीक समय — जवाबदेही के लिए ज़रूरी */}
                            <Text style={styles.evTime}>{formatDateTimeFull(e.at)}</Text>
                            <Text style={styles.evActor}>
                              {e.actor || '—'}
                              {e.actorRole ? ` · ${tt(e.actorRole)}` : ''}
                            </Text>
                            {e.detail ? <Text style={styles.evDetail}>{e.detail}</Text> : null}
                            {(e.hasAttachment || e.hasVoiceNote) && (
                              <Text style={styles.evAttach}>
                                {e.hasAttachment ? tt('प्रमाण संलग्न') : ''}
                                {e.hasAttachment && e.hasVoiceNote ? '  ' : ''}
                                {e.hasVoiceNote ? tt('आवाज़ टिप्पणी संलग्न') : ''}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              {detail.fieldVisits.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>{tt('फील्ड विज़िट (GPS सत्यापित)')}</Text>
                  <View style={styles.card2}>
                    {detail.fieldVisits.map((v, i) => (
                      <Text key={i} style={styles.listLine}>
                        • {formatDateShort(v.createdAt)} — {v.officerName}
                        {v.note ? ` · ${v.note}` : ''}
                      </Text>
                    ))}
                  </View>
                </>
              )}

              {detail.privateNotes.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>{tt('अधिकारी की निजी टिप्पणियां')}</Text>
                  <View style={styles.card2}>
                    {detail.privateNotes.map((n, i) => (
                      <Text key={i} style={styles.listLine}>
                        • {n.officerName}: {n.note}
                      </Text>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.sectionTitle}>{tt('नागरिक की प्रतिक्रिया')}</Text>
              <View style={styles.card2}>
                <Row
                  k="रेटिंग"
                  v={detail.feedback.rating ? `${'★'.repeat(detail.feedback.rating)} (${detail.feedback.rating}/5)` : tt('प्रतिक्रिया नहीं दी')}
                />
                {detail.feedback.note ? <Row k="टिप्पणी" v={detail.feedback.note} /> : null}
                <Row
                  k="एडमिन सत्यापन"
                  v={detail.verification.adminVerified ? `${tt('हाँ')} — ${detail.verification.verifiedBy || ''}` : tt('नहीं')}
                />
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

function Row({ k, v }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowK}>{tt(k)}</Text>
      <Text style={styles.rowV}>{v || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, margin: 12, marginBottom: 0, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 13, color: colors.inkNavy, padding: 0 },
  filterRow: { paddingHorizontal: 12, paddingTop: 10, gap: 7, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.inkNavy, borderColor: colors.inkNavy },
  chipText: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey },
  chipTextActive: { color: colors.white },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: colors.border },
  cardBad: { borderLeftColor: colors.alert },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cid: { flex: 1, fontSize: 12, fontWeight: '800', color: colors.inkNavy },
  sosTag: { fontSize: 9.5, fontWeight: '800', color: colors.white, backgroundColor: colors.alert, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9 },
  pillText: { fontSize: 9.5, fontWeight: '800', color: colors.white },
  cat: { fontSize: 13, fontWeight: '700', color: colors.inkNavy, marginTop: 6 },
  meta: { fontSize: 11, color: colors.inkLight, marginTop: 2 },
  cardFoot: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' },
  cardFootItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  time: { fontSize: 11, color: colors.inkGrey, fontWeight: '600' },
  warn: { fontSize: 10.5, color: colors.alert, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { fontSize: 13, color: colors.inkGrey, marginTop: 10 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,42,68,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.shaktiMaroon, paddingTop: 46, paddingBottom: 12, paddingHorizontal: 14 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: colors.white },
  modalSub: { fontSize: 11, color: '#F0DCE2' },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14 },
  pdfBtnText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  statRow: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statBad: { borderColor: colors.alert, backgroundColor: '#FFF6F4' },
  statGood: { borderColor: colors.sage, backgroundColor: '#F4F9F6' },
  statValue: { fontSize: 14.5, fontWeight: '800', color: colors.inkNavy },
  statLabel: { fontSize: 9.5, color: colors.inkLight, marginTop: 2, textAlign: 'center' },
  alertBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FFF6F4', borderRadius: radius.md, padding: 11, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: colors.alert },
  alertText: { flex: 1, fontSize: 12, color: colors.inkNavy, fontWeight: '600', lineHeight: 17 },
  sectionTitle: { fontSize: 13.5, fontWeight: '800', color: colors.inkNavy, marginTop: 6, marginBottom: 7 },
  card2: { backgroundColor: colors.white, borderRadius: radius.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#F0EDE7' },
  rowK: { width: '38%', fontSize: 11.5, fontWeight: '700', color: colors.inkGrey },
  rowV: { flex: 1, fontSize: 12, color: colors.inkNavy },
  muted: { fontSize: 12, color: colors.inkLight, fontStyle: 'italic' },
  trailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trailCount: { fontSize: 11, color: colors.inkLight, fontWeight: '700' },
  evRow: { flexDirection: 'row', gap: 10 },
  evLeft: { alignItems: 'center', width: 22 },
  evDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  evLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  evTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  evTitle: { flex: 1, fontSize: 12.5, fontWeight: '800', color: colors.inkNavy },
  evTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  evTagText: { fontSize: 9, fontWeight: '800' },
  evTime: { fontSize: 11, color: colors.shaktiMaroon, fontWeight: '700', marginTop: 2 },
  evActor: { fontSize: 10.5, color: colors.inkLight, marginTop: 1 },
  evDetail: { fontSize: 11.5, color: colors.inkGrey, marginTop: 3, lineHeight: 16 },
  evAttach: { fontSize: 10.5, color: colors.sage, marginTop: 3, fontWeight: '600' },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 32, paddingVertical: 3 },
  gapLine: { flex: 1, height: 1, backgroundColor: colors.border },
  gapText: { fontSize: 9.5, color: colors.inkLight, fontStyle: 'italic' },
  tlRow: { flexDirection: 'row', gap: 9, paddingVertical: 7 },
  tlDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.shaktiMaroon, marginTop: 5 },
  tlStatus: { fontSize: 12.5, fontWeight: '800', color: colors.inkNavy },
  tlMeta: { fontSize: 10.5, color: colors.inkLight, marginTop: 1 },
  tlNote: { fontSize: 11.5, color: colors.inkGrey, marginTop: 3, lineHeight: 16 },
  listLine: { fontSize: 11.5, color: colors.inkGrey, marginVertical: 3, lineHeight: 16 },
});
