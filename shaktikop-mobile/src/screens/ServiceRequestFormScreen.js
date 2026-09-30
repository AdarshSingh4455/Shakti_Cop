import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { PrimaryButton } from '../components/Buttons';
import { SERVICE_TYPES, GENDER_OPTIONS, EDUCATION_OPTIONS } from '../data/serviceRequests';

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{tt(label)}</Text>
      {children}
    </View>
  );
}

// चुनने वाला बॉक्स — कारण, लिंग व शिक्षा तीनों के लिए
function SelectBox({ value, placeholder, onPress }) {
  return (
    <TouchableOpacity style={styles.select} onPress={onPress}>
      <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>
        {value ? tt(value) : tt(placeholder)}
      </Text>
      <Ionicons name="chevron-down" size={17} color={colors.inkGrey} />
    </TouchableOpacity>
  );
}

export default function ServiceRequestFormScreen({ navigation, route }) {
  const { user, createCounsellingRequest } = useApp();
  const type = route.params?.type || 'counselling';
  const cfg = SERVICE_TYPES[type] || SERVICE_TYPES.counselling;

  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState(user?.address || '');
  const [education, setEducation] = useState('');

  const [picker, setPicker] = useState(null); // 'reason' | 'gender' | 'education'
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pickerData = {
    reason: { title: cfg.reasonLabel, options: cfg.reasons, set: setReason },
    gender: { title: 'लिंग', options: GENDER_OPTIONS, set: setGender },
    education: { title: 'शैक्षणिक योग्यता', options: EDUCATION_OPTIONS, set: setEducation },
  };
  const active = picker ? pickerData[picker] : null;

  const submit = async () => {
    if (cfg.reasonRequired && !reason && !detail.trim()) {
      return Alert.alert(tt('जानकारी अधूरी है'), tt('कृपया कारण चुनें या विवरण लिखें।'));
    }
    if (cfg.fields.age) {
      const n = Number(age);
      if (!age.trim() || isNaN(n) || n < 1 || n > 120) {
        return Alert.alert(tt('जानकारी अधूरी है'), tt('कृपया सही उम्र दर्ज करें (1–120)।'));
      }
    }
    if (cfg.fields.gender && !gender) {
      return Alert.alert(tt('जानकारी अधूरी है'), tt('कृपया लिंग चुनें।'));
    }
    if (cfg.fields.education && !education) {
      return Alert.alert(tt('जानकारी अधूरी है'), tt('कृपया शैक्षणिक योग्यता चुनें।'));
    }
    if (cfg.fields.address && !address.trim()) {
      return Alert.alert(tt('जानकारी अधूरी है'), tt('कृपया अपना पता लिखें।'));
    }

    setBusy(true);
    try {
      await createCounsellingRequest({
        type,
        reasonKey: reason || null,
        reasonDetail: detail.trim() || null,
        age: cfg.fields.age ? Number(age) : null,
        gender: cfg.fields.gender ? gender : null,
        address: cfg.fields.address ? address.trim() : null,
        education: cfg.fields.education ? education : null,
      });
      setConfirmOpen(true);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
        <View style={styles.headCard}>
          <Ionicons name={cfg.icon} size={24} color={colors.shaktiMaroon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headTitle}>{tt(cfg.label)}</Text>
            <Text style={styles.headSub}>{tt(cfg.intro)}</Text>
          </View>
        </View>

        {/* प्रोफ़ाइल से भरी जानकारी — यहाँ बदली नहीं जा सकती ताकि रिकॉर्ड सही रहे */}
        <View style={styles.card}>
          <View style={styles.cardHeadRow}>
            <Text style={styles.sectionTitle}>{tt('आपकी जानकारी')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CitizenProfile')}>
              <Text style={styles.editLink}>{tt('प्रोफ़ाइल से बदलें')}</Text>
            </TouchableOpacity>
          </View>

          <Field label="नाम">
            <TextInput style={[styles.input, styles.inputLocked]} value={user?.name || ''} editable={false} />
          </Field>

          {cfg.fields.fatherName && (
            <Field label="पिता/पति का नाम">
              <TextInput
                style={[styles.input, styles.inputLocked]}
                value={user?.fatherName || tt('उपलब्ध नहीं')}
                editable={false}
              />
            </Field>
          )}

          <Field label="मोबाइल नंबर">
            <TextInput style={[styles.input, styles.inputLocked]} value={user?.mobile || ''} editable={false} />
          </Field>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="ज़िला">
                <TextInput
                  style={[styles.input, styles.inputLocked]}
                  value={user?.district ? tt(user.district) : tt('उपलब्ध नहीं')}
                  editable={false}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="थाना">
                <TextInput
                  style={[styles.input, styles.inputLocked]}
                  value={user?.policeStation ? tt(user.policeStation) : tt('उपलब्ध नहीं')}
                  editable={false}
                />
              </Field>
            </View>
          </View>
        </View>

        {/* सेवा-विशेष अतिरिक्त जानकारी */}
        {(cfg.fields.age || cfg.fields.gender || cfg.fields.address || cfg.fields.education) && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{tt('अतिरिक्त जानकारी')}</Text>

            {(cfg.fields.age || cfg.fields.gender) && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                {cfg.fields.age && (
                  <View style={{ flex: 1 }}>
                    <Field label="उम्र (वर्ष)">
                      <TextInput
                        style={styles.input}
                        value={age}
                        onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="25"
                      />
                    </Field>
                  </View>
                )}
                {cfg.fields.gender && (
                  <View style={{ flex: 1 }}>
                    <Field label="लिंग">
                      <SelectBox value={gender} placeholder="चुनें" onPress={() => setPicker('gender')} />
                    </Field>
                  </View>
                )}
              </View>
            )}

            {cfg.fields.education && (
              <Field label="शैक्षणिक योग्यता">
                <SelectBox value={education} placeholder="सूची से चुनें…" onPress={() => setPicker('education')} />
              </Field>
            )}

            {cfg.fields.address && (
              <Field label="पूरा पता">
                <TextInput
                  style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  maxLength={300}
                  placeholder={tt('मकान/मोहल्ला, गाँव/शहर')}
                />
              </Field>
            )}
          </View>
        )}

        {/* कारण / रुचि */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt(cfg.reasonLabel)}</Text>

          {cfg.reasons.length > 0 && (
            <Field label="सूची से चुनें">
              <SelectBox value={reason} placeholder="सूची से चुनें…" onPress={() => setPicker('reason')} />
            </Field>
          )}

          <Field label={cfg.reasonRequired ? tt('विस्तार से लिखें') : tt('विस्तार से लिखें (वैकल्पिक)')}>
            <TextInput
              style={styles.textarea}
              placeholder={tt('अपनी बात यहाँ लिखें — यह जानकारी गोपनीय रहेगी…')}
              multiline
              numberOfLines={5}
              value={detail}
              onChangeText={setDetail}
              maxLength={1000}
            />
          </Field>

          <View style={styles.privacyNote}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.sage} />
            <Text style={styles.privacyText}>
              {tt('आपकी जानकारी सिर्फ़ अधिकृत वरिष्ठ अधिकारी को दिखेगी।')}
            </Text>
          </View>
        </View>

        <PrimaryButton
          title={busy ? tt('भेजा जा रहा है…') : tt(cfg.submitLabel)}
          onPress={submit}
          loading={busy}
        />
      </ScrollView>

      {/* चुनने की सूची */}
      <Modal visible={!!picker} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tt(active?.title || '')}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {(active?.options || []).map((o) => (
                <TouchableOpacity
                  key={o}
                  style={styles.optionRow}
                  onPress={() => {
                    active.set(o);
                    setPicker(null);
                  }}
                >
                  <Ionicons name="radio-button-off" size={18} color={colors.inkLight} />
                  <Text style={styles.optionText}>{tt(o)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPicker(null)}>
              <Text style={styles.modalCloseText}>{tt('रद्द करें')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* पुष्टि */}
      <Modal visible={confirmOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons name="checkmark" size={34} color={colors.white} />
            </View>
            <Text style={styles.confirmTitle}>{tt('अनुरोध दर्ज हो गया')}</Text>
            <Text style={styles.confirmMsg}>
              {tt('सत्र के समय व दिनांक से आपको जल्द ही अवगत कराया जाएगा।')}
            </Text>
            <Text style={styles.confirmSub}>{tt('स्थिति देखने के लिए "मेरे अनुरोध" में जाएं।')}</Text>
            <PrimaryButton
              title={tt('ठीक है')}
              onPress={() => {
                setConfirmOpen(false);
                navigation.navigate(`My_${type}`);
              }}
              style={{ marginTop: 16, width: '100%' }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.shaktiMaroon, borderRadius: radius.lg, padding: 15, marginBottom: 14 },
  headEmoji: { fontSize: 24 },
  headTitle: { fontSize: 16, fontWeight: '800', color: colors.white },
  headSub: { fontSize: 11.5, color: '#F0DCE2', marginTop: 2, lineHeight: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.inkNavy },
  editLink: { fontSize: 11.5, fontWeight: '700', color: colors.shaktiMaroon },
  label: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, color: colors.inkNavy, backgroundColor: colors.white },
  inputLocked: { backgroundColor: '#F5F2ED', color: colors.inkGrey },
  select: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 11 },
  selectText: { flex: 1, fontSize: 13, color: colors.inkNavy },
  selectPlaceholder: { color: colors.inkLight },
  textarea: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 11, fontSize: 13, color: colors.inkNavy, minHeight: 100, textAlignVertical: 'top' },
  privacyNote: { flexDirection: 'row', gap: 7, backgroundColor: '#F4F9F6', borderRadius: radius.sm, padding: 10, marginTop: 4 },
  privacyText: { flex: 1, fontSize: 11, color: colors.inkGrey, lineHeight: 16 },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,42,68,0.5)', justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: colors.inkNavy, marginBottom: 10 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { flex: 1, fontSize: 13, color: colors.inkNavy },
  modalClose: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  modalCloseText: { fontSize: 13, fontWeight: '700', color: colors.inkGrey },
  confirmCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 22, alignItems: 'center' },
  confirmIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  confirmTitle: { fontSize: 16.5, fontWeight: '800', color: colors.inkNavy },
  confirmMsg: { fontSize: 13, color: colors.inkGrey, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  confirmSub: { fontSize: 11.5, color: colors.inkLight, textAlign: 'center', marginTop: 8 },
});
