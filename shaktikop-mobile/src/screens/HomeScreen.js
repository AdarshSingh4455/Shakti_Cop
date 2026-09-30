import React, { useEffect, useRef, useState } from 'react';
import { tt } from '../context/LocaleContext';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  Animated,
  TextInput,
  Modal,
  Pressable,
  RefreshControl,
  Image,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import NotificationBell from '../components/NotificationBell';
import { colors, radius } from '../theme/colors';
import { CARD_ART } from '../components/CardArt';
import { CATEGORY_DEFS, HELPLINES } from '../data/constants';
import { SERVICE_TYPES } from '../data/serviceRequests';
import PoliceLogoIcon from '../components/PoliceLogoIcon';
import { useApp } from '../context/AppContext';
import { useLocale } from '../context/LocaleContext';
import { fetchAppSettings } from '../services/api';

// दिन के समय के हिसाब से greeting — हर बार सिर्फ़ "नमस्ते" की जगह थोड़ा व्यक्तिगत एहसास
function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'सुप्रभात' };
  if (hour < 17) return { text: 'नमस्कार' };
  return { text: 'शुभ संध्या' };
}

const FALLBACK_SLIDES = [
  { title: 'Your Safety. Your Rights. Your Shakti', subtitle: 'Mission Shakti 5.0 — Government of Uttar Pradesh', colorStart: '#D6336C', colorEnd: '#9B2647', icon: 'shield-checkmark' },
  { title: 'महिलाओं के लिए, महिलाओं के साथ', subtitle: 'हर शिकायत पर तुरंत कार्रवाई', colorStart: '#9B2647', colorEnd: '#0F2A44', icon: 'people' },
  { title: '24x7 आपकी सुरक्षा के लिए तैयार', subtitle: 'एक टैप में मदद', colorStart: '#F06292', colorEnd: '#D6336C', icon: 'heart' },
];

const WELFARE_SCHEMES = [
  { icon: 'female-outline', tag: 'Financial Aid', title: 'कन्या सुमंगला योजना', desc: 'बेटी की शिक्षा व स्वास्थ्य हेतु सीधा वित्तीय लाभ।', url: 'https://mksy.up.gov.in' },
  { icon: 'heart-outline', tag: 'Marriage Grant', title: 'शादी अनुदान योजना', desc: 'ग़रीब परिवारों की बेटियों के विवाह हेतु आर्थिक सहायता।', url: 'https://shadianudan.upsdc.gov.in' },
  { icon: 'wallet-outline', tag: 'Widow Pension', title: 'विधवा पेंशन योजना', desc: 'निराश्रित विधवा महिलाओं हेतु सामाजिक सुरक्षा व पेंशन।', url: 'https://sspy-up.gov.in' },
  { icon: 'trophy-outline', tag: 'Financial Help', title: 'रानी लक्ष्मीबाई महिला एवं बाल सम्मान कोष', desc: 'संकटग्रस्त महिलाओं व बच्चों हेतु आर्थिक सहायता।', url: 'https://msk.upsdc.gov.in' },
  { icon: 'school-outline', tag: 'Education Aid', title: 'UP छात्रवृत्ति योजना', desc: 'सभी वर्गों के छात्रों हेतु प्री व पोस्ट मैट्रिक छात्रवृत्ति।', url: 'https://scholarship.up.gov.in' },
];

const SUPPORT_SERVICES = [
  { icon: 'chatbubble-ellipses-outline', tag: 'Confidential', title: 'काउंसलिंग सहायता', desc: 'लाइसेंस-प्राप्त मनोवैज्ञानिक विशेषज्ञों से मुफ़्त काउंसलिंग।', url: 'https://msk.upsdc.gov.in' },
  { icon: 'hammer-outline', tag: 'Free Assistance', title: 'कानूनी सहायता (Legal Aid)', desc: 'घरेलू हिंसा व सुरक्षा नियमों पर मुफ़्त वकील रेफ़रल।', url: 'https://msk.upsdc.gov.in' },
  { icon: 'school-outline', tag: 'Vocational Training', title: 'जन शिक्षण संस्थान', desc: 'महिलाओं हेतु मुफ़्त कौशल प्रशिक्षण व प्रमाणपत्र।', url: 'https://msk.upsdc.gov.in' },
  { icon: 'fitness-outline', tag: 'Workshops', title: 'आत्मरक्षा प्रशिक्षण', desc: 'मुफ़्त सुरक्षा कार्यशालाएं व आत्मरक्षा प्रमाणीकरण।', url: 'https://msk.upsdc.gov.in' },
];

// 04. पुलिस सेवाएं — पूरी सूची PoliceServicesScreen में है (25+ सेवाएं, 6 समूहों में),
// यहाँ Home पर सिर्फ़ सबसे ज़्यादा इस्तेमाल होने वाली सेवाएं सीधे दिखती हैं, बाकी के लिए
// "और सेवाएं देखें" कार्ड पूरी सूची तक ले जाता है — वरना Home बहुत लंबा हो जाता।
const POLICE_SERVICE_HIGHLIGHTS = [
  { icon: 'document-text-outline', tag: 'UPCOP पोर्टल', title: 'ई-प्राथमिकी (e-FIR) दर्ज करें', desc: 'चोरी व अज्ञात के विरुद्ध ऑनलाइन FIR।', url: 'https://cctnsup.gov.in/citizen/login.aspx' },
  { icon: 'laptop-outline', tag: 'राष्ट्रीय पोर्टल', title: 'साइबर अपराध की शिकायत', desc: 'ऑनलाइन ठगी, हैकिंग या उत्पीड़न की शिकायत (NCRP 1930)।', url: 'https://cybercrime.gov.in/' },
  { icon: 'phone-portrait-outline', tag: 'CEIR', title: 'खोया मोबाइल ब्लॉक करें', desc: 'चोरी/गुम हुए मोबाइल को पूरे देश में ब्लॉक करें।', url: 'https://www.ceir.gov.in/' },
  { icon: 'car-outline', tag: 'परिवहन', title: 'eChallan स्थिति देखें', desc: 'वाहन नंबर से यातायात चालान देखें व भुगतान करें।', url: 'https://echallan.parivahan.gov.in/' },
];

const GUIDE_STEPS = [
  { icon: 'shield-checkmark-outline', title: 'शिकायत दर्ज करें', desc: 'नीचे 5 श्रेणियों में से चुनें और कुछ ही मिनटों में शिकायत दर्ज करें।' },
  { icon: 'search-outline', title: 'स्थिति ट्रैक करें', desc: 'शिकायत नंबर से या अपने डैशबोर्ड से कभी भी स्थिति देखें।' },
  { icon: 'call-outline', title: 'तुरंत मदद चाहिए?', desc: 'ऊपर SOS बटन दबाकर तुरंत पुलिस को कॉल करें, कहीं से भी।' },
];

