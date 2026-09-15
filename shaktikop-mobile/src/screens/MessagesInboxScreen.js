import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { formatDateShort, formatTime } from '../utils/datetime';
import { SkeletonList } from '../components/LoadingView';
import EmptyState from '../components/EmptyState';
function formatDateTime(iso) {
  const d = new Date(iso);
  const dateStr = formatDateShort(d);
  const timeStr = formatTime(d);
  return `${dateStr} · ${timeStr}`;
}

export default function MessagesInboxScreen({ navigation }) {
  const { fetchInbox, fetchMessageRecipients, fetchSentReceivedMessages } = useApp();
  const [tab, setTab] = useState('received'); // 'received' | 'sent'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sent, setSent] = useState([]);
  const [received, setReceived] = useState([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [recipients, setRecipients] = useState({ admins: [], officers: [], truncated: false });
  // 🐛 स्केल-फ़िक्स: पहले पूरे सिस्टम के सभी अधिकारी/एडमिन एक साथ (बिना खोज/सीमा के)
  // लोड होते थे — राज्य-स्तर पर यह हज़ारों हो सकते हैं, जिससे सूची खोलते ही धीमे
  // फ़ोन पर ऐप अटक सकता था। अब खोज-बॉक्स है, और नतीजे हमेशा सीमित (30-50) रहते हैं।
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSentReceivedMessages();
      setSent(data.sent || []);
      setReceived(data.received || []);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [fetchSentReceivedMessages]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchSentReceivedMessages();
      setSent(data.sent || []);
      setReceived(data.received || []);
    } catch (e) {
      // चुपचाप छोड़ें
    }
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, [load]);

  const openNewChat = async () => {
    setRecipientQuery('');
    setPickerVisible(true);
    setRecipientsLoading(true);
    try {
      const data = await fetchMessageRecipients();
      setRecipients(data);
    } catch (e) {
      // ignore
    }
    setRecipientsLoading(false);
  };

  // खोज-बॉक्स में टाइप करते ही 350ms बाद खोजें — हर अक्षर पर server न बुलाएं
  useEffect(() => {
    if (!pickerVisible) return;
    const timer = setTimeout(async () => {
      setRecipientsLoading(true);
      try {
        const data = await fetchMessageRecipients(recipientQuery.trim());
        setRecipients(data);
      } catch (e) {
        // ignore
      }
      setRecipientsLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [recipientQuery, pickerVisible]);

  const startChat = (person) => {
    setPickerVisible(false);
    navigation.navigate('Conversation', { otherId: person.id, otherName: person.name, otherRole: person.role });
  };

  const list = tab === 'sent' ? sent : received;

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.title}>{tt('संदेश')}</Text>
        <TouchableOpacity style={styles.newBtn} onPress={openNewChat}>
          <Ionicons name="create-outline" size={16} color={colors.white} />
          <Text style={styles.newBtnText}>{tt('नया संदेश')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'received' && styles.tabBtnActive]} onPress={() => setTab('received')}>
          <Ionicons name="arrow-down-circle-outline" size={15} color={tab === 'received' ? colors.white : colors.inkGrey} />
          <Text style={[styles.tabBtnText, tab === 'received' && styles.tabBtnTextActive]}>प्राप्त हुए ({received.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'sent' && styles.tabBtnActive]} onPress={() => setTab('sent')}>
          <Ionicons name="arrow-up-circle-outline" size={15} color={tab === 'sent' ? colors.white : colors.inkGrey} />
          <Text style={[styles.tabBtnText, tab === 'sent' && styles.tabBtnTextActive]}>भेजे गए ({sent.length})</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.msgCard}
              onPress={() => navigation.navigate('Conversation', { otherId: item.otherId, otherName: item.otherName })}
            >
              <View style={[styles.avatar, tab === 'sent' && styles.avatarSent]}>
                <Ionicons name={tab === 'sent' ? 'arrow-up' : 'arrow-down'} size={16} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.msgDirection}>{tab === 'sent' ? 'प्रति: ' : 'से: '}{item.otherName || 'उपयोगकर्ता'}</Text>
                <Text style={styles.msgBody} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.msgTime}>{formatDateTime(item.createdAt)}</Text>
              </View>
              {tab === 'received' && !item.readAt && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title={tab === 'sent' ? tt('अभी आपने कोई संदेश नहीं भेजा।') : tt('अभी कोई संदेश प्राप्त नहीं हुआ।')}
              subtitle={tab === 'sent' ? tt('नया संदेश भेजने के लिए नीचे दिए बटन से शुरू करें।') : tt('कोई आपको संदेश भेजेगा तो यहाँ दिखेगा।')}
              actionLabel={tab === 'sent' ? 'नया संदेश लिखें' : undefined}
              onAction={tab === 'sent' ? () => setPickerVisible(true) : undefined}
            />
          }
        />
      )}

      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{tt('किससे बात करें?')}</Text>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color={colors.inkLight} />
              <TextInput
                style={styles.searchInput}
                placeholder={tt('नाम या PNO से खोजें…')}
                value={recipientQuery}
                onChangeText={setRecipientQuery}
                autoCapitalize="none"
                accessibilityLabel={tt('व्यक्ति खोजें')}
                maxLength={100}
              />
              {recipientsLoading && <ActivityIndicator size="small" color={colors.shaktiMaroon} />}
            </View>
            <FlatList
              style={{ maxHeight: 400 }}
              data={[
                ...(recipients.admins.length > 0 ? [{ type: 'header', id: 'h-admin', label: tt('एडमिन') }] : []),
                ...recipients.admins.map((p) => ({ type: 'admin', ...p })),
                ...(recipients.officers.length > 0 ? [{ type: 'header', id: 'h-officer', label: tt('अधिकारी') }] : []),
                ...recipients.officers.map((p) => ({ type: 'officer', ...p })),
              ]}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                if (item.type === 'header') return <Text style={styles.groupLabel}>{item.label}</Text>;
                return (
                  <TouchableOpacity
                    style={styles.personRow}
                    onPress={() => startChat(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                  >
                    <Ionicons name={item.type === 'admin' ? 'ribbon-outline' : 'shield-outline'} size={16} color={item.type === 'admin' ? colors.marigold : colors.inkNavy} />
                    <Text style={styles.personName}>{item.name}</Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                !recipientsLoading ? <Text style={styles.emptySearchText}>{tt('कोई मेल नहीं मिला')}</Text> : null
              }
              ListFooterComponent={
                recipients.truncated ? (
                  <Text style={styles.truncatedHint}>{tt('और भी लोग हैं — नाम/PNO टाइप करके खोजें')}</Text>
                ) : null
              }
              keyboardShouldPersistTaps="handled"
            />
            <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>{tt('रद्द करें')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.shaktiMaroon, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  newBtnText: { fontSize: 12, fontWeight: '700', color: colors.white },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10 },
  tabBtnActive: { backgroundColor: colors.shaktiMaroon, borderColor: colors.shaktiMaroon },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: colors.inkGrey },
  tabBtnTextActive: { color: colors.white },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  msgCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 10,
  },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.inkNavy, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarSent: { backgroundColor: colors.shaktiMaroon },
  msgDirection: { fontSize: 13, fontWeight: '700', color: colors.inkNavy },
  msgBody: { fontSize: 12.5, color: colors.inkGrey, marginTop: 3, lineHeight: 17 },
  msgTime: { fontSize: 10.5, color: colors.inkLight, marginTop: 5 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.shaktiMaroon, marginTop: 4 },
  emptyBox: { alignItems: 'center', marginTop: 40 },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 10, fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.inkNavy, marginBottom: 12 },
  groupLabel: { fontSize: 11, fontWeight: '700', color: colors.inkLight, textTransform: 'uppercase', marginTop: 10, marginBottom: 4 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  personName: { fontSize: 14, color: colors.inkNavy },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.sand, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 13.5, color: colors.inkNavy },
  emptySearchText: { textAlign: 'center', color: colors.inkLight, fontSize: 12.5, paddingVertical: 20 },
  truncatedHint: { textAlign: 'center', color: colors.inkLight, fontSize: 10.5, paddingTop: 10, fontStyle: 'italic' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  cancelBtnText: { color: colors.inkGrey, fontWeight: '600' },
});

