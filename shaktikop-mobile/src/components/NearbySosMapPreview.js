import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { REJECTED_STATUS } from '../data/constants';
import OsmMapView from './OsmMapView';

// ============================================================
// सक्रिय SOS की मिनी-मैप झलक — डैशबोर्ड पर एक नज़र में दिखे कि आस-पास कोई
// सक्रिय SOS है या नहीं, बिना पूरी SOS स्क्रीन खोले। सिर्फ़ तभी दिखता है
// जब कम से कम एक सक्रिय SOS की लाइव लोकेशन उपलब्ध हो — वरना डैशबोर्ड पर
// फ़ालतू खाली जगह नहीं बनती।
// ============================================================
export default function NearbySosMapPreview({ complaints, onPress }) {
  const activeSos = (complaints || []).filter(
    (c) => c.sosTriggered && !c.safeArrivalConfirmed && c.status !== 'निस्तारित' && c.status !== REJECTED_STATUS && c.liveLat && c.liveLng
  );

  if (activeSos.length === 0) return null;

  const avgLat = activeSos.reduce((sum, c) => sum + Number(c.liveLat), 0) / activeSos.length;
  const avgLng = activeSos.reduce((sum, c) => sum + Number(c.liveLng), 0) / activeSos.length;
  // एक से ज़्यादा हों तो थोड़ा ज़ूम-आउट ताकि सभी दिखें
  const delta = activeSos.length > 1 ? 0.12 : 0.03;

  return (
    <TouchableOpacity style={styles.wrap} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.header}>
        <View style={styles.pulseDot} />
        <Text style={styles.title}>
          {tt('पास में सक्रिय SOS')} ({activeSos.length})
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.white} />
      </View>
      <View style={styles.mapWrap} pointerEvents="none">
        <OsmMapView
          style={{ flex: 1 }}
          region={{ latitude: avgLat, longitude: avgLng, latitudeDelta: delta, longitudeDelta: delta }}
          markers={activeSos.map((c) => ({
            id: c.id,
            latitude: Number(c.liveLat),
            longitude: Number(c.liveLng),
            title: `${c.id}`,
            description: c.victimName || c.category,
            color: '#8E2A46',
          }))}
        />
      </View>
      <Text style={styles.hint}>{tt('मैप देखने के लिए दबाएं')}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', marginBottom: 16, backgroundColor: colors.alert },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  pulseDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.white },
  title: { flex: 1, color: colors.white, fontSize: 13.5, fontWeight: '800' },
  mapWrap: { height: 140, backgroundColor: colors.sand },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, textAlign: 'center', paddingVertical: 6 },
});
