import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, Switch, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

const FLAG_LABELS = {
  voiceToText: 'आवाज़-से-टेक्स्ट (🎤)',
  qrScanner: 'QR स्कैनर',
  audioRecording: 'आवाज़ रिकॉर्डिंग',
  liveLocationSharing: 'लाइव लोकेशन शेयरिंग',
};

export default function AppSettingsScreen() {
  const { user, fetchAdminSettings, updateAdminSetting, runEscalationNow } = useApp();
  const isSuperAdmin = user?.adminRole === 'super_admin';
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminSettings();
      setSettings(data);
    } catch (e) {
      // सिर्फ़ super_admin को मिलेगा
    }
    setLoading(false);
  }, [fetchAdminSettings]);

  useEffect(() => {
    load();
  }, [load]);

  const saveKey = async (key, value) => {
    setBusy(true);
    try {
      await updateAdminSetting(key, value);
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const toggleFlag = (flagKey) => {
    const current = settings.feature_flags.value;
    saveKey('feature_flags', { ...current, [flagKey]: !current[flagKey] });
  };

  const runNowEscalation = async () => {
    setBusy(true);
    try {
      const result = await runEscalationNow();
      if (result.skipped) {
        Alert.alert(tt('कुछ नहीं हुआ'), result.reason || tt('अभी शर्तें पूरी नहीं होतीं।'));
      } else {
        Alert.alert(tt('चल गया'), `${result.escalatedCount} शिकायतें escalate की गईं।`);
      }
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  if (!isSuperAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.restrictedBox}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.inkLight} />
          <Text style={styles.restrictedText}>{tt('यह सेक्शन सिर्फ़ Super Admin के लिए है।')}</Text>
        </View>
      </View>
    );
  }

  if (loading || !settings) {
    return <View style={styles.container} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{tt('ऐप सेटिंग्स')}</Text>
      <Text style={styles.hint}>{tt('यहाँ किया गया बदलाव तुरंत पूरे app में लागू हो जाता है — किसी नई APK की ज़रूरत नहीं।')}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Feature Flags</Text>
        <Text style={styles.sectionHint}>{tt('ज़रूरत पड़ने पर किसी feature को अस्थायी रूप से बंद करें।')}</Text>
        {Object.keys(FLAG_LABELS).map((key) => (
          <View key={key} style={styles.row}>
            <Text style={styles.rowLabel}>{FLAG_LABELS[key]}</Text>
            <Switch
              value={!!settings.feature_flags.value[key]}
              onValueChange={() => toggleFlag(key)}
              disabled={busy}
              trackColor={{ true: colors.sage }}
            />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('रखरखाव मोड (Maintenance Mode)')}</Text>
        <Text style={styles.sectionHint}>{tt('चालू करने पर सभी उपयोगकर्ताओं को संदेश दिखेगा, app इस्तेमाल नहीं कर पाएंगे।')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{tt('रखरखाव मोड चालू करें')}</Text>
          <Switch
            value={!!settings.maintenance_mode.value.active}
            onValueChange={(v) => saveKey('maintenance_mode', { ...settings.maintenance_mode.value, active: v })}
            disabled={busy}
            trackColor={{ true: colors.alert }}
          />
        </View>
        <MaintenanceMessageEditor
          value={settings.maintenance_mode.value.message}
          onSave={(message) => saveKey('maintenance_mode', { ...settings.maintenance_mode.value, message })}
          busy={busy}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('न्यूनतम App Version')}</Text>
        <Text style={styles.sectionHint}>{tt('इससे पुराना version इस्तेमाल करने वालों को अपडेट करने के लिए कहा जाएगा।')}</Text>
        <MinVersionEditor value={settings.min_app_version.value} onSave={(value) => saveKey('min_app_version', value)} busy={busy} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('SMS Alert Template (MSG91)')}</Text>
        <Text style={styles.sectionHint}>{tt('SOS और अन्य कस्टम अलर्ट संदेश MSG91 से भेजने के लिए ज़रूरी — इसके बिना सिर्फ़ OTP जाता है, SOS की SMS नहीं जाती।')}</Text>
        <SmsAlertTemplateEditor value={settings.sms_alert_template?.value} onSave={(value) => saveKey('sms_alert_template', value)} busy={busy} />
      </View>

      {/* Theme रंग */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('ऐप का मुख्य रंग (Theme)')}</Text>
        <Text style={styles.sectionHint}>{tt('बदलाव तुरंत app में नहीं दिखेगा — अगली बार app खुलने पर लागू होगा।')}</Text>
        <ThemeColorEditor value={settings.theme_color.value.primary} onSave={(primary) => saveKey('theme_color', { primary })} busy={busy} />
      </View>

      {/* पीड़िता से संबंध विकल्प */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('"पीड़िता से संबंध" के विकल्प')}</Text>
        <Text style={styles.sectionHint}>{tt('घरेलू हिंसा जैसी शिकायतों में यही विकल्प दिखते हैं (कॉमा से अलग करें)।')}</Text>
        <ListEditor
          values={settings.relationship_options.value.values}
          onSave={(values) => saveKey('relationship_options', { values })}
          busy={busy}
        />
      </View>

      {/* अधिकारी पदनाम सुझाव */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('अधिकारी पदनाम सुझाव')}</Text>
        <Text style={styles.sectionHint}>{tt('नया अधिकारी जोड़ते समय ये quick-select विकल्प के रूप में दिखते हैं (कॉमा से अलग करें)।')}</Text>
        <ListEditor
          values={settings.officer_designations.value.values}
          onSave={(values) => saveKey('officer_designations', { values })}
          busy={busy}
        />
      </View>

      {/* Rank Permissions Matrix */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('रैंक अनुसार डिफ़ॉल्ट अनुमतियां')}</Text>
        <Text style={styles.sectionHint}>{tt('नया SI/SHO बनाते समय ये डिफ़ॉल्ट permissions मिलती हैं (मौजूदा अधिकारियों पर असर नहीं होता)।')}</Text>
        {['SI', 'SHO'].map((rank) => (
          <View key={rank} style={{ marginTop: 10 }}>
            <Text style={styles.rankLabel}>{rank}</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{tt('शिकायत अस्वीकृत कर सकें')}</Text>
              <Switch
                value={!!settings.rank_permissions.value[rank]?.canReject}
                onValueChange={(v) =>
                  saveKey('rank_permissions', {
                    ...settings.rank_permissions.value,
                    [rank]: { ...settings.rank_permissions.value[rank], canReject: v },
                  })
                }
                disabled={busy}
                trackColor={{ true: colors.sage }}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{tt('मामला स्थानांतरित कर सकें')}</Text>
              <Switch
                value={!!settings.rank_permissions.value[rank]?.canTransfer}
                onValueChange={(v) =>
                  saveKey('rank_permissions', {
                    ...settings.rank_permissions.value,
                    [rank]: { ...settings.rank_permissions.value[rank], canTransfer: v },
                  })
                }
                disabled={busy}
                trackColor={{ true: colors.sage }}
              />
            </View>
          </View>
        ))}
      </View>

      {/* Escalation Rules */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('रात्रि/ऑफ़-आवर Escalation')}</Text>
        <Text style={styles.sectionHint}>{tt('तय समय-सीमा में after-hours दौरान बिना कार्यवाही रही शिकायतों की सभी Admins को सूचना जाती है (हर 30 मिनट में अपने-आप चेक होता है)।')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{tt('Escalation चालू रखें')}</Text>
          <Switch
            value={!!settings.escalation_rules.value.enabled}
            onValueChange={(v) => saveKey('escalation_rules', { ...settings.escalation_rules.value, enabled: v })}
            disabled={busy}
            trackColor={{ true: colors.sage }}
          />
        </View>
        <EscalationRulesEditor value={settings.escalation_rules.value} onSave={(value) => saveKey('escalation_rules', value)} busy={busy} />
        <PrimaryButton title={tt('अभी चेक चलाएं')} onPress={runNowEscalation} style={{ marginTop: 14, backgroundColor: colors.inkNavy }} />
      </View>

      {/* 🆕 होम स्क्रीन बैनर — Transition */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('होम स्क्रीन बैनर — Transition')}</Text>
        <Text style={styles.sectionHint}>{tt('एक बैनर slide से दूसरी पर बदलते समय कौन-सा effect चले, कितनी तेज़ी से, और हर slide कितनी देर दिखे — यहाँ से तय करें।')}</Text>
        <BannerCarouselEditor value={settings.banner_carousel?.value} onSave={(value) => saveKey('banner_carousel', value)} busy={busy} />
      </View>
    </ScrollView>
  );
}

function MaintenanceMessageEditor({ value, onSave, busy }) {
  const [text, setText] = useState(value || '');
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.smallLabel}>{tt('संदेश (उपयोगकर्ताओं को दिखेगा)')}</Text>
      <TextInput style={styles.textarea} multiline value={text} onChangeText={setText} maxLength={500} />
      <PrimaryButton title={busy ? tt('सुरक्षित हो रहा है…') : tt('संदेश सुरक्षित करें')} onPress={() => onSave(text)} style={{ marginTop: 10 }} />
    </View>
  );
}

