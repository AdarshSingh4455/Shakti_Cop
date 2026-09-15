import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// ⚠️ @react-native-picker/picker भी उसी class का जोखिम रखता है जो expo-speech-recognition/expo-av
// में मिला था — native module link न होने पर सीधा import पूरी screen crash कर देता — इसलिए यहाँ भी
// सुरक्षित तरीके से (try/catch में) लोड किया जाता है।
let NativePicker = null;
let NativePickerItem = null;
let NATIVE_PICKER_AVAILABLE = false;
try {
  const pickerModule = require('@react-native-picker/picker');
  NativePicker = pickerModule.Picker;
  NativePickerItem = pickerModule.Picker.Item;
  NATIVE_PICKER_AVAILABLE = true;
} catch (e) {
  // native module उपलब्ध नहीं — नीचे दिया गया साधारण fallback selector इस्तेमाल होगा
}

// items: ['क', 'ख', ...] या [{ label, value }, ...] — दोनों तरह चल जाता है
export default function SafePicker({ selectedValue, onValueChange, items, enabled = true }) {
  const [open, setOpen] = useState(false);
  // ⚠️ label ही अनुवादित होता है — value हमेशा मूल हिंदी रहती है, ताकि डेटाबेस में
  // ज़िला/थाना/श्रेणी हिंदी में ही सुरक्षित हो और filter/मिलान टूटे नहीं।
  const normalized = items.map((it) =>
    typeof it === 'string' ? { label: tt(it), value: it } : { ...it, label: tt(it.label) }
  );

  if (NATIVE_PICKER_AVAILABLE) {
    return (
      <NativePicker selectedValue={selectedValue} onValueChange={onValueChange} enabled={enabled}>
        {normalized.map((it) => (
          <NativePickerItem key={it.value} label={it.label} value={it.value} />
        ))}
      </NativePicker>
    );
  }

  const selectedLabel = normalized.find((it) => it.value === selectedValue)?.label || tt(selectedValue) || tt('चुनें');
  return (
    <>
      <TouchableOpacity
        style={[styles.fallbackBtn, !enabled && styles.fallbackBtnDisabled]}
        onPress={() => enabled && setOpen(true)}
        disabled={!enabled}
      >
        <Text style={styles.fallbackBtnText}>{selectedLabel}</Text>
        {enabled && <Ionicons name="chevron-down" size={16} color={colors.inkGrey} />}
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <ScrollView style={{ maxHeight: 380 }}>
              {normalized.map((it) => (
                <TouchableOpacity
                  key={it.value}
                  style={styles.optionRow}
                  onPress={() => {
                    onValueChange(it.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{it.label}</Text>
                  {it.value === selectedValue && <Ionicons name="checkmark" size={18} color={colors.shaktiMaroon} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={styles.cancelBtnText}>{tt('रद्द करें')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fallbackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, paddingVertical: 13 },
  fallbackBtnDisabled: { opacity: 0.5 },
  fallbackBtnText: { fontSize: 14.5, color: colors.inkNavy },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { fontSize: 14.5, color: colors.inkNavy },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelBtnText: { color: colors.inkGrey, fontWeight: '600' },
});
