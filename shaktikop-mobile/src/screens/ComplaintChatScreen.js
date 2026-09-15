import React, { useState, useEffect, useCallback, useRef } from 'react';
import { tt } from '../context/LocaleContext';
import { usePreventScreenshot } from '../hooks/usePreventScreenshot';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { formatDateShort, formatTime } from '../utils/datetime';
import { LoadingView } from '../components/LoadingView';

// 🆕 Complaint Chat — नागरिक और नियुक्त अधिकारी के बीच सीधी, केस-दायरे में
// बातचीत। असली WebSocket की जगह — जो अभी इस backend में मौजूद नहीं है और बिना
// डिवाइस-टेस्ट के जोड़ना जोखिम भरा होता — यहां polling (हर 5 सेकंड) से
// "near-real-time" अनुभव मिलता है, ठीक वैसे ही जैसे इस ऐप में SOS/live-location
// जैसी दूसरी "लाइव" सुविधाएं पहले से काम करती हैं (ComplaintDetailScreen देखें)।
// साथ ही नया संदेश आते ही push notification भी मिलती है (चाहे स्क्रीन खुली हो या नहीं)।
const POLL_INTERVAL_MS = 5000;

export default function ComplaintChatScreen({ route, navigation }) {
  // 🔒 बग फ़िक्स: यह नई (chat) स्क्रीन केस से जुड़ी संवेदनशील बातचीत दिखाती है —
  // पहले बनी 3 संवेदनशील स्क्रीन जैसी स्क्रीनशॉट-सुरक्षा यहां जोड़ना छूट गया था।
  usePreventScreenshot();
  const { complaintId, otherName } = route.params;
  const { user, fetchComplaintMessages, sendComplaintMessage } = useApp();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: otherName || tt('बातचीत') });
  }, [otherName]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await fetchComplaintMessages(complaintId);
        setMessages((prev) => {
          // चुपचाप (polling) रिफ़्रेश में — अगर संदेश-संख्या नहीं बदली तो state न छुएं,
          // वरना हर 5 सेकंड में पूरी सूची फिर से रेंडर होती और स्क्रॉल-स्थिति कूदती
          if (silent && prev.length === data.length) return prev;
          return data;
        });
      } catch (e) {
        // ignore — अगली बार फिर कोशिश होगी
      }
      if (!silent) setLoading(false);
    },
    [fetchComplaintMessages, complaintId]
  );

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL_MS);
    // ऐप background से वापस आने पर तुरंत ताज़ा करें (अगली polling तक इंतज़ार न करना पड़े)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load(true);
    });
    return () => {
      clearInterval(pollRef.current);
      sub.remove();
    };
  }, [load]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const body = text.trim();
    setText('');
    try {
      await sendComplaintMessage(complaintId, body);
      await load(true);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setText(body); // भेजना विफल हो तो टाइप किया हुआ वापस दे दें, खोना नहीं चाहिए
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
            const mine = item.senderRole === user?.role && item.senderId === user?.id;
            return (
              <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && <Text style={styles.bubbleSender}>{item.senderName}</Text>}
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                    {formatDateShort(item.createdAt)} · {formatTime(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{tt('अभी कोई संदेश नहीं, नीचे टाइप करके शुरू करें।')}</Text>
          }
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
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={sending || !text.trim()}>
          <Ionicons name="send" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 10 },
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: radius.md, padding: 11 },
  bubbleTheirs: { backgroundColor: colors.white },
  bubbleMine: { backgroundColor: colors.shaktiMaroon },
  bubbleSender: { fontSize: 10.5, fontWeight: '700', color: colors.inkNavyLight, marginBottom: 3 },
  bubbleText: { fontSize: 13.5, color: colors.inkNavy, lineHeight: 19 },
  bubbleTextMine: { color: colors.white },
  bubbleTime: { fontSize: 9.5, color: colors.inkLight, marginTop: 4, textAlign: 'right' },
  bubbleTimeMine: { color: '#F0D8DE' },
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
