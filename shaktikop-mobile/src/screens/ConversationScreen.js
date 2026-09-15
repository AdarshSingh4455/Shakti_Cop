import React, { useState, useEffect, useCallback, useRef } from 'react';
import { tt } from '../context/LocaleContext';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { formatDateShort, formatTime } from '../utils/datetime';
import { LoadingView } from '../components/LoadingView';
export default function ConversationScreen({ route, navigation }) {
  const { otherId, otherName, otherRole } = route.params;
  const { user, fetchConversation, sendMessage } = useApp();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: otherName || 'बातचीत' });
  }, [otherName]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchConversation(otherId);
      setMessages(data);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [fetchConversation, otherId]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      // भूमिका पता न हो तो officer/admin दोनों की कोशिश backend खुद ठीक से नहीं कर पाएगा —
      // इसलिए यह पेज़ हमेशा inbox से otherRole के साथ खुले, या conversation से पहले से पता चले
      await sendMessage(otherRole || guessRole(otherId, messages, user), otherId, text.trim());
      setText('');
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      // ignore
    }
    setSending(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.sand }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {loading ? (
        <LoadingView />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.senderId === user?.id;
            return (
              <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                    {formatDateShort(item.createdAt)} ·{' '}
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>{tt('अभी कोई संदेश नहीं, नीचे टाइप करके शुरू करें।')}</Text>}
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={tt('संदेश लिखें…')}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={sending}>
          <Ionicons name="send" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// अगर otherRole route param से नहीं मिला (पुरानी बातचीत खोलने पर), पिछले संदेशों से अंदाज़ा लगाएं
function guessRole(otherId, messages, user) {
  const found = messages.find((m) => m.senderId === otherId || m.recipientId === otherId);
  if (found) return found.senderId === otherId ? found.senderRole : found.recipientRole;
  return 'admin';
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 10 },
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: radius.md, padding: 11 },
  bubbleTheirs: { backgroundColor: colors.white },
  bubbleMine: { backgroundColor: colors.inkNavy },
  bubbleText: { fontSize: 13.5, color: colors.inkNavy, lineHeight: 19 },
  bubbleTextMine: { color: colors.white },
  bubbleTime: { fontSize: 9.5, color: colors.inkLight, marginTop: 4, textAlign: 'right' },
  bubbleTimeMine: { color: '#C9D6E4' },
  emptyText: { textAlign: 'center', color: colors.inkLight, marginTop: 40, fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.sand,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: { backgroundColor: colors.shaktiMaroon, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
