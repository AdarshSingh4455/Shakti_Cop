import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { STATUSES, REJECTED_STATUS } from '../data/constants';
import { useLocale } from '../context/LocaleContext';
import { formatDateTime } from '../utils/datetime';

// ============================================================
// कूरियर-ट्रैकिंग जैसा क्षैतिज (horizontal) स्टेटस स्टेपर — दर्ज → अधिकारी नियुक्त
// → कार्यवाही जारी → निस्तारित। एक ही जगह से बना है ताकि नागरिक डैशबोर्ड की
// शिकायत-कार्ड (mini) और शिकायत विवरण स्क्रीन (full) — दोनों में एक जैसा दिखे।
//
// size="mini"  → छोटी पट्टी, सिर्फ़ डॉट्स + जोड़ने वाली लाइन (कार्ड में fit होने के लिए)
// size="full"  → डॉट्स के साथ हर चरण का लेबल भी (शिकायत विवरण स्क्रीन के ऊपर)
//
// 🐛 बग फ़िक्स: यह visual timeline पहले सिर्फ़ स्टेटस लेबल दिखाता था — कोई भी
// तारीख़/समय (date & time stamp) नहीं, इसलिए यह नहीं पता चलता था कि कोई
// कार्यवाही *कब* हुई। अब `history` prop दिया जाए (और size="full" हो) तो हर
// पूरे हो चुके चरण के नीचे उसकी तारीख़/समय भी दिखता है — "दर्ज" चरण के लिए
// history में अलग entry न मिले तो `createdAt` (शिकायत बनने का समय) दिखता है।
// ============================================================
export default function TimelineStepper({ status, size = 'full', history = [], createdAt }) {
  const { t } = useLocale();
  const isRejected = status === REJECTED_STATUS;
  const stepIndex = isRejected ? 0 : STATUSES.indexOf(status);
  const isMini = size === 'mini';

  if (isRejected) {
    return (
      <View style={[styles.rejectedBar, isMini && styles.rejectedBarMini]}>
        <Ionicons name="close-circle" size={isMini ? 13 : 16} color={colors.alert} />
        <Text style={[styles.rejectedText, isMini && styles.rejectedTextMini]}>{t('अस्वीकृत')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {STATUSES.map((s, i) => {
        const done = i <= stepIndex;
        const isLast = i === STATUSES.length - 1;
        // पहले चरण ("दर्ज") के लिए अलग history entry न भी हो, तो complaint
        // बनने की तारीख़ (createdAt) ही उसका timestamp मानी जाती है
        const entryTime = (history || []).find((h) => h.status === s)?.created_at || (i === 0 ? createdAt : null);
        return (
          <View key={s} style={styles.stepWrap}>
            <View style={styles.dotLineRow}>
              <View style={[isMini ? styles.dotMini : styles.dot, done && (isMini ? styles.dotMiniDone : styles.dotDone)]}>
                {!isMini && (
                  <Ionicons name={done ? 'checkmark' : undefined} size={11} color={done ? colors.white : 'transparent'} />
                )}
              </View>
              {!isLast && <View style={[isMini ? styles.lineMini : styles.line, i < stepIndex && (isMini ? styles.lineMiniDone : styles.lineDone)]} />}
            </View>
            {!isMini && (
              <>
                <Text style={[styles.stepLabel, done && styles.stepLabelDone]} numberOfLines={2}>
                  {t(s)}
                </Text>
                {done && entryTime && (
                  <Text style={styles.stepTime} numberOfLines={2}>
                    {formatDateTime(entryTime)}
                  </Text>
                )}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  stepWrap: { flex: 1, alignItems: 'center' },
  dotLineRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.shaktiMaroon, borderColor: colors.shaktiMaroon },
  line: { flex: 1, height: 3, backgroundColor: colors.border },
  lineDone: { backgroundColor: colors.shaktiMaroon },
  stepLabel: { fontSize: 9.5, color: colors.inkLight, textAlign: 'center', marginTop: 5, fontWeight: '600', paddingHorizontal: 2 },
  stepLabelDone: { color: colors.inkNavy, fontWeight: '800' },
  stepTime: { fontSize: 8, color: colors.inkLight, textAlign: 'center', marginTop: 2, paddingHorizontal: 2 },

  // mini (कार्ड के अंदर) — बिना लेबल, बस छोटे डॉट्स + लाइन
  dotMini: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotMiniDone: { backgroundColor: colors.shaktiMaroon },
  lineMini: { flex: 1, height: 2, backgroundColor: colors.border },
  lineMiniDone: { backgroundColor: colors.shaktiMaroon },

  rejectedBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FBEAE8', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, alignSelf: 'flex-start' },
  rejectedBarMini: { paddingVertical: 4, paddingHorizontal: 8, gap: 4 },
  rejectedText: { fontSize: 12.5, fontWeight: '700', color: colors.alert },
  rejectedTextMini: { fontSize: 10.5 },
});
