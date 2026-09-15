import React, { useState, useEffect, useCallback } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Switch, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../theme/colors';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

const ICON_OPTIONS = ['shield-checkmark', 'people', 'heart', 'ribbon', 'star', 'megaphone'];
// 🐛 बग फ़िक्स: पहले upload करते समय crop 16:9 पर fix था, पर Home स्क्रीन पर बैनर असल
// में सिर्फ़ 170px ऊँचा दिखता है (HomeScreen.js की headerWrap height से मेल खाना ज़रूरी)।
// फ़ोन की चौड़ाई पर 16:9 का मतलब लगभग 211px ऊँचाई होती — यानी crop की गई image
// असली display box से लंबी बच जाती, और "cover" mode में render होते समय वो अतिरिक्त
// हिस्सा ऊपर-नीचे से फिर कट जाता ("ऊपर से crop हो रहा है" वाली शिकायत की असली वजह)।
// अब crop ratio को असली display height से बिल्कुल मिलाया गया है — कोई दोहरा crop नहीं।
const BANNER_DISPLAY_HEIGHT = 170;
const COLOR_PRESETS = [
  ['#D6336C', '#9B2647'],
  ['#0F2A44', '#1B4A73'],
  ['#F06292', '#D6336C'],
  ['#9B2647', '#0F2A44'],
  ['#C98A2B', '#D6336C'],
];