function BannerCarouselEditor({ value, onSave, busy }) {
  const [transitionType, setTransitionType] = useState(value?.transitionType || 'fade');
  const [transitionDurationMs, setTransitionDurationMs] = useState(String(value?.transitionDurationMs ?? 400));
  const [autoPlayIntervalMs, setAutoPlayIntervalMs] = useState(String(value?.autoPlayIntervalMs ?? 4500));

  const TYPE_OPTIONS = [
    { key: 'fade', label: 'फ़ेड (Fade)' },
    { key: 'slide', label: 'स्लाइड (Slide)' },
    { key: 'none', label: 'तुरंत (कोई effect नहीं)' },
  ];

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.smallLabel}>{tt('Transition का प्रकार')}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        {TYPE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[bcStyles.typeBtn, transitionType === opt.key && bcStyles.typeBtnActive]}
            onPress={() => setTransitionType(opt.key)}
          >
            <Text style={[bcStyles.typeBtnText, transitionType === opt.key && bcStyles.typeBtnTextActive]}>{tt(opt.label)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.smallLabel}>{tt('Transition की गति (मिलीसेकंड — 100 से 2000 के बीच)')}</Text>
      <TextInput
        style={styles.input}
        value={transitionDurationMs}
        onChangeText={setTransitionDurationMs}
        keyboardType="number-pad"
        maxLength={4}
        editable={transitionType !== 'none'}
      />

      <Text style={styles.smallLabel}>{tt('हर slide कितनी देर दिखे (मिलीसेकंड — 1500 से 30000 के बीच)')}</Text>
      <TextInput style={styles.input} value={autoPlayIntervalMs} onChangeText={setAutoPlayIntervalMs} keyboardType="number-pad" maxLength={5} />

      <PrimaryButton
        title={busy ? tt('सुरक्षित हो रहा है…') : tt('सुरक्षित करें')}
        onPress={() => {
          const duration = Math.min(Math.max(Number(transitionDurationMs) || 400, 100), 2000);
          const interval = Math.min(Math.max(Number(autoPlayIntervalMs) || 4500, 1500), 30000);
          onSave({ transitionType, transitionDurationMs: duration, autoPlayIntervalMs: interval });
        }}
        style={{ marginTop: 10 }}
      />
    </View>
  );
}

