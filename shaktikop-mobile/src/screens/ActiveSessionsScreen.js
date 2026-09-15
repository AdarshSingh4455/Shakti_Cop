import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { formatDateTime } from '../utils/datetime';
import { LoadingView } from '../components/LoadingView';

// 🆕 "किन-किन डिवाइस में लॉगिन है" — नागरिक/अधिकारी/एडमिन/काउंसलर सभी इस्तेमाल कर
// सकते हैं (कोई role-प्रतिबंध नहीं — हर किसी को अपने खाते की सुरक्षा का हक़ है)।
// हर सक्रिय सत्र का डिवाइस-नाम व आख़िरी सक्रियता-समय दिखाता है, और किसी एक चुने
// हुए डिवाइस को अकेले भी लॉगआउट किया जा सकता है (सिर्फ़ "सभी एक साथ" नहीं)।
export default function ActiveSessionsScreen() {
  const { fetchActiveDeviceSessions, revokeDeviceSession } = useApp();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchActiveDeviceSessions();
      setSessions(data);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, [fetchActiveDeviceSessions]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const doRevoke = (session) => {
    Alert.alert(
      tt('इस डिवाइस से लॉगआउट करें?'),
      tt(`"${session.deviceName}" से आपका खाता लॉगआउट हो जाएगा। यह पक्का करना चाहते हैं?`),
      [
        { text: tt('रद्द करें'), style: 'cancel' },
        {
          text: tt('हाँ, लॉगआउट करें'),
          style: 'destructive',
          onPress: async () => {
            setRevokingId(session.id);
            try {
              await revokeDeviceSession(session.id);
              await load();
            } catch (e) {
              Alert.alert(tt('त्रुटि'), e.message);
            }
            setRevokingId(null);
          },
        },
      ]
    );
  };

  if (loading) return <LoadingView />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.hint}>
        {tt('आपका खाता इन डिवाइस पर सक्रिय (लॉगिन) है। कोई डिवाइस पहचान में न आए तो उसे तुरंत लॉगआउट करें।')}
      </Text>

      {sessions.length === 0 ? (
        <Text style={styles.emptyText}>{tt('कोई सक्रिय सत्र नहीं मिला।')}</Text>
      ) : (
        sessions.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={styles.iconBox}>
              <Ionicons name="phone-portrait-outline" size={20} color={colors.shaktiMaroon} />
            </View>
            <View style={{ flex: 1 }}>
              {/* 🐛 बग फ़िक्स: fallback नाम ("iOS डिवाइस"/"Android डिवाइस") हिंदी में
                  ही सेव होता है — और होना भी यही चाहिए, क्योंकि यह मान बैकएंड में
                  स्थायी रूप से दर्ज होता है (सेव करते समय अनुवाद करते तो हर उपयोगकर्ता
                  की भाषा के हिसाब से अलग-अलग मान जमा होते)। इसलिए अनुवाद दिखाते समय। */}
              <Text style={styles.deviceName}>{tt(s.deviceName)}</Text>
              <Text style={styles.meta}>
                {tt('आख़िरी बार सक्रिय')}: {formatDateTime(s.lastUsedAt)}
              </Text>
              <Text style={styles.metaLight}>
                {tt('लॉगिन हुआ')}: {formatDateTime(s.createdAt)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.revokeBtn}
              onPress={() => doRevoke(s)}
              disabled={revokingId === s.id}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.alert} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  hint: { fontSize: 12, color: colors.inkGrey, marginBottom: 16, lineHeight: 17 },
  emptyText: { textAlign: 'center', color: colors.inkLight, fontSize: 13, paddingVertical: 30 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceName: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  meta: { fontSize: 11, color: colors.inkGrey, marginTop: 3 },
  metaLight: { fontSize: 10.5, color: colors.inkLight, marginTop: 1 },
  revokeBtn: { padding: 8 },
});
