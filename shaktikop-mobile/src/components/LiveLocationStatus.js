import React from 'react';
import { Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors } from '../theme/colors';
import { timeAgo } from '../utils/datetime';

// ============================================================
// नागरिक की लाइव लोकेशन अभी चालू है या बंद — और आख़िरी जगह कहाँ थी,
// यह अब सिर्फ़ नागरिक की अपनी स्क्रीन पर नहीं बल्कि हर अधिकारी/एडमिन डैशबोर्ड
// (SOS, सुरक्षित यात्रा, सभी शिकायतें) पर भी दिखता है।
// ============================================================
export default function LiveLocationStatus({ complaint, compact = false }) {
  if (!complaint) return null;
  const active = !!complaint.liveShareActive;
  const hasLastKnown = !!(complaint.liveLat && complaint.liveLng);

  // कभी लाइव लोकेशन शेयर ही नहीं हुई — कुछ न दिखाएं, फ़ालतू भीड़ न हो
  if (!active && !hasLastKnown) return null;

  const openMap = () => {
    if (!hasLastKnown) return;
    const { liveLat: lat, liveLng: lng } = complaint;
    const url = `geo:${lat},${lng}?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`).catch(() => {});
    });
  };

  return (
    <TouchableOpacity
      activeOpacity={hasLastKnown ? 0.7 : 1}
      onPress={hasLastKnown ? openMap : undefined}
      style={[styles.row, compact && styles.rowCompact]}
    >
      <Ionicons
        name={active ? 'radio' : 'radio-outline'}
        size={compact ? 12 : 13}
        color={active ? colors.sage : colors.inkLight}
      />
      <Text style={[styles.text, compact && styles.textCompact, active && styles.textActive]}>
        {active ? tt('लाइव लोकेशन: चालू') : tt('लाइव लोकेशन: बंद')}
        {complaint.liveUpdatedAt ? ` · ${active ? tt('अपडेट') : tt('आख़िरी बार')} ${timeAgo(complaint.liveUpdatedAt)}` : ''}
      </Text>
      {hasLastKnown && <Ionicons name="chevron-forward" size={12} color={colors.inkLight} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, paddingVertical: 2 },
  rowCompact: { marginTop: 2 },
  text: { fontSize: 11.5, color: colors.inkGrey, flex: 1 },
  textCompact: { fontSize: 10.5 },
  textActive: { color: colors.sage, fontWeight: '700' },
});
