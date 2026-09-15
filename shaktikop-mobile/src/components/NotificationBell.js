import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';

// 🐛 बग फ़िक्स: priority व्यवस्था (critical/high/medium) बनाई गई थी, पर हमेशा-दिखने
// वाला यह bell-icon सिर्फ़ सामान्य गिनती दिखाता था — SOS/"मुझे मदद चाहिए" जैसी
// गंभीर सूचना और "नया संदेश" एक जैसे ही दिखते। अब सक्रिय-गंभीर सूचना होने पर घंटी
// लाल रंग में हल्के-हल्के धड़कती (pulse) है, ताकि टैप किए बिना ही तुरंत ध्यान जाए।
export default function NotificationBell({ tintColor = colors.white }) {
  const { unreadCount, hasCriticalUnread } = useApp();
  const navigation = useNavigation();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hasCriticalUnread) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasCriticalUnread]);

  return (
    <TouchableOpacity style={styles.wrap} onPress={() => navigation.navigate('Notifications')}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Ionicons name={hasCriticalUnread ? 'notifications' : 'notifications-outline'} size={22} color={hasCriticalUnread ? colors.alert : tintColor} />
      </Animated.View>
      {unreadCount > 0 && (
        <View style={[styles.badge, hasCriticalUnread && styles.badgeCritical]}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 10, position: 'relative' },
  badge: {
    position: 'absolute',
    top: -2,
    right: 2,
    backgroundColor: '#B23A2E',
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeCritical: {
    backgroundColor: colors.alert,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
