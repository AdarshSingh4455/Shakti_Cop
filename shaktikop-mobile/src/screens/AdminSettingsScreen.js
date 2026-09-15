import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { HELPLINES } from '../data/constants';

export default function AdminSettingsScreen({ navigation }) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [autoAssignAlerts, setAutoAssignAlerts] = useState(true);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('सेटिंग्स')}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('खाता')}</Text>
        <SettingRow icon="person-outline" label={tt('प्रोफ़ाइल संपादित करें')} onPress={() => navigation.navigate('AdminProfile')} />
        <SettingRow icon="key-outline" label={tt('पासवर्ड बदलें')} onPress={() => navigation.navigate('AdminProfile', { section: 'password' })} last />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('सूचनाएं')}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{tt('अधिकारी नियुक्ति पर अलर्ट भेजें')}</Text>
          <Switch value={autoAssignAlerts} onValueChange={setAutoAssignAlerts} trackColor={{ true: colors.sage }} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{tt('Push notifications सक्रिय रखें')}</Text>
          <Switch value={pushEnabled} onValueChange={setPushEnabled} trackColor={{ true: colors.sage }} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('हेल्पलाइन नंबर')}</Text>
        {HELPLINES.map((h) => (
          <View key={h.number} style={styles.helplineRow}>
            <Text style={styles.helplineLabel}>{h.label}</Text>
            <Text style={styles.helplineNum}>{h.number}</Text>
          </View>
        ))}
        <Text style={styles.hint}>{tt('हेल्पलाइन नंबर संपादित करना Phase C में जोड़ा जाएगा (अभी कोड में तय हैं)।')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('ऐप जानकारी')}</Text>
        <SettingRow icon="information-circle-outline" label={tt('ShaktiCop संस्करण 1.0 (Phase B)')} static />
        <SettingRow icon="shield-checkmark-outline" label={tt('उत्तर प्रदेश पुलिस — मिशन शक्ति')} static last />
      </View>
    </ScrollView>
  );
}

function SettingRow({ icon, label, onPress, static: isStatic, last }) {
  const Wrapper = isStatic ? View : TouchableOpacity;
  return (
    <Wrapper style={[styles.row, !last && styles.rowBorder]} onPress={onPress}>
      <Ionicons name={icon} size={18} color={colors.inkGrey} />
      <Text style={styles.rowLabel}>{label}</Text>
      {!isStatic && <Ionicons name="chevron-forward" size={16} color={colors.inkLight} />}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginBottom: 14 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 14,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.inkNavy, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { flex: 1, fontSize: 13.5, color: colors.inkNavy, fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  switchLabel: { fontSize: 13, color: colors.inkGrey, flex: 1, marginRight: 10 },
  helplineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  helplineLabel: { fontSize: 13, color: colors.inkGrey },
  helplineNum: { fontSize: 13, fontWeight: '700', color: colors.inkNavy },
  hint: { fontSize: 11, color: colors.inkLight, marginTop: 10, lineHeight: 16 },
});
