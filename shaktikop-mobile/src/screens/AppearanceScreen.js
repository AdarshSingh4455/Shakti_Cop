import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import {
  appearance,
  saveAppearance,
  applyAppearance,
  DEFAULT_APPEARANCE,
  COLOR_PRESETS,
  SHAPE_PRESETS,
  DENSITY_PRESETS,
  TABLE_STYLES,
  CARD_STYLES,
} from '../theme/appearance';

// ============================================================
// रूप-रंग व लेआउट — सिर्फ़ Super Admin
// रंग, कोनों का आकार, कार्ड की शैली, तालिका का रूप और घनत्व।
// ============================================================

function Option({ active, label, hint, onPress, swatch }) {
  return (
    <TouchableOpacity style={[styles.opt, active && styles.optActive]} onPress={onPress} activeOpacity={0.8}>
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.optLabel, active && styles.optLabelActive]}>{tt(label)}</Text>
        {hint ? <Text style={styles.optHint}>{tt(hint)}</Text> : null}
      </View>
      <Ionicons
        name={active ? 'radio-button-on' : 'radio-button-off'}
        size={18}
        color={active ? colors.shaktiMaroon : colors.inkLight}
      />
    </TouchableOpacity>
  );
}

export default function AppearanceScreen() {
  const { user, updateAdminSetting } = useApp();
  const [draft, setDraft] = useState({ ...DEFAULT_APPEARANCE, ...appearance });
  const [busy, setBusy] = useState(false);

  if (user?.adminRole !== 'super_admin') {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={34} color={colors.inkLight} />
        <Text style={styles.denied}>{tt('यह सेक्शन सिर्फ़ Super Admin के लिए है।')}</Text>
      </View>
    );
  }

  const set = (k, v) => setDraft({ ...draft, [k]: v });

  const preset = COLOR_PRESETS.find((p) => p.key === draft.colorPreset) || COLOR_PRESETS[0];
  const previewPrimary = /^#[0-9a-fA-F]{6}$/.test(draft.customPrimary) ? draft.customPrimary : preset.primary;
  const shape = SHAPE_PRESETS.find((s) => s.key === draft.shape) || SHAPE_PRESETS[2];

  const save = async () => {
    if (draft.customPrimary && !/^#[0-9a-fA-F]{6}$/.test(draft.customPrimary)) {
      return Alert.alert(tt('गलत रंग कोड'), tt('सही hex कोड डालें (जैसे #8E2A46)'));
    }
    setBusy(true);
    try {
      await saveAppearance(draft); // फ़ोन में
      applyAppearance(draft); // तुरंत लागू (नई बनने वाली styles पर)
      try {
        // सर्वर पर भी — ताकि दूसरे Super Admin भी वही देखें
        await updateAdminSetting('appearance', draft);
      } catch (e) {
        // सर्वर न मिले तो भी फ़ोन में सुरक्षित है
      }
      Alert.alert(
        tt('सुरक्षित हुआ'),
        tt('नया रूप पूरे ऐप में लागू होगा। बदलाव पूरी तरह दिखने के लिए ऐप बंद करके दोबारा खोलें।')
      );
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const reset = () => {
    Alert.alert(tt('डिफ़ॉल्ट पर लौटें?'), tt('सारे रूप-रंग के बदलाव हट जाएंगे।'), [
      { text: tt('रद्द करें'), style: 'cancel' },
      {
        text: tt('हाँ, लौटें'),
        style: 'destructive',
        onPress: () => setDraft({ ...DEFAULT_APPEARANCE }),
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 50 }}>
      <View style={styles.warnBox}>
        <Ionicons name="color-palette-outline" size={17} color="#B26A00" />
        <Text style={styles.warnText}>
          {tt('यहाँ किया गया बदलाव पूरे प्रदेश के सभी उपयोगकर्ताओं के ऐप पर लागू होता है। बदलाव पूरी तरह दिखने के लिए ऐप दोबारा खोलना पड़ता है।')}
        </Text>
      </View>

      {/* ---------- लाइव झलक ---------- */}
      <Text style={styles.h2}>{tt('झलक')}</Text>
      <View style={[styles.previewWrap, { backgroundColor: preset.sand }]}>
        <View style={[styles.pvHeader, { backgroundColor: previewPrimary, borderRadius: shape.md }]}>
          <Text style={styles.pvHeaderText}>ShaktiCop</Text>
        </View>
        <View
          style={[
            styles.pvCard,
            { borderRadius: shape.md },
            draft.cardStyle === 'outlined' && { borderWidth: 1, borderColor: preset.border },
            draft.cardStyle === 'elevated' && { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
          ]}
        >
          <Text style={[styles.pvTitle, { color: previewPrimary }]}>{tt('महिला हेल्प डेस्क')}</Text>
          <Text style={styles.pvSub}>SK-9421-101040 · {tt('दर्ज')}</Text>
        </View>
        <View style={[styles.pvTable, { borderRadius: shape.sm }]}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.pvRow,
                { paddingVertical: draft.density === 'compact' ? 5 : draft.density === 'comfortable' ? 12 : 8 },
                draft.tableStyle === 'striped' && i % 2 === 1 && { backgroundColor: preset.sand },
                draft.tableStyle === 'bordered' && { borderBottomWidth: 1, borderBottomColor: preset.border },
              ]}
            >
              <Text style={styles.pvCell}>SK-00{i + 1}</Text>
              <Text style={styles.pvCell}>{tt('लंबित')}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ---------- रंग ---------- */}
      <Text style={styles.h2}>{tt('मुख्य रंग')}</Text>
      <View style={styles.card}>
        {COLOR_PRESETS.map((p) => (
          <Option
            key={p.key}
            active={draft.colorPreset === p.key && !draft.customPrimary}
            label={p.label}
            swatch={p.primary}
            onPress={() => setDraft({ ...draft, colorPreset: p.key, customPrimary: '' })}
          />
        ))}
        <View style={styles.customRow}>
          <View style={[styles.swatch, { backgroundColor: previewPrimary }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optLabel}>{tt('अपना रंग कोड')}</Text>
            <TextInput
              style={styles.hexInput}
              placeholder="#8E2A46"
              value={draft.customPrimary}
              onChangeText={(v) => set('customPrimary', v.trim())}
              autoCapitalize="none"
              maxLength={7}
            />
          </View>
        </View>
      </View>

      {/* ---------- कोनों का आकार ---------- */}
      <Text style={styles.h2}>{tt('कोनों का आकार')}</Text>
      <View style={styles.card}>
        {SHAPE_PRESETS.map((s) => (
          <Option key={s.key} active={draft.shape === s.key} label={s.label} onPress={() => set('shape', s.key)} />
        ))}
      </View>

      {/* ---------- कार्ड की शैली ---------- */}
      <Text style={styles.h2}>{tt('कार्ड की शैली')}</Text>
      <View style={styles.card}>
        {CARD_STYLES.map((s) => (
          <Option key={s.key} active={draft.cardStyle === s.key} label={s.label} onPress={() => set('cardStyle', s.key)} />
        ))}
      </View>

      {/* ---------- तालिका का रूप ---------- */}
      <Text style={styles.h2}>{tt('तालिका का रूप')}</Text>
      <View style={styles.card}>
        {TABLE_STYLES.map((s) => (
          <Option key={s.key} active={draft.tableStyle === s.key} label={s.label} onPress={() => set('tableStyle', s.key)} />
        ))}
      </View>

      {/* ---------- घनत्व ---------- */}
      <Text style={styles.h2}>{tt('जगह का घनत्व')}</Text>
      <View style={styles.card}>
        {DENSITY_PRESETS.map((d) => (
          <Option key={d.key} active={draft.density === d.key} label={d.label} onPress={() => set('density', d.key)} />
        ))}
      </View>

      {/* ---------- मेन्यू ---------- */}
      <Text style={styles.h2}>{tt('मेन्यू की शैली')}</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optLabel}>{tt('मेन्यू में आइकॉन दिखाएं')}</Text>
            <Text style={styles.optHint}>{tt('बंद करने पर सिर्फ़ नाम दिखेंगे — सूची छोटी लगती है')}</Text>
          </View>
          <Switch
            value={draft.menuIcons}
            onValueChange={(v) => set('menuIcons', v)}
            trackColor={{ true: colors.sage }}
          />
        </View>
      </View>

      <PrimaryButton
        title={busy ? tt('सुरक्षित हो रहा है…') : tt('रूप-रंग सुरक्षित करें')}
        onPress={save}
        loading={busy}
      />
      <SecondaryButton title={tt('डिफ़ॉल्ट पर लौटें')} onPress={reset} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: colors.sand },
  denied: { fontSize: 13, color: colors.inkGrey, marginTop: 10, textAlign: 'center' },
  warnBox: { flexDirection: 'row', gap: 9, backgroundColor: '#FFF8E6', borderRadius: radius.md, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#B26A00' },
  warnText: { flex: 1, fontSize: 11.5, color: colors.inkNavy, lineHeight: 17 },
  h2: { fontSize: 13.5, fontWeight: '800', color: colors.inkNavy, marginBottom: 8, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F2EFE9' },
  optActive: {},
  optLabel: { fontSize: 13, color: colors.inkNavy, fontWeight: '600' },
  optLabelActive: { color: colors.shaktiMaroon, fontWeight: '800' },
  optHint: { fontSize: 10.5, color: colors.inkLight, marginTop: 2 },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  hexInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, marginTop: 5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  previewWrap: { borderRadius: radius.md, padding: 12, marginBottom: 18, borderWidth: 1, borderColor: colors.border },
  pvHeader: { paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  pvHeaderText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  pvCard: { backgroundColor: '#fff', padding: 12, marginBottom: 10 },
  pvTitle: { fontSize: 13.5, fontWeight: '800' },
  pvSub: { fontSize: 11, color: colors.inkLight, marginTop: 3 },
  pvTable: { backgroundColor: '#fff', overflow: 'hidden' },
  pvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 11 },
  pvCell: { fontSize: 11.5, color: colors.inkGrey },
});
