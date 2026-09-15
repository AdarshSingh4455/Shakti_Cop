import React from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { CATEGORY_DEFS } from '../data/constants';

export default function NewComplaintScreen({ navigation }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('नई शिकायत — श्रेणी चुनें')}</Text>
      <View style={styles.catGrid}>
        {CATEGORY_DEFS.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.catCard, { borderTopColor: c.color }]}
            onPress={() => navigation.navigate('ComplaintForm', { category: c.key })}
            activeOpacity={0.85}
          >
            <View style={[styles.catIconWrap, { backgroundColor: c.color }]}>
              <Ionicons name={c.icon} size={20} color={colors.white} />
            </View>
            <Text style={styles.catTitle}>{tt(c.label)}</Text>
            {/* 🐛 बग फ़िक्स: ऊपर शीर्षक तो tt() से गुज़रता था, पर कार्ड के नीचे का यह
                विवरण सीधे कच्चा दिखता था — अंग्रेज़ी मोड में भी हमेशा हिंदी ही रहता। */}
            <Text style={styles.catDesc}>{tt(c.desc)}</Text>
            <Text style={[styles.catLink, { color: c.color }]}>{tt('शिकायत दर्ज करें →')}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 17, fontWeight: '700', color: colors.inkNavy, marginBottom: 14 },
  catGrid: { gap: 12 },
  catCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
    borderTopWidth: 4,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  catIconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  catTitle: { fontSize: 15, fontWeight: '700', color: colors.inkNavy },
  catDesc: { fontSize: 12, color: colors.inkGrey, marginTop: 4, lineHeight: 17 },
  catLink: { fontSize: 12.5, fontWeight: '700', marginTop: 10 },
});
