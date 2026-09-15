import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

import { SkeletonList } from '../components/LoadingView';
import EmptyState from '../components/EmptyState';
export default function FaqScreen() {
  const { fetchPublicFaq } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPublicFaq();
      setItems(data);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [fetchPublicFaq]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'सामान्य';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonList rows={5} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('मदद और सामान्य प्रश्न')}</Text>

      {Object.keys(grouped).length === 0 ? (
        <EmptyState
          icon="help-circle-outline"
          title={tt('अभी कोई FAQ उपलब्ध नहीं है।')}
          subtitle={tt('जल्द ही मददगार जवाब यहाँ जोड़े जाएंगे। तब तक सहायता के लिए हेल्पलाइन से संपर्क करें।')}
          compact
        />
      ) : (
        Object.entries(grouped).map(([category, list]) => (
          <View key={category} style={{ marginBottom: 18 }}>
            <Text style={styles.categoryTitle}>{tt(category)}</Text>
            {list.map((item) => (
              <TouchableOpacity key={item.id} style={styles.card} onPress={() => setOpenId(openId === item.id ? null : item.id)} activeOpacity={0.8}>
                <View style={styles.qRow}>
                  <Text style={styles.question}>{tt(item.question)}</Text>
                  <Ionicons name={openId === item.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkGrey} />
                </View>
                {openId === item.id && <Text style={styles.answer}>{tt(item.answer)}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginBottom: 16 },
  categoryTitle: { fontSize: 12, fontWeight: '700', color: colors.shaktiMaroon, marginBottom: 8, textTransform: 'uppercase' },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 8 },
  qRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  question: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy, flex: 1 },
  answer: { fontSize: 12.5, color: colors.inkGrey, marginTop: 10, lineHeight: 18 },
  empty: { textAlign: 'center', color: colors.inkLight, marginTop: 40 },
});