const GUIDE_SEEN_KEY = 'shaktikop:seenHomeGuide';

export default function HomeScreen({ navigation }) {
  const { role, user, pendingCategory, setPendingCategory, fetchBanners, fetchPublicStats, fetchPublicWelfare, complaints, quickSos } = useApp();
  const { t, locale, toggleLocale } = useLocale();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // 🐛 बग फ़िक्स: पहले सिर्फ़ चौड़ाई (width) के आधार पर ऊँचाई तय होती थी — landscape
  // फ़ोन पर (जहाँ चौड़ाई ज़्यादा पर ऊँचाई बहुत कम होती है) यह बैनर स्क्रीन की कुल
  // ऊँचाई का 70%+ हिस्सा ले लेता, नीचे खोज-बॉक्स/बाक़ी सामग्री के लिए जगह ही नहीं
  // बचती ("perfect" नहीं दिखता)। अब ऊपरी सीमा स्क्रीन की मौजूदा ऊँचाई के 32% तक भी
  // सीमित है — landscape पर बैनर छोटा रहेगा, बाक़ी सामग्री दिखने लायक जगह बचेगी।
  //
  // 🐛 बग फ़िक्स 2: पहले bannerHeight सिर्फ़ स्क्रीन-चौड़ाई के एक तय अनुपात (0.34) से
  // तय होती थी — असली image के अपने aspect-ratio से इसका कोई नाता नहीं था। नतीजा: जब
  // container का अनुपात image के असली अनुपात से अलग होता (जैसा टैबलेट पर अक्सर होता,
  // देखें उपयोगकर्ता का स्क्रीनशॉट), resizeMode="contain" (जो image को कभी काटता नहीं)
  // की वजह से ऊपर-नीचे खाली मैरून पट्टी बच जाती — "पूरा नहीं भरा" जैसा दिखता। अब असली
  // image लोड होते ही उसकी natural width/height (Image.getSize) से बैनर की ऊँचाई सीधे
  // उसी अनुपात में तय होती है — तो कोई भी image (किसी भी device पर) बिना काटे और बिना
  // खाली जगह छोड़े ठीक-ठीक भर जाती है। Image.getSize विफल हो या कोई image न हो
  // (gradient slide), तब पुराना चौड़ाई-आधारित अंदाज़ा (fallback) काम करता है।
  const [imageAspectRatio, setImageAspectRatio] = useState(null); // width / height
  const bannerHeight = imageAspectRatio
    ? Math.min(Math.max(windowWidth / imageAspectRatio, 150), Math.min(320, windowHeight * 0.4))
    : Math.min(Math.max(windowWidth * 0.34, 150), Math.min(320, windowHeight * 0.32));

  const [slides, setSlides] = useState(FALLBACK_SLIDES);
  // 🆕 Banner transition — पहले हमेशा एक तय (fade, 400ms, हर 4.5 सेकंड) तरीक़े से
  // बदलता था, कोई विकल्प नहीं था। अब Super Admin "ऐप सेटिंग्स" से transition का
  // प्रकार (fade/slide/none), उसकी गति, और कितनी देर हर slide दिखे — यह तय कर
  // सकते हैं। डिफ़ॉल्ट पुराने व्यवहार जैसा ही है (fade, 400ms, 4.5 सेकंड)।
  const [bannerSettings, setBannerSettings] = useState({ transitionType: 'fade', transitionDurationMs: 400, autoPlayIntervalMs: 4500 });
  const [slide, setSlide] = useState(0);
  const [transitionSlide, setTransitionSlide] = useState(0); // ऊपर वाली परत — transition के दौरान पुरानी slide दिखाकर फीकी पड़ती है
  const fade = useRef(new Animated.Value(0)).current; // 0 = ऊपर वाली परत छुपी (सामान्य स्थिति), 1 = transition शुरू
  const slideX = useRef(new Animated.Value(0)).current; // 'slide' transition के लिए — ऊपर वाली परत का क्षैतिज खिसकाव
  const contentFade = useRef(new Animated.Value(0)).current;

  const [loadingContent, setLoadingContent] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [scrolling, setScrolling] = useState(false);
  const [scrollTick, setScrollTick] = useState(0);
  // Collapsing header — पूरा banner कितना ऊँचा है यह एक बार माप लेते हैं (फ़ॉन्ट-आकार वाली सुविधा हटा दी गई है)
  const [headerMax, setHeaderMax] = useState(0);
  const HEADER_MIN = 96; // सिकुड़ने पर बची पट्टी — control बटन + छोटा ShaktiCop

  useEffect(() => {
    if (role === 'citizen' && pendingCategory) {
      const cat = pendingCategory;
      setPendingCategory(null);
      navigation.navigate('ComplaintForm', { category: cat });
    }
  }, [role, pendingCategory]);

  const loadContent = async (isRefresh = false) => {
    try {
      const banners = await fetchBanners();
      if (banners && banners.length > 0) {
        const newSlides = banners.map((b) => ({ title: b.title, subtitle: b.subtitle, colorStart: b.colorStart, colorEnd: b.colorEnd, icon: b.icon, imageUrl: b.imageUrl }));
        setSlides(newSlides);
        const firstWithImage = newSlides.find((s) => s.imageUrl);
        if (firstWithImage) {
          Image.getSize(
            firstWithImage.imageUrl,
            (w, h) => {
              if (w > 0 && h > 0) setImageAspectRatio(w / h);
            },
            () => {
              // getSize विफल (जैसे टूटी हुई URL) — पुराना चौड़ाई-आधारित अंदाज़ा ही चलता रहेगा
            }
          );
        } else {
          setImageAspectRatio(null); // सिर्फ़ gradient slides — कोई image ही नहीं
        }
      }
    } catch (e) {
      // डिफ़ॉल्ट slides बने रहते हैं
    }
    try {
      const appSettings = await fetchAppSettings();
      if (appSettings?.banner_carousel) setBannerSettings(appSettings.banner_carousel);
    } catch (e) {
      // डिफ़ॉल्ट transition settings बनी रहती हैं
    }
    try {
      const s = await fetchPublicStats();
      setStats(s);
    } catch (e) {
      // ignore
    }
    try {
      const items = await fetchPublicWelfare();
      if (Array.isArray(items) && items.length > 0) {
        const mapped = (arr) => arr.map((w) => ({ icon: w.icon || 'document-text-outline', tag: w.tag || 'Scheme', title: w.title, desc: w.description, url: w.url }));
        const welfareItems = mapped(items.filter((w) => w.section === 'welfare'));
        const supportItems = mapped(items.filter((w) => w.section === 'support'));
        if (welfareItems.length > 0) {
          WELFARE_SCHEMES.length = 0;
          WELFARE_SCHEMES.push(...welfareItems);
        }
        if (supportItems.length > 0) {
          SUPPORT_SERVICES.length = 0;
          SUPPORT_SERVICES.push(...supportItems);
        }
      }
    } catch (e) {
      // सर्वर से न मिले तो fallback hardcoded सूचियां इस्तेमाल होती रहेंगी
    }
    if (isRefresh) {
      setRefreshing(false);
    } else {
      setLoadingContent(false);
      Animated.timing(contentFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  };

  const onPullRefresh = async () => {
    setRefreshing(true);
    await loadContent(true);
  };

  useEffect(() => {
    (async () => {
      await loadContent(false);
      try {
        const seen = await AsyncStorage.getItem(GUIDE_SEEN_KEY);
        if (!seen) setShowGuide(true);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // ⚠️ Banner का fade तभी चले जब उपयोगकर्ता scroll न कर रहा हो।
  //
  // header की ऊँचाई animate करने के लिए scroll listener को useNativeDriver: false
  // रखना पड़ता है — इससे हर scroll frame पर component दोबारा render होता है।
  // उसी बीच fade animation चलती रहे तो banner तेज़ी से झपकता दिखता है।
  // scroll करते ही carousel रुक जाता है, रुकते ही फिर चालू — banner स्थिर रहता है।
  //
  // 🐛 बग फ़िक्स: पहले सिर्फ़ एक ही layer था — वह "1 → 0 (ग़ायब)" होकर फिर अगली slide
  // पर "0 → 1 (दिखना)" शुरू करता था। बीच के उस पल में (opacity 0 के आसपास) नीचे की
  // असली screen background (हल्का गुलाबी रंग) झलक जाती थी। अब दो परतें हैं: नीचे वाली
  // हमेशा पूरी तरह ठोस/अपारदर्शी रहती है और तुरंत अगली slide दिखाने लगती है; ऊपर वाली
  // (जो पुरानी slide दिखा रही थी) उसके ऊपर से धीरे-धीरे फीकी पड़ती है — इसलिए किसी भी
  // पल background कभी नहीं झलकता, हमेशा कोई न कोई image/gradient ही दिखता रहता है।
  // 🆕 अब तीन तरह के transition — fade (जैसा पहले था), slide (पुरानी slide बग़ल
  // में खिसककर हटती है), none (तुरंत बदल जाए, कोई animation नहीं) — Super Admin
  // "ऐप सेटिंग्स" से चुन सकते हैं, साथ ही गति (duration) और हर slide कितनी देर
  // दिखे (interval) भी।
  useEffect(() => {
    if (slides.length <= 1 || scrolling) return;
    const { transitionType, transitionDurationMs, autoPlayIntervalMs } = bannerSettings;
    const timer = setInterval(() => {
      setTransitionSlide(slide); // ऊपर वाली परत पुरानी slide को थाम लेती है
      setSlide((s) => (s + 1) % slides.length); // नीचे वाली परत तुरंत अगली slide पर (छुपी हुई, कोई फ़र्क़ नहीं दिखता)

      if (transitionType === 'none') {
        fade.setValue(0);
        return;
      }
      if (transitionType === 'slide') {
        fade.setValue(1); // पूरी तरह अपारदर्शी रहेगी, सिर्फ़ खिसककर हटेगी (fade नहीं)
        slideX.setValue(0);
        Animated.timing(slideX, { toValue: -windowWidth, duration: transitionDurationMs, useNativeDriver: true }).start();
        return;
      }
      // डिफ़ॉल्ट — fade
      fade.setValue(1); // ऊपर वाली परत को तुरंत पूरी तरह दिखा दो (अभी जैसा दिख रहा था वैसा ही)
      Animated.timing(fade, { toValue: 0, duration: transitionDurationMs, useNativeDriver: true }).start();
    }, autoPlayIntervalMs);
    return () => clearInterval(timer);
  }, [slides.length, scrolling, slide, bannerSettings, windowWidth]);

  // scroll रुकने के 1 सेकंड बाद carousel दोबारा चालू
  useEffect(() => {
    if (scrollTick === 0) return;
    const t = setTimeout(() => setScrolling(false), 1000);
    return () => clearTimeout(t);
  }, [scrollTick]);

  const dismissGuide = async () => {
    setShowGuide(false);
    await AsyncStorage.setItem(GUIDE_SEEN_KEY, '1').catch(() => {});
  };


  const onCategoryPress = (categoryKey) => {
    if (role === 'citizen') {
      navigation.navigate('ComplaintForm', { category: categoryKey });
    } else {
      setPendingCategory(categoryKey);
      navigation.navigate('Login', { mode: 'citizen' });
    }
  };

  const callHelpline = (number) => {
    Linking.openURL(`tel:${number}`).catch(() => Alert.alert(tt('त्रुटि'), tt('डायलर नहीं खोला जा सका।')));
  };

  // सहायता सेवाएं / कल्याणकारी योजनाएं / पुलिस सेवाएं — सभी सरकारी पोर्टल के बाहरी लिंक हैं,
  // इसलिए login की ज़रूरत नहीं — कोई भी बिना खाते के भी खोल सकता है
  const openExternal = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => Alert.alert(tt('त्रुटि'), tt('पेज नहीं खुल सका।')));
  };

  // ⚠️ बग फ़िक्स: "सहायता सेवाएं" के 4 कार्ड (काउंसलिंग, कानूनी सहायता, आत्मरक्षा,
  // जन शिक्षण संस्थान) असल में ऐप के अपने फ़ॉर्म पर जाने चाहिए — पहले ग़लती से बाहरी
  // वेबसाइट (msk.upsdc.gov.in) पर भेज देते थे, इसलिए ब्राउज़र खुल जाता था और
  // अनुरोध कभी अधिकारी/एडमिन तक पहुँचता ही नहीं था। अब लेबल के आधार पर सही
  // SERVICE_TYPES key ढूंढकर सीधे ऐप के अंदर ही फ़ॉर्म खोलते हैं।
  const supportServiceKey = (title) => {
    const t = String(title || '');
    return Object.values(SERVICE_TYPES).find((s) => t.includes(s.label))?.key || null;
  };

  const openSupportService = (s) => {
    const type = supportServiceKey(s.title);
    if (!type) return openExternal(s.url); // पहचान न हो सके तो पुराना बाहरी लिंक ही सही
    if (!role) {
      return Alert.alert(
        tt('लॉगिन आवश्यक है'),
        tt('अनुरोध भेजने के लिए पहले नागरिक खाते से लॉगिन करें — लॉगिन के बाद इस कार्ड पर दोबारा टैप करके फ़ॉर्म खोलें।'),
        [
          { text: tt('रद्द करें'), style: 'cancel' },
          { text: tt('लॉगिन करें'), onPress: () => navigation.navigate('Login', { mode: 'citizen' }) },
        ]
      );
    }
    navigation.navigate('ServiceRequestForm', { type });
  };

  const [sosBusy, setSosBusy] = useState(false);
  const quickSOS = async () => {
    if (role !== 'citizen') {
      Alert.alert(tt('लॉगिन आवश्यक है'), tt('SOS भेजने के लिए पहले नागरिक के रूप में लॉगिन करें।'), [
        { text: tt('ठीक है'), style: 'cancel' },
        { text: tt('लॉगिन करें'), onPress: () => navigation.navigate('Login', { mode: 'citizen' }) },
      ]);
      return;
    }
    Alert.alert(tt('SOS भेजें?'), tt('आपकी लाइव लोकेशन और पूरी प्रोफ़ाइल के साथ नज़दीकी थाने और एडमिन को तुरंत सूचना भेजी जाएगी।'), [
      { text: tt('रद्द करें'), style: 'cancel' },
      {
        text: tt('हाँ, SOS भेजें'),
        style: 'destructive',
        onPress: async () => {
          setSosBusy(true);
          try {
            const complaintId = await quickSos();
            Alert.alert(tt('SOS भेज दिया गया'), tt('आपकी लाइव लोकेशन के साथ नज़दीकी थाने और एडमिन को तुरंत सूचना भेज दी गई है।'));
            navigation.navigate('ComplaintDetail', { id: complaintId });
          } catch (e) {
            Alert.alert(tt('त्रुटि'), e.message || tt('SOS भेजा नहीं जा सका।'));
          }
          setSosBusy(false);
        },
      },
    ]);
  };

  const current = slides[slide] || FALLBACK_SLIDES[0];
  const q = search.trim().toLowerCase();
  const filteredCategories = q
    ? CATEGORY_DEFS.filter((c) => (c.label || '').toLowerCase().includes(q) || (c.desc || '').toLowerCase().includes(q))
    : CATEGORY_DEFS;
  const filteredHelplines = q ? HELPLINES.filter((h) => (h.label || '').toLowerCase().includes(q) || (h.number || '').includes(q)) : HELPLINES;
  // 🐛 बग फ़िक्स: पहले "सहायता सेवाएं" व "कल्याणकारी योजनाएं" सिर्फ़ title में खोजते थे
  // (description में नहीं), और "पुलिस सेवाएं" सेक्शन खोज करते ही पूरी तरह ग़ायब हो जाता
  // था (कोई filter ही नहीं था) — इसलिए ज़्यादातर खोज पर आधा-अधूरा या खाली परिणाम दिखता।
  // अब चारों सेक्शन एक जैसे तरीक़े से title + description दोनों में खोजते हैं।
  // साथ ही title/desc पर null-guard भी जोड़ा — ये दोनों array server से dynamically भी
  // भर सकते हैं (कल्याणकारी योजनाएं/श्रेणियां), बिना guard के कोई भी अधूरा server-data
  // पूरे Home page को crash कर सकता था (सिर्फ़ खोज करते समय नहीं, हर render पर)।
  const matchesQuery = (item) =>
    !q || (item.title || '').toLowerCase().includes(q) || (item.desc || '').toLowerCase().includes(q);
  const filteredSupport = SUPPORT_SERVICES.filter(matchesQuery);
  const filteredWelfare = WELFARE_SCHEMES.filter(matchesQuery);
  const filteredPolice = POLICE_SERVICE_HIGHLIGHTS.filter(matchesQuery);
  const noResultsAnywhere =
    !!q &&
    filteredCategories.length === 0 &&
    filteredHelplines.length === 0 &&
    filteredSupport.length === 0 &&
    filteredWelfare.length === 0 &&
    filteredPolice.length === 0;

  const profileIncomplete = role === 'citizen' && user && (!user.emergencyContacts || user.emergencyContacts.length === 0);

  // बैनर की एक "परत" (image या gradient) बनाता है — नीचे वाली (हमेशा दिखने वाली) और
  // ऊपर वाली (transition के दौरान फीकी पड़ने वाली) दोनों परतों के लिए एक जैसा इस्तेमाल होता है।
  const renderSlideLayer = (data) => {
    const s = data || FALLBACK_SLIDES[0];
    return s.imageUrl ? (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: s.colorStart || colors.shaktiMaroon }]}>
        <Image source={{ uri: s.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      </View>
    ) : (
      <LinearGradient colors={[s.colorStart || '#D6336C', s.colorEnd || '#9B2647']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Ionicons name={s.icon || 'shield-checkmark'} size={150} color="rgba(255,255,255,0.09)" style={styles.watermark} />
      </LinearGradient>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.sand }}>
      {/* 🎨 सबसे ऊपर पतली रंगीन पट्टी — इसके ठीक नीचे नियंत्रण-पट्टी (profile, भाषा,
          zoom, लॉगिन बटन) हमेशा एक ठोस background पर, बैनर के ऊपर (अलग परत में)
          रहती है — ताकि Super Admin की अपलोड की गई कोई भी बैनर image चाहे जितनी
          चमकीली/भारी हो, ये बटन कभी उसके पीछे न छुपें या धुंधले न दिखें। */}
      <LinearGradient
        colors={['#C98A2B', '#D6336C', '#8E2A46']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topAccentLine}
      />
      <View style={styles.topControlBar}>
        <View style={styles.topLeftGroup}>
          {/* 🐛 बग फ़िक्स: HomeScreen का अपना header अब Drawer के डिफ़ॉल्ट header के ऊपर
              दोहरा नहीं दिखता (नीचे देखें) — पर उस डिफ़ॉल्ट header में ही साइड-मेनू (☰)
              खोलने का बटन होता था। इसे हटाने से साइड-मेनू (प्रोफ़ाइल, SOS, लॉगआउट आदि)
              तक पहुंचने का कोई रास्ता नहीं बचता था। अब यहीं ☰ बटन वापस जोड़ दिया। */}
          {role === 'citizen' && (
            <TouchableOpacity style={styles.menuBtn} onPress={() => navigation.toggleDrawer()}>
              <Ionicons name="menu" size={24} color={colors.white} />
            </TouchableOpacity>
          )}
          <PoliceLogoIcon size={28} />
          <View>
            <Text style={[styles.topBrandTitle, { fontSize: 17 }]}>{t('ShaktiCop')}</Text>
            <Text style={[styles.topBrandSubtitle, { fontSize: 9 }]}>{tt('उत्तर प्रदेश पुलिस')}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {role === 'citizen' && <NotificationBell tintColor={colors.white} />}
          <TouchableOpacity style={styles.langBtn} onPress={toggleLocale}>
            <Ionicons name="language-outline" size={13} color={colors.shaktiMaroon} />
            <Text style={styles.langBtnText}>{locale === 'hi' ? 'EN' : 'हिं'}</Text>
          </TouchableOpacity>
          {role === 'citizen' ? (
            <TouchableOpacity style={styles.pillBtn} onPress={() => navigation.navigate('CitizenAllComplaints')}>
              <Ionicons name="grid-outline" size={13} color={colors.shaktiMaroon} />
              <Text style={styles.pillBtnText}>{t('डैशबोर्ड')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.pillBtn} onPress={() => navigation.navigate('Login', { mode: 'citizen' })}>
                <Text style={styles.pillBtnText}>{t('नागरिक लॉगिन')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pillBtn} onPress={() => navigation.navigate('Login', { mode: 'staff' })}>
                <Text style={styles.pillBtnText}>{t('स्टाफ़ लॉगिन')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/*
        🔒 यह ShaktiCop बैनर अब पूरी तरह FIXED है — scroll करने पर यह न तो सिकुड़ेगा,
        न ही खिसकेगा, न fade होगा। पहले scrollY के आधार पर height/opacity animate
        होती थी (collapsing header), जिसे यहीं से हटा दिया गया है — बैनर हमेशा अपनी
        पूरी ऊँचाई पर स्थिर (freeze) रहेगा।
      */}
      <View style={[styles.headerWrap, { height: bannerHeight }]}>
        {/* नीचे वाली परत — हमेशा ठोस/अपारदर्शी, हमेशा असली मौजूदा slide दिखाती है */}
        <View style={StyleSheet.absoluteFill}>{renderSlideLayer(current)}</View>

        {/* ऊपर वाली परत — transition के दौरान पुरानी slide दिखाते हुए फीकी पड़ती है,
            सामान्य समय में अदृश्य (opacity 0) रहती है */}
        {slides.length > 1 && (
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: fade, transform: [{ translateX: slideX }] }]}
            pointerEvents="none"
          >
            {renderSlideLayer(slides[transitionSlide] || FALLBACK_SLIDES[0])}
          </Animated.View>
        )}

        {/* सिर्फ़ सबसे निचले किनारे पर हल्का सा गहरा fade — कोई टेक्स्ट नहीं, बस इतना
            ताकि नीचे के dots किसी भी चमकीली/हल्के रंग की बैनर image पर भी साफ़ दिखें */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.22)']}
          style={styles.bannerBottomFade}
          pointerEvents="none"
        />

        {slides.length > 1 && (
          <View style={styles.dotsRow}>
            {slides.map((_, i) => (
              <View key={i} style={[styles.dot, i === slide && styles.dotActive]} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.inkLight} />
        <TextInput
          style={[styles.searchInput, { fontSize: 13.5 }]}
          placeholder={tt('शिकायत श्रेणी, हेल्पलाइन या योजना खोजें…')}
          value={search}
          onChangeText={setSearch}
          maxLength={100}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.inkLight} />
          </TouchableOpacity>
        )}
      </View>

      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        style={{ opacity: contentFade }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        // ⚠️ scroll की शुरुआत व अंत पर ही state बदलते हैं — हर frame पर नहीं।
        // हर frame पर setState करना उल्टा और भी झिलमिलाहट पैदा करता।
        onScrollBeginDrag={() => {
          fade.setValue(0); // ऊपर वाली परत छुपा दो — बीच में कोई transition अटकी न रहे
          slideX.setValue(0); // slide-transition के बीच में रुकी हो तो भी अगली बार शुरुआत से चले
          setScrolling(true);
        }}
        onScrollEndDrag={() => setScrollTick((n) => n + 1)}
        onMomentumScrollBegin={() => setScrolling(true)}
        onMomentumScrollEnd={() => setScrollTick((n) => n + 1)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.shaktiMaroon} colors={[colors.shaktiMaroon]} />
        }
      >
        {role === 'citizen' && user && (
          <View style={styles.welcomeCard}>
            <View style={styles.welcomeAccent} />
            <View style={styles.welcomeRow}>
              {user.photoUrl ? (
                <Image source={{ uri: user.photoUrl }} style={styles.welcomeAvatarImg} />
              ) : (
                <View style={styles.welcomeAvatarFallback}>
                  <Text style={styles.welcomeAvatarText}>
                    {(user.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.welcomeText, { fontSize: 15 }]}>
                  {tt(timeGreeting().text)}, {user.name?.split(' ')[0]}
                </Text>
                {profileIncomplete ? (
                  <TouchableOpacity style={styles.reminderRow} onPress={() => navigation.navigate('CitizenProfile')}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.marigold} />
                    <Text style={styles.reminderText}>{tt('इमरजेंसी संपर्क जोड़ें — संकट में तुरंत काम आएगा')}</Text>
                  </TouchableOpacity>
                ) : (
                  // 🎨 सकारात्मक पुष्टि — जब सब तैयार हो तो सिर्फ़ चुप्पी न हो, भरोसा दिलाना भी ज़रूरी
                  <View style={styles.readyRow}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.sage} />
                    <Text style={styles.readyText}>{tt('आपातकालीन तैयारी पूरी है')}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {(!q || filteredHelplines.length > 0) && (
          <>
            <Text style={[styles.sectionTitle, { fontSize: 15 }]}>{t('आपातकालीन हेल्पलाइन')}</Text>
            {loadingContent ? (
              <SkeletonRow />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.helplineRow}>
                {filteredHelplines.map((h, i) => (
                  <StaggerItem key={h.number} index={i}>
                    <View style={styles.helplineCard}>
                      <View style={[styles.helplineIconBox, { backgroundColor: h.color + '1A' }]}>
                        <Ionicons name={h.icon} size={19} color={h.color} />
                      </View>
                      <View style={styles.helplineTextWrap}>
                        <Text style={[styles.helplineLabel, { fontSize: 12.5 }]} numberOfLines={2}>
                          {t(h.label)}
                        </Text>
                        <Text style={[styles.helplineNumber, { color: h.color, fontSize: 16 }]}>
                          {h.number}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.helplineActionBtn, { backgroundColor: h.color + '14' }]}
                        onPress={() => callHelpline(h.number)}
                      >
                        <Ionicons name="call" size={17} color={h.color} />
                      </TouchableOpacity>
                    </View>
                  </StaggerItem>
                ))}
              </ScrollView>
            )}
          </>
        )}

        <TouchableOpacity style={styles.nearbyBtn} onPress={() => navigation.navigate('NearbyHelp')}>
          <View style={styles.nearbyIconWrap}>
            <Ionicons name="location" size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nearbyTitle}>{tt('नज़दीकी थाना व अस्पताल')}</Text>
            <Text style={styles.nearbySub}>{tt('नक्शे पर देखें, तुरंत दिशा-निर्देश पाएं')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkLight} />
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { fontSize: 15 }]}>{tt('01. शिकायत दर्ज करें')}</Text>
        {loadingContent ? (
          <SkeletonGrid />
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            {filteredCategories.map((c, i) => {
              const Art = CARD_ART[c.key];
              return (
                <StaggerItem key={c.key} index={i}>
                  <AnimatedCard onPress={() => onCategoryPress(c.key)} style={styles.wideCard}>
                    <View style={[styles.wideIconBadge, { backgroundColor: c.color }]}>
                      <Ionicons name={c.icon} size={18} color={colors.white} />
                    </View>
                    <View style={styles.wideTextCol}>
                      <Text style={[styles.wideTitle, { fontSize: 15 }]}>{t(c.label)}</Text>
                      <Text style={[styles.wideDesc, { fontSize: 12 }]} numberOfLines={2}>
                        {t(c.desc)}
                      </Text>
                      <Text style={[styles.wideLink, { color: c.color }]}>{t('शिकायत दर्ज करें')} →</Text>
                    </View>
                    {Art && (
                      <View style={styles.wideArtWrap}>
                        <Art width={92} height={78} />
                      </View>
                    )}
                  </AnimatedCard>
                </StaggerItem>
              );
            })}
            {filteredCategories.length === 0 && !noResultsAnywhere && <Text style={styles.noResults}>{tt('कुछ नहीं मिला।')}</Text>}
          </View>
        )}

        {/* ---------- 02. सहायता सेवाएं — काउंसलिंग, कानूनी सहायता आदि ---------- */}
        {(!q || filteredSupport.length > 0) && (
          <>
            <Text style={[styles.sectionTitle, { fontSize: 15 }]}>{tt('02. सहायता सेवाएं')}</Text>
            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              {filteredSupport.map((s, i) => (
                <StaggerItem key={s.title} index={i}>
                  <TouchableOpacity style={styles.svcListCard} onPress={() => openSupportService(s)} activeOpacity={0.85}>
                    <View style={styles.svcListIconBox}>
                      <Ionicons name={s.icon} size={19} color={colors.inkNavy} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.svcTagPillAlt}>
                        <Text style={styles.svcTagTextAlt}>{tt(s.tag)}</Text>
                      </View>
                      <Text style={[styles.svcListTitle, { fontSize: 14 }]}>{tt(s.title)}</Text>
                      <Text style={[styles.svcListDesc, { fontSize: 11.5 }]}>{tt(s.desc)}</Text>
                      <View style={styles.proceedRow}>
                        <Text style={styles.proceedText}>{tt('अनुरोध भेजने के लिए यहां दबाएं')}</Text>
                        <Ionicons name="arrow-forward" size={13} color={colors.shaktiMaroon} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </StaggerItem>
              ))}
            </View>
          </>
        )}

        {/* ---------- 03. कल्याणकारी योजनाएं — कन्या सुमंगला आदि ---------- */}
        {(!q || filteredWelfare.length > 0) && (
          <>
            <Text style={[styles.sectionTitle, { fontSize: 15 }]}>{tt('03. कल्याणकारी योजनाएं')}</Text>
            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              {filteredWelfare.map((s, i) => (
                <StaggerItem key={s.title} index={i}>
                  <TouchableOpacity style={styles.svcListCard} onPress={() => openExternal(s.url)} activeOpacity={0.85}>
                    <View style={styles.svcListIconBox}>
                      <Ionicons name={s.icon} size={19} color={colors.inkNavy} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.svcTagPillAlt}>
                        <Text style={styles.svcTagTextAlt}>{tt(s.tag)}</Text>
                      </View>
                      <Text style={[styles.svcListTitle, { fontSize: 14 }]}>{tt(s.title)}</Text>
                      <Text style={[styles.svcListDesc, { fontSize: 11.5 }]}>{tt(s.desc)}</Text>
                      <View style={styles.proceedRow}>
                        <Text style={styles.proceedText}>{tt('आवेदन के लिए पोर्टल खोलें')}</Text>
                        <Ionicons name="open-outline" size={13} color={colors.shaktiMaroon} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </StaggerItem>
              ))}
            </View>
          </>
        )}

        {/* ---------- 04. पुलिस सेवाएं — ई-FIR आदि (सबसे ज़्यादा इस्तेमाल होने वाली यहीं, बाकी पूरी सूची में) ----------
             🐛 बग फ़िक्स: पहले खोज करते ही (q होने पर) यह सेक्शन पूरी तरह ग़ायब हो जाता था,
             चाहे कोई मेल खाता हो या नहीं — अब बाकी 3 सेक्शन जैसा ही व्यवहार करता है। */}
        {(!q || filteredPolice.length > 0) && (
          <>
            <Text style={[styles.sectionTitle, { fontSize: 15 }]}>{tt('04. पुलिस सेवाएं')}</Text>
            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              {filteredPolice.map((s, i) => (
                <StaggerItem key={s.title} index={i}>
                  <TouchableOpacity style={styles.svcListCard} onPress={() => openExternal(s.url)} activeOpacity={0.85}>
                    <View style={styles.svcListIconBox}>
                      <Ionicons name={s.icon} size={19} color={colors.inkNavy} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.svcTagPillAlt}>
                        <Text style={styles.svcTagTextAlt}>{tt(s.tag)}</Text>
                      </View>
                      <Text style={[styles.svcListTitle, { fontSize: 14 }]}>{tt(s.title)}</Text>
                      <Text style={[styles.svcListDesc, { fontSize: 11.5 }]}>{tt(s.desc)}</Text>
                      <View style={styles.proceedRow}>
                        <Text style={styles.proceedText}>{tt('पोर्टल खोलें')}</Text>
                        <Ionicons name="open-outline" size={13} color={colors.shaktiMaroon} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </StaggerItem>
              ))}
              <TouchableOpacity style={styles.moreServicesBtn} onPress={() => navigation.navigate('PoliceServices')}>
                <Text style={styles.moreServicesText}>{tt('सभी पुलिस सेवाएं देखें (25+)')}</Text>
                <Ionicons name="arrow-forward" size={15} color={colors.shaktiMaroon} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {noResultsAnywhere && (
          <View style={styles.globalNoResults}>
            <Ionicons name="search-outline" size={30} color={colors.inkLight} />
            <Text style={styles.globalNoResultsText}>{tt('"')}{search}{tt('" के लिए कुछ नहीं मिला — कोई और शब्द आज़माएं।')}</Text>
          </View>
        )}
      </Animated.ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={quickSOS}
        activeOpacity={0.85}
        disabled={sosBusy}
        accessibilityLabel={tt('आपातकालीन SOS')}
      >
        {sosBusy ? <Text style={styles.fabText}>…</Text> : <Ionicons name="warning" size={26} color={colors.white} />}
      </TouchableOpacity>

      <Modal visible={showGuide} transparent animationType="fade" onRequestClose={dismissGuide}>
        <View style={styles.guideOverlay}>
          <View style={styles.guideCard}>
            <Ionicons name={GUIDE_STEPS[guideStep].icon} size={40} color={colors.shaktiMaroon} />
            <Text style={styles.guideTitle}>{tt(GUIDE_STEPS[guideStep].title)}</Text>
            <Text style={styles.guideDesc}>{tt(GUIDE_STEPS[guideStep].desc)}</Text>
            <View style={styles.guideDots}>
              {GUIDE_STEPS.map((_, i) => (
                <View key={i} style={[styles.guideDot, i === guideStep && styles.guideDotActive]} />
              ))}
            </View>
            <View style={styles.guideBtnRow}>
              <TouchableOpacity onPress={dismissGuide}>
                <Text style={styles.guideSkip}>{tt('छोड़ें')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.guideNextBtn}
                onPress={() => (guideStep < GUIDE_STEPS.length - 1 ? setGuideStep((s) => s + 1) : dismissGuide())}
              >
                <Text style={styles.guideNextText}>{guideStep < GUIDE_STEPS.length - 1 ? 'आगे' : 'शुरू करें'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AnimatedCard({ children, onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// लिस्ट/ग्रिड के हर आइटम को थोड़ी-थोड़ी देरी से fade + slide-up के साथ दिखाता है,
// ताकि सब कुछ एक साथ न आकर क्रम से (stagger) उभरे — ज़्यादा जीवंत महसूस होता है
function StaggerItem({ index = 0, children, style }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    const delay = Math.min(index, 8) * 60;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

function SkeletonRow() {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16 }}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonHelpline} />
      ))}
    </View>
  );
}
function SkeletonGrid() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topAccentLine: { height: 4, width: '100%' },
  topControlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 42,
    paddingBottom: 10,
    backgroundColor: colors.shaktiMaroon,
  },
  topLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  menuBtn: { marginRight: 2 },
  topBrandTitle: { color: colors.white, fontWeight: '800', letterSpacing: 0.3 },
  topBrandSubtitle: { color: 'rgba(255,255,255,0.75)', fontWeight: '600', letterSpacing: 0.4, marginTop: 1 },
  // 🐛 बग फ़िक्स: पहले height तय नहीं थी — अंदर के टेक्स्ट (logo+ShaktiCop+tagline आदि)
  // की ऊँचाई से अपने-आप बनती थी। टेक्स्ट हटाने के बाद यह बहुत छोटी रह जाती, जिससे
  // अपलोड की गई बैनर image का ऊपरी हिस्सा "cover" mode में कट जाता (crop हो जाता)।
  // अब एक तय (fixed) ऊँचाई है — इमेज हमेशा पूरी और साफ़ दिखेगी, कोई टेक्स्ट ओवरले नहीं।
  // निचले कोनों को हल्का गोल किया — बैनर से search box में transition नरम लगे।
  headerWrap: { overflow: 'hidden', backgroundColor: colors.shaktiMaroon, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  bannerBottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 46 },
  compactBar: { position: 'absolute', left: 0, right: 0, bottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  compactTitle: { color: colors.white, fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  watermark: { position: 'absolute', right: -30, bottom: -30 },
  langBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.white, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 14 },
  langBtnText: { fontSize: 11, fontWeight: '700', color: colors.shaktiMaroon },
  pillBtn: { backgroundColor: colors.white, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14 },
  pillBtnText: { fontSize: 10.5, fontWeight: '700', color: colors.shaktiMaroon },
  dotsRow: { position: 'absolute', left: 0, right: 0, bottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: colors.white, width: 16 },

  // 🐛 बग फ़िक्स: पहले marginTop: -18 था — search box banner के ऊपर 18px चढ़कर बैठता
  // था, जिससे banner image का निचला हिस्सा ढका जाता ("part hide ho raha tha")। अब
  // हल्का सा नीचे कर दिया — search box banner के just नीचे बैठता है, कुछ भी नहीं ढकता।
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, marginHorizontal: 16, marginTop: 12, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, shadowColor: colors.inkNavy, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3, zIndex: 5 },
  searchInput: { flex: 1, color: colors.inkNavy },

  trustCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.marigoldWash, marginHorizontal: 16, marginTop: 16, borderRadius: radius.md, padding: 12 },
  trustText: { flex: 1, color: colors.inkGrey },
  trustNum: { fontWeight: '800', color: colors.marigold },

  welcomeCard: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: radius.lg,
    padding: 16,
    overflow: 'hidden',
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  // 🎨 डिज़ाइन सुधार: card पहले पूरी तरह सादा सफ़ेद था — एक बारीक़ सी maroon पट्टी
  // ऊपर जोड़ी ताकि यह बाकी ऐप के visual identity (banner/top bar) से जुड़ा हुआ लगे
  welcomeAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: colors.shaktiMaroon },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  welcomeAvatarImg: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border },
  welcomeAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.shaktiMaroon, alignItems: 'center', justifyContent: 'center' },
  welcomeAvatarText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  readyText: { fontSize: 11.5, color: colors.sage, fontWeight: '700' },
  welcomeText: { fontWeight: '800', color: colors.inkNavy },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  reminderText: { fontSize: 11, color: colors.marigold, fontWeight: '600' },

  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, marginHorizontal: 16, marginTop: 14, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  trackRowText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.inkNavy },

  sectionTitle: { fontWeight: '700', color: colors.inkNavy, marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginHorizontal: 16, marginTop: 20 },
  sectionCount: { fontSize: 11.5, color: colors.inkLight, fontWeight: '600' },

  helplineRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 6, alignItems: 'center' },
  helplineCard: {
    width: 220,
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  helplineIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  helplineIconEmoji: { fontSize: 19, lineHeight: 22 },
  helplineTextWrap: { flex: 1, height: '100%', justifyContent: 'center', marginLeft: 10, marginRight: 6 },
  helplineNumber: { fontWeight: '800', marginTop: 1 },
  helplineActionBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  helplineDivider: { width: 1, height: 26, backgroundColor: colors.border, marginHorizontal: 4 },
  helplineLabel: { color: colors.inkNavy, fontWeight: '700', lineHeight: 16 },

  // ---- चौड़े illustrated कार्ड (शिकायत श्रेणियां व योजनाएं) ----
  wideCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 14,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: 'hidden',
  },
  wideIconBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 },
  wideTextCol: { flex: 1, paddingRight: 6 },
  wideTitle: { fontWeight: '800', color: colors.inkNavy },
  wideDesc: { color: colors.inkGrey, marginTop: 4, lineHeight: 17 },
  wideLink: { fontSize: 12.5, fontWeight: '800', color: colors.shaktiMaroon, marginTop: 9 },
  wideArtWrap: { position: 'absolute', right: -6, bottom: -6, opacity: 0.96 },

  // ---- सहायता सेवाएं — बड़े स्वाइप कार्ड ----
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  sectionMore: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionMoreText: { fontSize: 11.5, color: colors.inkLight, fontWeight: '700' },
  svcWideCard: {
    width: 240,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 14,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    minHeight: 168,
    overflow: 'hidden',
  },
  svcTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  svcIconBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.shaktiMaroonWash, alignItems: 'center', justifyContent: 'center' },
  svcTagPill: { backgroundColor: colors.shaktiMaroonWash, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  svcTagText: { fontSize: 9, fontWeight: '800', color: colors.shaktiMaroon, letterSpacing: 0.4 },
  svcWideTitle: { fontWeight: '800', color: colors.inkNavy, marginTop: 10 },
  svcWideDesc: { color: colors.inkGrey, marginTop: 4, lineHeight: 16, maxWidth: '75%' },
  svcArtWrap: { position: 'absolute', right: -4, bottom: -2, opacity: 0.95 },
  dotsRowSmall: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 10, marginBottom: 4 },
  dotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotSmallActive: { width: 16, backgroundColor: colors.shaktiMaroon },

  svcRow: { paddingHorizontal: 16, gap: 14, paddingBottom: 6 },
  svcCard: { width: 128, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border, minHeight: 118, justifyContent: 'space-between' },
  svcEmoji: { fontSize: 24 },
  svcTitle: { fontWeight: '700', color: colors.inkNavy, marginTop: 7, lineHeight: 17 },
  svcLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  svcLink: { fontSize: 11, fontWeight: '800', color: colors.shaktiMaroon },
  nearbyBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, marginHorizontal: 16, marginTop: 14, borderRadius: radius.lg, padding: 14, shadowColor: colors.inkNavy, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  nearbyIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  nearbyTitle: { fontSize: 14, fontWeight: '700', color: colors.inkNavy },
  nearbySub: { fontSize: 11.5, color: colors.inkGrey, marginTop: 2 },

  catGrid: { paddingHorizontal: 16, gap: 12, marginTop: 4 },
  catCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, borderTopWidth: 4, shadowColor: colors.inkNavy, shadowOpacity: 0.09, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  catIconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  catTitle: { fontWeight: '700', color: colors.inkNavy },
  catDesc: { color: colors.inkGrey, marginTop: 4, lineHeight: 17 },
  catLink: { fontSize: 12.5, fontWeight: '700', marginTop: 10 },
  noResults: { textAlign: 'center', color: colors.inkLight, paddingVertical: 20 },

  schemeGrid: { paddingHorizontal: 16, marginTop: 10, gap: 12 },
  schemeCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, shadowColor: colors.inkNavy, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  schemeEmoji: { fontSize: 24 },
  schemeTag: { fontSize: 10, fontWeight: '700', color: colors.shaktiMaroon, textTransform: 'uppercase', marginTop: 6, letterSpacing: 0.5 },
  schemeTitle: { fontWeight: '700', color: colors.inkNavy, marginTop: 3 },
  schemeDesc: { color: colors.inkGrey, marginTop: 4, lineHeight: 17 },
  schemeLink: { fontSize: 12.5, fontWeight: '700', color: colors.inkNavy, marginTop: 10 },

  // ---- 02/03/04 सेक्शन — सहायता सेवाएं / कल्याणकारी योजनाएं / पुलिस सेवाएं ----
  svcListCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.white,
    borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border,
    shadowColor: colors.inkNavy, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  svcListEmoji: { fontSize: 24, marginTop: 2 },
  svcListIconBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  svcTagPillAlt: { alignSelf: 'flex-start', backgroundColor: colors.shaktiMaroonWash, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4 },
  svcTagTextAlt: { fontSize: 9.5, fontWeight: '800', color: colors.shaktiMaroon, letterSpacing: 0.3 },
  svcListTitle: { fontWeight: '700', color: colors.inkNavy },
  svcListDesc: { color: colors.inkGrey, marginTop: 3, lineHeight: 16 },
  proceedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  proceedText: { fontSize: 12, fontWeight: '800', color: colors.shaktiMaroon },
  moreServicesBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  moreServicesText: { fontSize: 12.5, fontWeight: '800', color: colors.shaktiMaroon },
  globalNoResults: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 30 },
  globalNoResultsText: { fontSize: 13, color: colors.inkGrey, textAlign: 'center', marginTop: 10, lineHeight: 19 },

  fab: { position: 'absolute', right: 18, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.alert, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { fontSize: 26 },

  skeletonHelpline: { width: 100, height: 76, borderRadius: radius.md, backgroundColor: '#EFE3E8' },
  skeletonCard: { height: 120, borderRadius: radius.lg, backgroundColor: '#EFE3E8' },

  guideOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  guideCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 26, alignItems: 'center', width: '100%' },
  guideTitle: { fontSize: 17, fontWeight: '800', color: colors.inkNavy, marginTop: 14 },
  guideDesc: { fontSize: 13, color: colors.inkGrey, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  guideDots: { flexDirection: 'row', gap: 6, marginTop: 18 },
  guideDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  guideDotActive: { backgroundColor: colors.shaktiMaroon, width: 18 },
  guideBtnRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 22, alignItems: 'center' },
  guideSkip: { color: colors.inkLight, fontSize: 13, fontWeight: '600' },
  guideNextBtn: { backgroundColor: colors.shaktiMaroon, paddingHorizontal: 22, paddingVertical: 11, borderRadius: radius.md },
  guideNextText: { color: colors.white, fontWeight: '700', fontSize: 13 },
});
