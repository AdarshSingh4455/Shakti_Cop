import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { ensureLocationPermission, getPositionWithTimeout } from '../utils/locationPermission';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

export default function LocationDataScreen() {
  const { user, fetchAdminLocationData, bulkUploadLocationData, deleteLocationEntry, updateLocationEntryGeo } = useApp();
  const isSuperAdmin = user?.adminRole === 'super_admin';

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('replace');
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // 🆕 geo-tagging — किसी थाने के coordinates सेट/बदलने के लिए
  const [geoEditId, setGeoEditId] = useState(null);
  const [geoLat, setGeoLat] = useState('');
  const [geoLng, setGeoLng] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  // 🆕 बग फ़िक्स: अंग्रेज़ी नाम पहले सिर्फ़ कोड में hardcoded "प्रमुख ज़िलों के थाने"
  // तक सीमित था — अब यहीं से, हर थाने के लिए, Super Admin भर सकता है।
  const [editDistrictEn, setEditDistrictEn] = useState('');
  const [editStationEn, setEditStationEn] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminLocationData();
      setList(data);
    } catch (e) {
      // सिर्फ़ super_admin को मिलेगा
    }
    setLoading(false);
  }, [fetchAdminLocationData]);

  useEffect(() => {
    load();
  }, [load]);

  const districtCount = new Set(list.map((r) => r.district)).size;
  const geoTaggedCount = list.filter((r) => r.isGeoTagged).length;
  const englishNameCount = list.filter((r) => r.stationEn).length;

  const openGeoEdit = (item) => {
    setGeoEditId(item.id);
    setGeoLat(item.latitude != null ? String(item.latitude) : '');
    setGeoLng(item.longitude != null ? String(item.longitude) : '');
    setEditDistrictEn(item.districtEn || '');
    setEditStationEn(item.stationEn || '');
  };

  // 🆕 अभी जहां खड़े हैं (अगर सचमुच थाने पर मौजूद हैं) उसी लोकेशन को geo-tag के रूप में भर दें
  const useMyLocation = async () => {
    try {
      const perm = await ensureLocationPermission();
      if (!perm.granted) {
        Alert.alert(tt('अनुमति चाहिए'), tt('लोकेशन एक्सेस दें ताकि यहीं की coordinates भर सकें।'));
        return;
      }
      // 🐛 बग फ़िक्स: GPS अटकने पर कुछ भी नहीं होता था, न कोई संदेश
      const pos = await getPositionWithTimeout({ timeoutMs: 10000 });
      if (!pos) throw new Error('no-fix');
      setGeoLat(String(pos.coords.latitude));
      setGeoLng(String(pos.coords.longitude));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('मौजूदा लोकेशन नहीं मिल सकी।'));
    }
  };

  const saveGeo = async () => {
    const payload = {};
    // coordinates सिर्फ़ तभी भेजें जब कुछ भरा हो — English नाम अकेले भी सेव हो सकें
    if (geoLat.trim() || geoLng.trim()) {
      const lat = Number(geoLat);
      const lng = Number(geoLng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        Alert.alert(tt('अमान्य'), tt('सही latitude दें (−90 से 90 के बीच)।'));
        return;
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        Alert.alert(tt('अमान्य'), tt('सही longitude दें (−180 से 180 के बीच)।'));
        return;
      }
      payload.latitude = lat;
      payload.longitude = lng;
    }
    if (editDistrictEn.trim()) payload.districtEn = editDistrictEn.trim();
    if (editStationEn.trim()) payload.stationEn = editStationEn.trim();
    if (Object.keys(payload).length === 0) {
      Alert.alert(tt('कुछ नहीं बदला'), tt('कम से कम एक फ़ील्ड भरें।'));
      return;
    }
    setGeoBusy(true);
    try {
      await updateLocationEntryGeo(geoEditId, payload);
      setGeoEditId(null);
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setGeoBusy(false);
  };

  const submitUpload = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      Alert.alert(tt('कुछ भी नहीं है'), tt('कम से कम एक पंक्ति डालें — जैसे: लखनऊ, हजरतगंज'));
      return;
    }
    // 🆕 अब वैकल्पिक रूप से अंग्रेज़ी नाम भी साथ दे सकते हैं — पुराना 2-फ़ील्ड फ़ॉर्मेट
    // (district, station) अब भी वैसे ही चलता है; 4-फ़ील्ड फ़ॉर्मेट
    // (district, station, districtEn, stationEn) से एक साथ कई/सभी थानों के अंग्रेज़ी
    // नाम भी भरे जा सकते हैं — एक-एक करके edit करने से कहीं तेज़।
    const rows = lines.map((line) => {
      const parts = line.split(',').map((p) => p?.trim());
      const [district, station, districtEn, stationEn] = parts;
      return { district, station, districtEn: districtEn || undefined, stationEn: stationEn || undefined };
    });

    if (mode === 'replace') {
      Alert.alert(
        tt('पूरी पुरानी सूची बदल दी जाएगी'),
        `${tt('यह')} ${rows.length} ${tt('नई entries डालेगा और मौजूदा सारी')} ${list.length} ${tt('entries हटा देगा। पक्का करें?')}`,
        [
          { text: tt('रद्द करें'), style: 'cancel' },
          { text: tt('हाँ, बदलें'), style: 'destructive', onPress: () => doUpload(rows) },
        ]
      );
    } else {
      doUpload(rows);
    }
  };

  const doUpload = async (rows) => {
    setBusy(true);
    try {
      const result = await bulkUploadLocationData(rows, mode);
      setText('');
      setShowUpload(false);
      await load();
      Alert.alert(tt('सफल'), `${result.inserted} नई entries जुड़ीं (कुल ${result.validRows} में से) — यह अब पूरे app के हर dropdown में लागू हो गया है।`);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const removeEntry = (item) => {
    Alert.alert(tt('हटाएं?'), `${tt(item.district)} — ${tt(item.station)}`, [
      { text: tt('रद्द करें'), style: 'cancel' },
      {
        text: tt('हटाएं'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLocationEntry(item.id);
            await load();
          } catch (e) {
            Alert.alert(tt('त्रुटि'), e.message);
          }
        },
      },
    ]);
  };

  if (!isSuperAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.restrictedBox}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.inkLight} />
          <Text style={styles.restrictedText}>{tt('यह सेक्शन सिर्फ़ Super Admin के लिए है।')}</Text>
        </View>
      </View>
    );
  }

  const listHeader = (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('ज़िला/थाना मास्टर सूची')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowUpload((s) => !s)}>
          <Ionicons name={showUpload ? 'close' : 'cloud-upload-outline'} size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        अभी {districtCount} ज़िले, {list.length} थाने सूची में हैं ({geoTaggedCount} की लोकेशन (lat/lng) सेट है, {englishNameCount} का अंग्रेज़ी नाम सेट है)।
        यहाँ से अपलोड की गई सूची पूरे app के हर dropdown (शिकायत फॉर्म, प्रोफ़ाइल, अधिकारी बनाना, आदि) में
        अपने-आप लागू हो जाती है। जिन थानों की लोकेशन सेट होगी, "नज़दीकी थाना" खोज उन्हें सबसे पहले भरोसे से दिखाएगी।
      </Text>

      {showUpload && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('पूरी सूची पेस्ट करें')}</Text>
          <Text style={styles.formatHint}>
            हर पंक्ति में: <Text style={styles.mono}>{tt('ज़िला, थाना')}</Text> (comma से अलग) — या
            अंग्रेज़ी नाम भी साथ देने के लिए: <Text style={styles.mono}>{tt('ज़िला, थाना, District(English), Station(English)')}</Text>
          </Text>
          <Text style={styles.example}>
            उदाहरण:{'\n'}लखनऊ, हजरतगंज{'\n'}लखनऊ, गोमती नगर, Lucknow, Gomti Nagar{'\n'}कानपुर नगर, कोतवाली
          </Text>

          <TextInput
            style={styles.textarea}
            placeholder={tt('यहाँ पूरी सूची पेस्ट करें…')}
            multiline
            value={text}
            onChangeText={setText}
            maxLength={20000}
          />

          <View style={styles.modeRow}>
            <TouchableOpacity style={[styles.modeChip, mode === 'replace' && styles.modeChipActive]} onPress={() => setMode('replace')}>
              <Text style={[styles.modeChipText, mode === 'replace' && styles.modeChipTextActive]}>{tt('पूरी सूची बदलें (Replace)')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeChip, mode === 'merge' && styles.modeChipActive]} onPress={() => setMode('merge')}>
              <Text style={[styles.modeChipText, mode === 'merge' && styles.modeChipTextActive]}>{tt('मौजूदा में जोड़ें (Merge)')}</Text>
            </TouchableOpacity>
          </View>

          <PrimaryButton title={busy ? tt('अपलोड हो रहा है…') : tt('अपलोड करें')} onPress={submitUpload} style={{ marginTop: 14 }}  loading={busy} />
        </View>
      )}
    </>
  );

  const renderEntry = ({ item }) => (
    <View style={styles.entryCard}>
            <View style={styles.entryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryDistrict}>{tt(item.district)}</Text>
                <Text style={styles.entryStation}>{tt(item.station)}</Text>
                <View style={styles.geoStatusRow}>
                  <Ionicons
                    name={item.isGeoTagged ? 'location' : 'location-outline'}
                    size={12}
                    color={item.isGeoTagged ? colors.sage : colors.inkLight}
                  />
                  <Text style={[styles.geoStatusText, item.isGeoTagged && { color: colors.sage }]}>
                    {item.isGeoTagged ? tt('लोकेशन सेट है') : tt('लोकेशन सेट नहीं है')}
                  </Text>
                  <Text style={styles.geoStatusText}>·</Text>
                  <Ionicons
                    name={item.stationEn ? 'language' : 'language-outline'}
                    size={12}
                    color={item.stationEn ? colors.sage : colors.inkLight}
                  />
                  <Text style={[styles.geoStatusText, item.stationEn && { color: colors.sage }]}>
                    {item.stationEn || tt('अंग्रेज़ी नाम नहीं है')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => (geoEditId === item.id ? setGeoEditId(null) : openGeoEdit(item))} style={{ padding: 6 }}>
                <Ionicons name="navigate-outline" size={18} color={colors.shaktiMaroon} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeEntry(item)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color={colors.alert} />
              </TouchableOpacity>
            </View>

            {geoEditId === item.id && (
              <View style={styles.geoEditBox}>
                <Text style={styles.sectionLabel}>{tt('अंग्रेज़ी नाम (English मोड में दिखेगा)')}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.geoInput, { flex: 1 }]}
                    placeholder="District (English) — e.g. Lucknow"
                    value={editDistrictEn}
                    onChangeText={setEditDistrictEn}
                    autoCapitalize="words"
                  />
                  <TextInput
                    style={[styles.geoInput, { flex: 1 }]}
                    placeholder="Station (English) — e.g. Hazratganj"
                    value={editStationEn}
                    onChangeText={setEditStationEn}
                    autoCapitalize="words"
                  />
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 14 }]}>{tt('स्थान (coordinates)')}</Text>
                <TouchableOpacity style={styles.useMyLocBtn} onPress={useMyLocation}>
                  <Ionicons name="locate" size={14} color={colors.white} />
                  <Text style={styles.useMyLocBtnText}>{tt('मेरी मौजूदा लोकेशन इस्तेमाल करें')}</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TextInput
                    style={[styles.geoInput, { flex: 1 }]}
                    placeholder="Latitude"
                    keyboardType="numbers-and-punctuation"
                    value={geoLat}
                    onChangeText={setGeoLat}
                    maxLength={20}
                  />
                  <TextInput
                    style={[styles.geoInput, { flex: 1 }]}
                    placeholder="Longitude"
                    keyboardType="numbers-and-punctuation"
                    value={geoLng}
                    onChangeText={setGeoLng}
                    maxLength={20}
                  />
                </View>
                <PrimaryButton title={geoBusy ? tt('सुरक्षित हो रहा है…') : tt('सुरक्षित करें')} onPress={saveGeo} style={{ marginTop: 10 }}  loading={geoBusy} />
              </View>
            )}
    </View>
  );

  // 🐛 बग फ़िक्स (प्रदर्शन): पहले पूरी सूची एक सादे ScrollView के अंदर .map() से
  // render होती थी — यानी हर एक थाना एक साथ मेमोरी में बनता। अभी सूची छोटी है (105),
  // पर इस स्क्रीन का असली मक़सद ही यह है कि Super Admin पूरे राज्य की असली सूची
  // (~1,500+ थाने) अपलोड करें — उतने items एक साथ render होने पर स्क्रीन जम/क्रैश
  // हो जाती। अब FlatList (virtualized) — सिर्फ़ दिखने वाले items ही render होते हैं।
  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      data={loading ? [] : list}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderEntry}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={loading ? <Text style={styles.hint}>{tt('लोड हो रहा है…')}</Text> : null}
      initialNumToRender={15}
      windowSize={10}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  addBtn: { backgroundColor: colors.shaktiMaroon, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11.5, color: colors.inkLight, marginTop: 6, marginBottom: 16, lineHeight: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 8 },
  formatHint: { fontSize: 12, color: colors.inkGrey, marginBottom: 10 },
  mono: { fontFamily: 'monospace', fontWeight: '700', color: colors.shaktiMaroon },
  example: { fontSize: 11, color: colors.inkLight, backgroundColor: colors.sand, padding: 10, borderRadius: radius.sm, marginBottom: 14, lineHeight: 16 },
  textarea: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 13, minHeight: 160, textAlignVertical: 'top' },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  modeChip: { flex: 1, backgroundColor: colors.sand, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  modeChipActive: { backgroundColor: colors.inkNavy },
  modeChipText: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey, textAlign: 'center' },
  modeChipTextActive: { color: colors.white },
  entryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  entryCard: { backgroundColor: colors.white, borderRadius: radius.md, marginBottom: 8, overflow: 'hidden' },
  entryDistrict: { fontSize: 12.5, fontWeight: '700', color: colors.inkNavy },
  entryStation: { fontSize: 11.5, color: colors.inkGrey, marginTop: 2 },
  geoStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  geoStatusText: { fontSize: 10, color: colors.inkLight, fontWeight: '600' },
  geoEditBox: { padding: 12, paddingTop: 0, borderTopWidth: 1, borderTopColor: colors.sand },
  sectionLabel: { fontSize: 10.5, fontWeight: '700', color: colors.inkLight, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
  useMyLocBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.inkNavy, borderRadius: radius.sm, paddingVertical: 10, marginTop: 10 },
  useMyLocBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  geoInput: { backgroundColor: colors.sand, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13 },
  restrictedBox: { alignItems: 'center', paddingTop: 80 },
  restrictedText: { fontSize: 13, color: colors.inkLight, marginTop: 12 },
});