export default function AdminBannersScreen() {
  const { fetchAllBanners, createBanner, updateBanner, deleteBanner } = useApp();
  // 🆕 पहले preview हमेशा 170px ऊँचा दिखता था (फ़ोन के लिए तय), चाहे यह स्क्रीन खुद
  // किसी भी डिवाइस/orientation पर खुली हो। HomeScreen पर असली बैनर की ऊँचाई अब
  // स्क्रीन की चौड़ाई के अनुसार बदलती है (देखें HomeScreen.js का bannerHeight) — यहाँ
  // वही सूत्र दोहराया गया है ताकि admin को preview में लगभग वैसा ही अनुपात दिखे
  // जैसा नागरिकों को असल में दिखेगा (टैबलेट/landscape पर भी एक तंग पट्टी जैसा न लगे)।
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [imageAspectRatio, setImageAspectRatio] = useState(null);
  const previewHeight = imageAspectRatio
    ? Math.min(Math.max(windowWidth / imageAspectRatio, 150), Math.min(320, windowHeight * 0.4))
    : Math.min(Math.max(windowWidth * 0.34, 150), Math.min(320, windowHeight * 0.32));
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = नया बैनर, वरना उस id वाले बैनर को edit कर रहे हैं
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [colorPair, setColorPair] = useState(COLOR_PRESETS[0]);
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);
  const [imageUrl, setImageUrl] = useState(null); // पहले से बनी हुई image (base64 data URI के रूप में सेव होती है)
  const [imageBusy, setImageBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  // 🆕 जैसे ही कोई image चुनी/बदली जाए, उसका असली aspect-ratio पता लगाकर preview
  // को बिल्कुल उसी अनुपात में दिखाते हैं (HomeScreen पर जो दिखेगा, वैसा ही) — देखें
  // ऊपर वाली टिप्पणी।
  useEffect(() => {
    if (!imageUrl) {
      setImageAspectRatio(null);
      return;
    }
    Image.getSize(
      imageUrl,
      (w, h) => {
        if (w > 0 && h > 0) setImageAspectRatio(w / h);
      },
      () => setImageAspectRatio(null)
    );
  }, [imageUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllBanners();
      setBanners(data);
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }, [fetchAllBanners]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setColorPair(COLOR_PRESETS[0]);
    setIcon(ICON_OPTIONS[0]);
    setImageUrl(null);
  };

  // पहले से बनी हुई (ready-made) banner image गैलरी से चुनकर अपलोड करें —
  // base64 data URI के रूप में सीधे सेव होती है, इसलिए किसी अलग file-server की ज़रूरत नहीं।
  //
  // ⚠️ बग फ़िक्स: पहले यहाँ एक तय aspect ratio (BANNER_ASPECT) पर crop करने के लिए
  // मजबूर किया जाता था — पोस्टर जैसी images (जिनमें किनारों पर लोगो/नंबर/जानकारी
  // भरी होती है) के साथ इससे ज़रूरी हिस्सा कट जाता था, क्योंकि admin सिर्फ़ pan/zoom
  // कर सकता था, aspect बदल नहीं सकता था। अब crop पूरी तरह वैकल्पिक है (admin चाहे तो
  // खुद crop करे, वरना पूरी image वैसी की वैसी अपलोड होगी) — Home स्क्रीन पर बैनर अब
  // "contain" मोड में दिखता है, तो पूरी image हमेशा दिखेगी, कभी नहीं कटेगी।
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(tt('अनुमति चाहिए'), tt('इमेज चुनने के लिए गैलरी एक्सेस की अनुमति दें।'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
      base64: true,
    });
    if (result.canceled) return;
    setImageBusy(true);
    try {
      const asset = result.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      setImageUrl(`data:${mime};base64,${asset.base64}`);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('इमेज लोड नहीं हो सकी।'));
    }
    setImageBusy(false);
  };

  const removeImage = () => setImageUrl(null);

  const startEdit = (b) => {
    setEditingId(b.id);
    setTitle(b.title || '');
    setSubtitle(b.subtitle || '');
    setColorPair([b.colorStart || COLOR_PRESETS[0][0], b.colorEnd || COLOR_PRESETS[0][1]]);
    setIcon(b.icon || ICON_OPTIONS[0]);
    setImageUrl(b.imageUrl || null);
    setShowForm(true);
  };

  const submitBanner = async () => {
    if (!title.trim() && !imageUrl) {
      Alert.alert(tt('शीर्षक (title) या इमेज आवश्यक है'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        colorStart: colorPair[0],
        colorEnd: colorPair[1],
        icon,
        imageUrl: imageUrl || null,
      };
      if (editingId) {
        await updateBanner(editingId, payload);
      } else {
        await createBanner({ ...payload, displayOrder: banners.length });
      }
      resetForm();
      setShowForm(false);
      await load();
      Alert.alert(editingId ? tt('बैनर अपडेट हो गया') : tt('बैनर जुड़ गया'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const toggleActive = async (b) => {
    try {
      await updateBanner(b.id, { isActive: !b.isActive });
      await load();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
  };

  const removeBanner = (b) => {
    Alert.alert(tt('बैनर हटाएं?'), b.title, [
      { text: tt('रद्द करें'), style: 'cancel' },
      {
        text: tt('हटाएं'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBanner(b.id);
            await load();
          } catch (e) {
            Alert.alert(tt('त्रुटि'), e.message);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h2}>{tt('Home बैनर प्रबंधन')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (showForm) {
              resetForm();
              setShowForm(false);
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
        >
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>{tt('यह बैनर Home स्क्रीन पर घूमने वाले carousel में दिखते हैं। सक्रिय बैनर ही दिखेंगे। जब चाहें, यहीं से बैनर बदलें/अपडेट करें।')}</Text>

      {showForm && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{editingId ? tt('बैनर अपडेट करें') : tt('नया बैनर जोड़ें')}</Text>

          <Text style={styles.smallLabel}>{tt('बैनर इमेज (वैकल्पिक — पहले से बनी हुई image अपलोड करें)')}</Text>
          {imageUrl ? (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: imageUrl }} style={[styles.imagePreview, { height: previewHeight }]} resizeMode="contain" />
              <TouchableOpacity style={styles.imageRemoveBtn} onPress={removeImage}>
                <Ionicons name="close-circle" size={22} color={colors.white} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.imagePickBtn} onPress={pickImage} disabled={imageBusy}>
              <Ionicons name="image-outline" size={20} color={colors.shaktiMaroon} />
              <Text style={styles.imagePickBtnText}>{imageBusy ? tt('लोड हो रहा है…') : tt('गैलरी से इमेज चुनें')}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>{tt('इमेज दी हो तो वही बैनर पर दिखेगी (नीचे के रंग/आइकन सिर्फ़ तब दिखेंगे जब इमेज न हो)।')}</Text>

          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('शीर्षक (जैसे — Your Safety. Your Rights.)')} value={title} onChangeText={setTitle} maxLength={150} />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={tt('उपशीर्षक (वैकल्पिक)')} value={subtitle} onChangeText={setSubtitle} maxLength={300} />

          <Text style={styles.smallLabel}>{tt('रंग योजना चुनें')}</Text>
          <View style={styles.colorRow}>
            {COLOR_PRESETS.map((c, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.colorSwatch, { backgroundColor: c[0] }, colorPair[0] === c[0] && colorPair[1] === c[1] && styles.colorSwatchActive]}
                onPress={() => setColorPair(c)}
              />
            ))}
          </View>

          <Text style={styles.smallLabel}>{tt('आइकन चुनें')}</Text>
          <View style={styles.iconRow}>
            {ICON_OPTIONS.map((ic) => (
              <TouchableOpacity key={ic} style={[styles.iconChip, icon === ic && styles.iconChipActive]} onPress={() => setIcon(ic)}>
                <Ionicons name={ic} size={18} color={icon === ic ? colors.white : colors.inkGrey} />
              </TouchableOpacity>
            ))}
          </View>

          <PrimaryButton
            title={busy ? tt('सुरक्षित हो रहा है…') : editingId ? tt('अपडेट करें') : tt('बैनर जोड़ें')}
            onPress={submitBanner}
            style={{ marginTop: 14 }}
            loading={busy}
          />
        </View>
      )}

      {loading ? (
        <Text style={styles.hint}>{tt('लोड हो रहा है…')}</Text>
      ) : (
        banners.map((b) => (
          <View key={b.id} style={styles.bannerRow}>
            {b.imageUrl ? (
              <Image source={{ uri: b.imageUrl }} style={styles.previewThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.previewDot, { backgroundColor: b.colorStart }]}>
                <Ionicons name={b.icon} size={16} color={colors.white} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle} numberOfLines={1}>{b.title || tt('(बिना शीर्षक)')}</Text>
              {b.subtitle ? <Text style={styles.bannerSub} numberOfLines={1}>{b.subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => startEdit(b)} style={{ marginRight: 4 }}>
              <Ionicons name="create-outline" size={19} color={colors.inkGrey} />
            </TouchableOpacity>
            <Switch value={b.isActive} onValueChange={() => toggleActive(b)} trackColor={{ true: colors.shaktiMaroon }} />
            <TouchableOpacity onPress={() => removeBanner(b)} style={{ marginLeft: 10 }}>
              <Ionicons name="trash-outline" size={18} color={colors.alert} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  addBtn: { backgroundColor: colors.shaktiMaroon, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11.5, color: colors.inkLight, marginTop: 6, marginBottom: 16, lineHeight: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 12 },
  input: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  smallLabel: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey, marginTop: 14, marginBottom: 8 },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: colors.inkNavy },
  iconRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  iconChip: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  iconChipActive: { backgroundColor: colors.shaktiMaroon },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  previewDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  previewThumb: { width: 44, height: 34, borderRadius: 8, backgroundColor: colors.sand },
  imagePickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.shaktiMaroon, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 14, marginTop: 6 },
  imagePickBtnText: { fontSize: 13, fontWeight: '700', color: colors.shaktiMaroon },
  imagePreviewWrap: { marginTop: 6, borderRadius: radius.md, overflow: 'hidden' },
  imagePreview: { width: '100%', height: BANNER_DISPLAY_HEIGHT, backgroundColor: colors.sand },
  imageRemoveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12 },
  bannerTitle: { fontSize: 13, fontWeight: '700', color: colors.inkNavy },
  bannerSub: { fontSize: 11, color: colors.inkGrey, marginTop: 2 },
});