const bcStyles = StyleSheet.create({
  typeBtn: { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: radius.sm, backgroundColor: colors.sand, alignItems: 'center' },
  typeBtnActive: { backgroundColor: colors.shaktiMaroon },
  typeBtnText: { fontSize: 10.5, fontWeight: '700', color: colors.inkGrey, textAlign: 'center' },
  typeBtnTextActive: { color: colors.white },
});

function EscalationRulesEditor({ value, onSave, busy }) {
  const [afterHoursStart, setAfterHoursStart] = useState(String(value?.afterHoursStart ?? 22));
  const [afterHoursEnd, setAfterHoursEnd] = useState(String(value?.afterHoursEnd ?? 6));
  const [escalateAfterHours, setEscalateAfterHours] = useState(String(value?.escalateAfterHours ?? 4));

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.smallLabel}>{tt('ऑफ़-आवर शुरू (24-घंटे फ़ॉर्मेट, जैसे 22)')}</Text>
      <TextInput style={styles.input} value={afterHoursStart} onChangeText={setAfterHoursStart} keyboardType="number-pad" maxLength={2} />
      <Text style={styles.smallLabel}>{tt('ऑफ़-आवर खत्म (जैसे 6)')}</Text>
      <TextInput style={styles.input} value={afterHoursEnd} onChangeText={setAfterHoursEnd} keyboardType="number-pad" maxLength={2} />
      <Text style={styles.smallLabel}>{tt('कितने घंटे बाद escalate करें')}</Text>
      <TextInput style={styles.input} value={escalateAfterHours} onChangeText={setEscalateAfterHours} keyboardType="number-pad" maxLength={3} />
      <PrimaryButton
        title={busy ? tt('सुरक्षित हो रहा है…') : tt('सुरक्षित करें')}
        onPress={() =>
          onSave({
            ...value,
            afterHoursStart: Number(afterHoursStart) || 22,
            afterHoursEnd: Number(afterHoursEnd) || 6,
            escalateAfterHours: Number(escalateAfterHours) || 4,
          })
        }
        style={{ marginTop: 10 }}
      />
    </View>
  );
}

