import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OsmMapView from '../components/OsmMapView';
import * as Location from 'expo-location';
import { ensureLocationPermission, getPositionWithTimeout } from '../utils/locationPermission';
import { colors, radius } from '../theme/colors';
import { fetchNearby } from '../services/api';

import { LoadingView } from '../components/LoadingView';
// OSRM का मुफ़्त पब्लिक routing सर्वर — बिना किसी API key के सड़क के रास्ते वाला route देता है
async function fetchRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    const route = data.routes[0];
    const routeCoords = route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
    return { coords: routeCoords, distanceKm: (route.distance / 1000).toFixed(1) };
  } catch (e) {
    return null;
  }
}

export default function NearbyHelpScreen() {
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [police, setPolice] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [policeRoute, setPoliceRoute] = useState(null);
  const [hospitalRoute, setHospitalRoute] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPoliceRoute(null);
    setHospitalRoute(null);
    try {
      const perm = await ensureLocationPermission();
      if (!perm.granted) {
        setError(tt('लोकेशन अनुमति के बिना नज़दीकी जगहें नहीं दिखाई जा सकतीं।'));
        setLoading(false);
        return;
      }
      // 🐛 बग फ़िक्स: GPS अटकने पर स्क्रीन हमेशा के लिए loading पर अटकी रहती थी
      const pos = await getPositionWithTimeout({ timeoutMs: 10000, accuracy: Location.Accuracy.Balanced });
      if (!pos) {
        setError(tt('लोकेशन नहीं मिल सकी — खुले आसमान के नीचे जाकर दोबारा कोशिश करें।'));
        setLoading(false);
        return;
      }
      const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setCoords(here);

      const [policeData, hospitalData] = await Promise.all([
        fetchNearby(here.latitude, here.longitude, 'police'),
        fetchNearby(here.latitude, here.longitude, 'hospital'),
      ]);
      const policeResults = (policeData.results || []).filter((r) => r.latitude && r.longitude);
      const hospitalResults = (hospitalData.results || []).filter((r) => r.latitude && r.longitude);
      setPolice(policeResults);
      setHospitals(hospitalResults);
      setLoading(false);

      // नज़दीकी थाना व अस्पताल तक route line — background में लोड होगी, map पहले ही दिख जाएगा
      if (policeResults[0]) fetchRoute(here, policeResults[0]).then(setPoliceRoute);
      if (hospitalResults[0]) fetchRoute(here, hospitalResults[0]).then(setHospitalRoute);
    } catch (e) {
      setError(e.message || tt('नज़दीकी जगहें लोड नहीं हो सकीं।'));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const callIfAvailable = () => {
    Linking.openURL('tel:112').catch(() => {});
  };

  const nearestPolice = police[0];
  const nearestHospital = hospitals[0];

  return (
    <View style={styles.container}>
      {loading ? (
        <LoadingView />
      ) : error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.alert} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>{tt('दोबारा कोशिश करें')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.emergencyBtn} onPress={callIfAvailable}>
            <Ionicons name="call" size={16} color={colors.white} />
            <Text style={styles.emergencyBtnText}>{tt('तुरंत 112 पर कॉल करें')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        coords && (
          <>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <Ionicons name="shield-checkmark" size={14} color="#0F2A44" />
                <Text style={styles.legendText} numberOfLines={1}>
                  {nearestPolice
                    ? `${nearestPolice.name} · ${policeRoute?.distanceKm ?? nearestPolice.distanceKm ?? '…'} किमी`
                    : tt('नज़दीकी थाना नहीं मिला')}
                </Text>
              </View>
              <View style={styles.legendItem}>
                <Ionicons name="medkit" size={14} color="#2E7D5B" />
                <Text style={styles.legendText} numberOfLines={1}>
                  {nearestHospital
                    ? `${nearestHospital.name} · ${hospitalRoute?.distanceKm ?? nearestHospital.distanceKm ?? '…'} किमी`
                    : tt('नज़दीकी अस्पताल नहीं मिला')}
                </Text>
              </View>
            </View>

            <OsmMapView
              style={styles.map}
              region={{ latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
              markers={[
                { id: 'me', latitude: coords.latitude, longitude: coords.longitude, title: tt('आप यहाँ हैं'), color: '#8E2A46' },
                ...police.map((r, i) => ({
                  id: `police-${i}`,
                  latitude: r.latitude,
                  longitude: r.longitude,
                  title: r.name,
                  description: r.distanceKm != null ? `${r.distanceKm} किमी` : r.address,
                  color: '#0F2A44',
                })),
                ...hospitals.map((r, i) => ({
                  id: `hospital-${i}`,
                  latitude: r.latitude,
                  longitude: r.longitude,
                  title: r.name,
                  description: r.distanceKm != null ? `${r.distanceKm} किमी` : r.address,
                  color: '#2E7D5B',
                })),
              ]}
              polylines={[
                policeRoute?.coords ? { id: 'police-route', coords: policeRoute.coords, color: '#0F2A44', width: 4 } : null,
                hospitalRoute?.coords ? { id: 'hospital-route', coords: hospitalRoute.coords, color: '#2E7D5B', width: 4 } : null,
              ].filter(Boolean)}
            />
          </>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  legendRow: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: colors.white },
  legendItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.sand, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  legendText: { fontSize: 11.5, fontWeight: '600', color: colors.inkNavy, flex: 1 },
  map: { flex: 1, width: '100%' },
  errorBox: { alignItems: 'center', padding: 30, marginTop: 20 },
  errorText: { fontSize: 13, color: colors.inkGrey, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  retryBtn: { marginTop: 16, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.shaktiMaroon, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18 },
  retryBtnText: { color: colors.shaktiMaroon, fontWeight: '700', fontSize: 12.5 },
  emergencyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: colors.alert, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18 },
  emergencyBtnText: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
});
