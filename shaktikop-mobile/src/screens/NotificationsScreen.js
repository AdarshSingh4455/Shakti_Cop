import React, { useEffect, useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import EmptyState from '../components/EmptyState';

import { formatDateTime } from '../utils/datetime';

// 🆕 Notification Priority — पहले हर सूचना एक जैसी दिखती थी (SOS हो या सामान्य
// "नया संदेश"), जिससे यह पहचानना मुश्किल था कि पहले किसे देखना ज़रूरी है।
// अब critical/high सूचनाओं पर साफ़ रंगीन बैज व बॉर्डर दिखता है — medium (सामान्य)
// सूचनाओं पर कोई बैज नहीं (ताकि सूची अव्यवस्थित न लगे, सिर्फ़ ज़रूरी चीज़ें उभरें)।
const PRIORITY_META = {
  critical: { label: 'गंभीर', color: colors.alert, icon: 'alert-circle' },
  high: { label: 'ज़रूरी', color: colors.marigold, icon: 'warning' },
};

function PriorityBadge({ priority }) {
  const meta = PRIORITY_META[priority];
  if (!meta) return null;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: meta.color }]}>
      <Ionicons name={meta.icon} size={11} color={colors.white} />
      <Text style={badgeStyles.badgeText}>{tt(meta.label)}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 },
  badgeText: { fontSize: 9.5, fontWeight: '800', color: colors.white },
});

export default function NotificationsScreen({ navigation }) {
  const { notifications, unreadCount, loadNotifications, markNotificationRead, markAllNotificationsRead } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await loadNotifications();
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setRefreshing(false);
  };

  const onPressItem = async (item) => {
    if (!item.isRead) await markNotificationRead(item.id);
    if (item.data?.complaintId) {
      navigation.navigate('ComplaintDetail', { id: item.data.complaintId });
    }
  };

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllBtn} onPress={markAllNotificationsRead}>
          <Text style={styles.markAllText}>{tt('सभी को पढ़ा हुआ मानें')}</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.card,
              !item.isRead && styles.cardUnread,
              item.priority === 'critical' && styles.cardCritical,
              item.priority === 'high' && styles.cardHigh,
            ]}
            onPress={() => onPressItem(item)}
          >
            {!item.isRead && <View style={[styles.dot, item.priority === 'critical' && { backgroundColor: colors.alert }]} />}
            <View style={{ flex: 1 }}>
              <PriorityBadge priority={item.priority} />
              <Text style={styles.title}>{item.title}</Text>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
              <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-off-outline"
            title="अभी कोई सूचना नहीं है।"
            subtitle="नई शिकायत, स्थिति-अपडेट या SOS अलर्ट यहीं दिखेंगे।"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  markAllBtn: { alignSelf: 'flex-end', margin: 16, marginBottom: 4 },
  markAllText: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
  list: { padding: 16, paddingTop: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  cardUnread: { backgroundColor: colors.shaktiMaroonWash },
  cardCritical: { borderLeftWidth: 4, borderLeftColor: colors.alert },
  cardHigh: { borderLeftWidth: 4, borderLeftColor: colors.marigold },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.shaktiMaroon, marginTop: 5 },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  body: { fontSize: 12.5, color: colors.inkGrey, marginTop: 3, lineHeight: 18 },
  time: { fontSize: 10.5, color: colors.inkLight, marginTop: 6 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 13, color: colors.inkLight, marginTop: 12 },
});