function ThemeColorEditor({ value, onSave, busy }) {
  const [hex, setHex] = useState(value || '#8E2A46');
  const valid = /^#[0-9a-fA-F]{6}$/.test(hex);
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[styles.colorPreview, { backgroundColor: valid ? hex : colors.border }]} />
        <TextInput style={[styles.input, { flex: 1 }]} value={hex} onChangeText={setHex} placeholder="#8E2A46" autoCapitalize="none" maxLength={10} />
      </View>
      {!valid && <Text style={styles.errorHint}>{tt('सही hex कोड डालें (जैसे #8E2A46)')}</Text>}
      <PrimaryButton title={busy ? tt('सुरक्षित हो रहा है…') : tt('सुरक्षित करें')} onPress={() => valid && onSave(hex)} style={{ marginTop: 10 }} />
    </View>
  );
}

function ListEditor({ values, onSave, busy }) {
  const [text, setText] = useState((values || []).join(', '));
  return (
    <View style={{ marginTop: 12 }}>
      <TextInput style={styles.textarea} multiline value={text} onChangeText={setText} maxLength={2000} />
      <PrimaryButton
        title={busy ? tt('सुरक्षित हो रहा है…') : tt('सुरक्षित करें')}
        onPress={() => {
          const list = text.split(',').map((s) => s.trim()).filter(Boolean);
          if (list.length > 0) onSave(list);
        }}
        style={{ marginTop: 10 }}
      />
    </View>
  );
}

function MinVersionEditor({ value, onSave, busy }) {
  const [android, setAndroid] = useState(value?.android || '1.0.0');
  const [message, setMessage] = useState(value?.forceUpdateMessage || '');
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.smallLabel}>{tt('न्यूनतम Android Version (जैसे 1.2.0)')}</Text>
      <TextInput style={styles.input} value={android} onChangeText={setAndroid} placeholder="1.0.0" maxLength={20} />
      <Text style={styles.smallLabel}>{tt('अपडेट संदेश')}</Text>
      <TextInput style={styles.textarea} multiline value={message} onChangeText={setMessage} maxLength={500} />
      <PrimaryButton
        title={busy ? tt('सुरक्षित हो रहा है…') : tt('सुरक्षित करें')}
        onPress={() => onSave({ android, ios: value?.ios || '1.0.0', forceUpdateMessage: message })}
        style={{ marginTop: 10 }}
      />
    </View>
  );
}

// 🆕 MSG91 का सामान्य OTP API सिर्फ़ OTP भेज सकता है — SOS/अलर्ट जैसे कस्टम टेक्स्ट मैसेज
// के लिए एक अलग, DLT-रजिस्टर्ड "flow" template ID चाहिए। यह वहीं सेट होता है।
function SmsAlertTemplateEditor({ value, onSave, busy }) {
  const [templateId, setTemplateId] = useState(value?.msg91TemplateId || '');
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.smallLabel}>{tt('MSG91 Alert Template ID')}</Text>
      <TextInput
        style={styles.input}
        value={templateId}
        onChangeText={setTemplateId}
        placeholder={tt('जैसे — 64f1a2b3c4d5e6f7a8b9c0d1')}
        autoCapitalize="none"
        maxLength={100}
      />
      <Text style={styles.templateHint}>
        {tt('टेम्पलेट में एक वेरिएबल ({{VAR1}}) होना चाहिए — पूरा संदेश (नाम, लोकेशन लिंक आदि) उसी में डाला जाता है। खाली छोड़ने पर MSG91 से SOS/अलर्ट SMS नहीं जाएंगे (सिर्फ़ OTP जाता रहेगा)।')}
      </Text>
      <PrimaryButton
        title={busy ? tt('सुरक्षित हो रहा है…') : tt('सुरक्षित करें')}
        onPress={() => onSave({ msg91TemplateId: templateId.trim() })}
        style={{ marginTop: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  hint: { fontSize: 11.5, color: colors.inkLight, marginTop: 6, marginBottom: 16, lineHeight: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 6 },
  sectionHint: { fontSize: 11, color: colors.inkGrey, marginBottom: 14, lineHeight: 15 },
  templateHint: { fontSize: 10.5, color: colors.inkLight, marginTop: 6, lineHeight: 15 },
  rankLabel: { fontSize: 12.5, fontWeight: '800', color: colors.shaktiMaroon, marginBottom: 4 },
  colorPreview: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  errorHint: { fontSize: 10.5, color: colors.alert, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { fontSize: 13, color: colors.inkGrey, flex: 1, marginRight: 10 },
  smallLabel: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  textarea: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 13, minHeight: 70, textAlignVertical: 'top' },
  restrictedBox: { alignItems: 'center', paddingTop: 80 },
  restrictedText: { fontSize: 13, color: colors.inkLight, marginTop: 12 },
});
