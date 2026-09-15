import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import LiveLocationStatus from '../components/LiveLocationStatus';
import { formatDateTimeFull } from '../utils/datetime';

// ============================================================
// QR स्कैन करने के बाद यहीं आता है — डेटा database से fetch करके verify किया जाता है
// (सिर्फ़ ID को trust नहीं किया जाता, असली रिकॉर्ड लाकर दिखाया जाता है), पूरी जानकारी
// दिखती है, और "आगे बढ़ें" दबाने पर वही असली शिकायत खुलती है जो "View" दबाने पर खुलती है।
// ============================================================
export default function QRVerifyResultScreen({ route, navigation }) {
  const rawId = route?.params?.id || '';
  const { verifyComplaintByQr } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [complaint, setComplaint] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await verifyComplaintByQr(rawId);
      setComplaint(data);
    } catch (e) {
      setComplaint(null);
      setError(e.message || tt('यह QR किसी शिकायत से मेल नहीं खाता।'));
    }
    setLoading(false);
  }, [verifyComplaintByQr, rawId]);

  useEffect(() => {
    load();
  }, [load]);

  const openLastLocation = () => {
    const lat = complaint?.liveLat ?? complaint?.latitude;
    const lng = complaint?.liveLng ?? complaint?.longitude;
    if (lat == null || lng == null) return;
    const url = `geo:${lat},${lng}?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`).catch(() => {});
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.shaktiMaroon} />
        <Text style={styles.loadingText}>{tt('database से मिलान किया जा रहा है…')}</Text>
      </View>
    );
  }

  if (error || !complaint) {
    return (
      <View style={styles.center}>
        <Ionicons name="close-circle-outline" size={48} color={colors.alert} />
        <Text style={styles.errorTitle}>{tt('सत्यापन विफल')}</Text>
        <Text style={styles.errorText}>{error || tt('यह शिकायत डेटाबेस में नहीं मिली।')}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>{tt('फिर कोशिश करें')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rescanBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.rescanBtnText}>{tt('← दोबारा स्कैन करें')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasLocation = (complaint.liveLat && complaint.liveLng) || (complaint.latitude && complaint.longitude);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.verifiedBanner}>
        <Ionicons name="shield-checkmark" size={18} color={colors.white} />
        <Text style={styles.verifiedBannerText}>{tt('database से सत्यापित — यह असली शिकायत है')}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cid}>{complaint.id}</Text>
            <Text style={styles.category}>{tt(complaint.category)}</Text>
          </View>
          <StatusBadge status={complaint.status} />
        </View>

        <Row label={tt('विवरण')} value={complaint.description} />
        <Row label={tt('ज़िला')} value={complaint.district} />
        <Row label={tt('थाना')} value={complaint.policeStation} />
        <Row label={tt('स्थान')} value={complaint.location} />
        <Row label={tt('घटना स्थल')} value={complaint.incidentLocation} />
        <Row label={tt('नियुक्त अधिकारी')} value={complaint.officer} />
        <Row label={tt('पीड़ित का नाम')} value={complaint.isAnonymous ? tt('गुमनाम') : complaint.victimName} />
        <Row label={tt('मोबाइल')} value={complaint.isAnonymous ? null : complaint.victimMobile} />
        <Row label={tt('दर्ज तिथि')} value={formatDateTimeFull(complaint.createdAt)} />

        {hasLocation && (
          <View style={styles.locBox}>
            <LiveLocationStatus complaint={complaint} />
            <TouchableOpacity onPress={openLastLocation} style={styles.locLink}>
              <Ionicons name="navigate-outline" size={14} color={colors.shaktiMaroon} />
              <Text style={styles.locLinkText}>{tt('नक्शे में देखें')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.proceedBtn}
        onPress={() => navigation.replace('ComplaintDetail', { id: complaint.id })}
      >
        <Ionicons name="arrow-forward-circle" size={20} color={colors.white} />
        <Text style={styles.proceedBtnText}>{tt('आगे बढ़ें — पूरी शिकायत खोलें')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.rescanBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.rescanBtnText}>{tt('← दोबारा स्कैन करें')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand, padding: 30 },
  loadingText: { fontSize: 13, color: colors.inkGrey, marginTop: 14 },
  errorTitle: { fontSize: 16, fontWeight: '800', color: colors.inkNavy, marginTop: 14 },
  errorText: { fontSize: 13, color: colors.inkGrey, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  retryBtn: { marginTop: 20, backgroundColor: colors.shaktiMaroon, paddingHorizontal: 20, paddingVertical: 11, borderRadius: radius.md },
  retryBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  rescanBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 8 },
  rescanBtnText: { color: colors.inkGrey, fontWeight: '600', fontSize: 12.5 },
  verifiedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.sage,
    borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14,
  },
  verifiedBannerText: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: 18,
    shadowColor: colors.inkNavy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cid: { fontSize: 11.5, color: colors.inkLight, fontWeight: '700' },
  category: { fontSize: 17, fontWeight: '800', color: colors.inkNavy, marginTop: 3 },
  row: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F2EFE9' },
  rowLabel: { fontSize: 10.5, color: colors.inkLight, fontWeight: '700', textTransform: 'uppercase' },
  rowValue: { fontSize: 13.5, color: colors.inkNavy, marginTop: 2, lineHeight: 19 },
  locBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F2EFE9' },
  locLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  locLinkText: { fontSize: 12, color: colors.shaktiMaroon, fontWeight: '700' },
  proceedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.shaktiMaroon, paddingVertical: 14, borderRadius: radius.md, marginTop: 18,
  },
  proceedBtnText: { color: colors.white, fontWeight: '800', fontSize: 14.5 },
});
