import React, { useState, useEffect } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { CHANGELOG, CURRENT_VERSION } from '../data/changelog';

const LAST_SEEN_KEY = 'shaktikop:lastSeenVersion';

export default function WhatsNewModal() {
  const [visible, setVisible] = useState(false);
  const [newEntries, setNewEntries] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
        if (lastSeen === CURRENT_VERSION) return;

        if (!lastSeen) {
          await AsyncStorage.setItem(LAST_SEEN_KEY, CURRENT_VERSION);
          return;
        }

        const lastSeenIndex = CHANGELOG.findIndex((c) => c.version === lastSeen);
        const entries = lastSeenIndex === -1 ? [CHANGELOG[0]] : CHANGELOG.slice(0, lastSeenIndex);
        if (entries.length > 0) {
          setNewEntries(entries);
          setVisible(true);
        }
        await AsyncStorage.setItem(LAST_SEEN_KEY, CURRENT_VERSION);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Ionicons name="sparkles" size={20} color={colors.marigold} />
            <Text style={styles.title}>{tt('क्या नया है')}</Text>
            <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.inkGrey} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }}>
            {newEntries.map((entry) => (
              <View key={entry.version} style={styles.versionBlock}>
                <Text style={styles.versionLabel}>Version {entry.version} · {entry.date}</Text>
                {entry.changes.map((c, i) => (
                  <View key={i} style={styles.changeRow}>
                    <Text style={styles.changeDot}>●</Text>
                    <Text style={styles.changeText}>{c}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.okBtn} onPress={() => setVisible(false)}>
            <Text style={styles.okBtnText}>{tt('ठीक है')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.inkNavy },
  closeBtn: { padding: 4 },
  versionBlock: { marginBottom: 18 },
  versionLabel: { fontSize: 11.5, fontWeight: '700', color: colors.shaktiMaroon, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  changeRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  changeDot: { fontSize: 8, color: colors.marigold, marginTop: 5 },
  changeText: { flex: 1, fontSize: 13, color: colors.inkGrey, lineHeight: 19 },
  okBtn: { backgroundColor: colors.shaktiMaroon, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  okBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
