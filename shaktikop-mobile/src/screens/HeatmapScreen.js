import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tt } from '../context/LocaleContext';
import OsmMapView from '../components/OsmMapView';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { LoadingView } from '../components/LoadingView';

// 🐛 बग फ़िक्स: नीचे का hint टेक्स्ट पहले से कहता था "रंग श्रेणी दर्शाता है", पर मार्करों
// को कभी कोई रंग दिया ही नहीं जाता था — सभी एक जैसे (डिफ़ॉल्ट) दिखते थे। अब हर शिकायत-श्रेणी
// का अपना रंग है, जैसा टेक्स्ट पहले से वादा करता था।
const CATEGORY_COLORS = {
  'महिला हेल्प डेस्क': '#8E2A46',
  'एंटी रोमियो स्क्वॉड': '#0F2A44',
  'घरेलू हिंसा': '#B5471B',
  'सुरक्षित यात्रा मोड': '#2E7D5B',
  'वॉइस शिकायत': '#6B4C9A',
};
const DEFAULT_COLOR = '#8A8578';

export default function HeatmapScreen() {
  const { fetchHeatmapPoints } = useApp();
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchHeatmapPoints();
      setPoints(data);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [fetchHeatmapPoints]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingView />
      </View>
    );
  }

  const center = points.length > 0
    ? { latitude: points[0].latitude, longitude: points[0].longitude }
    : { latitude: 26.85, longitude: 80.95 };

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>{points.length} {tt('शिकायतों की लोकेशन — रंग श्रेणी दर्शाता है')}</Text>
      <OsmMapView
        style={styles.map}
        region={{ ...center, latitudeDelta: 0.5, longitudeDelta: 0.5 }}
        markers={points.map((p, i) => ({
          id: `pt-${i}`,
          latitude: p.latitude,
          longitude: p.longitude,
          title: p.category,
          description: p.status,
          color: CATEGORY_COLORS[p.category] || DEFAULT_COLOR,
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  hint: { fontSize: 11.5, color: colors.inkLight, padding: 12, lineHeight: 16 },
  map: { flex: 1 },
});
