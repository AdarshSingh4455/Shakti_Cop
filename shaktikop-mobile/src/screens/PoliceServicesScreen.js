import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tt } from '../context/LocaleContext';
import { colors, radius } from '../theme/colors';
import { useApp } from '../context/AppContext';

// ============================================================
// पुलिस सेवाएं — सभी लिंक उत्तर प्रदेश पुलिस / भारत सरकार के आधिकारिक पोर्टल के हैं।
//
// ⚠️ जान-बूझकर गहरे (deep) लिंक नहीं दिए गए — सरकारी पोर्टल के भीतरी पते समय-समय पर
// बदलते रहते हैं, और टूटा लिंक नागरिक को भटका देता है। इसलिए हर सेवा उसी आधिकारिक
// पोर्टल के मुख्य/लॉगिन पन्ने पर ले जाती है, जहाँ से वह सेवा मिलती है।
// ============================================================

const UPCOP_PORTAL = 'https://cctnsup.gov.in/citizen/login.aspx';
const UP_POLICE = 'https://uppolice.gov.in/';
const UP_CITIZEN_SERVICES = 'https://uppolice.gov.in/article/en/other-citizen-services';
const UPCOP_APP = 'https://play.google.com/store/apps/details?id=uttarpradesh.citizen.app';

// 🆕 यह सूची अब Super Admin ऐप से ही बदल सकते हैं (सर्वर से आती है)।
// नीचे वाली सूची सिर्फ़ fallback है — इंटरनेट न हो या सर्वर जवाब न दे, तब भी नागरिक
// को सेवाएं दिखती रहें। सरकारी हेल्पलाइन-ऐप में खाली स्क्रीन दिखाना ठीक नहीं।
const FALLBACK_SERVICE_GROUPS = [
  {
    group: 'शिकायत व FIR',
    items: [
      {
        tag: 'इसी ऐप में',
        title: 'सुरक्षा शिकायत दर्ज करें',
        desc: 'महिला सुरक्षा से जुड़ी शिकायत सीधे ShaktiCop में दर्ज करें — थाने तक तुरंत पहुँचेगी।',
        icon: 'shield-checkmark-outline',
        color: colors.shaktiMaroon,
        internal: 'NewComplaint',
      },
      {
        tag: 'इसी ऐप में',
        title: 'शिकायत ID से ट्रैक करें',
        desc: 'अपनी शिकायत की स्थिति और अधिकारी की कार्यवाही देखें।',
        icon: 'search-outline',
        color: colors.inkNavyLight,
        internal: 'TrackComplaint',
      },
      {
        tag: 'UPCOP पोर्टल',
        title: 'ई-प्राथमिकी (e-FIR) दर्ज करें',
        desc: 'चोरी व अज्ञात के विरुद्ध ऑनलाइन FIR — UP पुलिस के आधिकारिक पोर्टल पर।',
        icon: 'document-text-outline',
        color: colors.inkNavy,
        url: UPCOP_PORTAL,
      },
      {
        tag: 'UPCOP पोर्टल',
        title: 'FIR देखें / डाउनलोड करें',
        desc: 'दर्ज FIR की प्रति ऑनलाइन देखें और डाउनलोड करें।',
        icon: 'reader-outline',
        color: colors.inkNavy,
        url: UPCOP_PORTAL,
      },
      {
        tag: 'UPCOP पोर्टल',
        title: 'खोई वस्तु दर्ज करें',
        desc: 'दस्तावेज़, मोबाइल या चाबी गुम होने की रिपोर्ट दर्ज करें।',
        icon: 'help-buoy-outline',
        color: colors.marigold,
        url: UPCOP_PORTAL,
      },
      {
        tag: 'UPCOP पोर्टल',
        title: 'खोई वस्तु रिपोर्ट (LAR) डाउनलोड',
        desc: 'दर्ज की गई खोई वस्तु रिपोर्ट देखें व डाउनलोड करें।',
        icon: 'download-outline',
        color: colors.marigold,
        url: UPCOP_PORTAL,
      },
    ],
  },
  {
    group: 'विशेष शिकायतें',
    items: [
      {
        tag: 'UPCOP पोर्टल',
        title: 'वरिष्ठ नागरिक शिकायत',
        desc: 'वरिष्ठ नागरिकों के लिए विशेष शिकायत व सहायता सेवा।',
        icon: 'people-circle-outline',
        color: '#6B4E9B',
        url: UPCOP_PORTAL,
      },
      {
        tag: 'UPCOP पोर्टल',
        title: 'दिव्यांग द्वारा शिकायत',
        desc: 'दिव्यांगजनों के लिए विशेष शिकायत सेवा।',
        icon: 'accessibility-outline',
        color: '#6B4E9B',
        url: UPCOP_PORTAL,
      },
      {
        tag: 'UPCOP पोर्टल',
        title: 'सूचना साझा करें',
        desc: 'पुलिस को कोई गोपनीय सूचना या जानकारी दें।',
        icon: 'megaphone-outline',
        color: '#6B4E9B',
        url: UPCOP_PORTAL,
      },
    ],
  },
  {
    group: 'साइबर, मोबाइल व चालान',
    items: [
      {
        tag: 'राष्ट्रीय पोर्टल',
        title: 'साइबर अपराध की शिकायत (NCRP 1930)',
        desc: 'ऑनलाइन ठगी, हैकिंग या उत्पीड़न की शिकायत। वित्तीय ठगी में 1930 पर तुरंत कॉल करें।',
        icon: 'laptop-outline',
        color: '#1B4A73',
        url: 'https://cybercrime.gov.in/',
      },
      {
        tag: 'CEIR — भारत सरकार',
        title: 'खोया मोबाइल ब्लॉक करें (CEIR)',
        desc: 'चोरी/गुम हुए मोबाइल को पूरे देश में ब्लॉक करें और ढूंढें।',
        icon: 'phone-portrait-outline',
        color: '#6B4E9B',
        url: 'https://www.ceir.gov.in/',
      },
      {
        tag: 'परिवहन — भारत सरकार',
        title: 'eChallan स्थिति देखें',
        desc: 'वाहन नंबर या चालान नंबर से यातायात चालान देखें और भुगतान करें।',
        icon: 'car-outline',
        color: '#B23A2E',
        url: 'https://echallan.parivahan.gov.in/',
      },
      {
        tag: 'पासपोर्ट सेवा',
        title: 'पासपोर्ट आवेदन की स्थिति',
        desc: 'पासपोर्ट व उसके पुलिस सत्यापन की स्थिति देखें।',
        icon: 'airplane-outline',
        color: '#B26A00',
        url: 'https://www.passportindia.gov.in/',
      },
    ],
  },
  {
    group: 'सत्यापन व प्रमाणपत्र',
    items: [
      {
        tag: 'सशुल्क — ₹50',
        title: 'चरित्र प्रमाणपत्र',
        desc: 'नौकरी/पासपोर्ट हेतु पुलिस चरित्र प्रमाणपत्र के लिए आवेदन।',
        icon: 'ribbon-outline',
        color: colors.sage,
        url: UPCOP_PORTAL,
      },
      {
        tag: 'सशुल्क — ₹50',
        title: 'घरेलू सहायक सत्यापन',
        desc: 'घर में काम करने वाले सहायक का पुलिस सत्यापन कराएं।',
        icon: 'home-outline',
        color: colors.sage,
        url: UPCOP_PORTAL,
      },
      {
        tag: 'सशुल्क — ₹50',
        title: 'कर्मचारी सत्यापन',
        desc: 'अपने कर्मचारी का पुलिस सत्यापन ऑनलाइन कराएं।',
        icon: 'id-card-outline',
        color: colors.sage,
        url: UPCOP_PORTAL,
      },
      {
        tag: 'सशुल्क — ₹50',
        title: 'किरायेदार सत्यापन',
        desc: 'अपने किरायेदार का पुलिस सत्यापन ऑनलाइन कराएं।',
        icon: 'business-outline',
        color: colors.sage,
        url: UPCOP_PORTAL,
      },
    ],
  },
  {
    group: 'अन्य सेवाएं',
    items: [
      {
        tag: 'UP पुलिस',
        title: 'सभी नागरिक सेवाएं',
        desc: 'वाहन NOC, जुलूस/कार्यक्रम अनुमति, सड़क दुर्घटना, पोस्टमार्टम रिपोर्ट आदि।',
        icon: 'grid-outline',
        color: colors.inkNavy,
        url: UP_CITIZEN_SERVICES,
      },
      {
        tag: 'आधिकारिक ऐप',
        title: 'UPCOP ऐप डाउनलोड करें',
        desc: 'UP पुलिस का आधिकारिक नागरिक ऐप — 20+ सेवाएं एक जगह।',
        icon: 'download-outline',
        color: colors.shaktiMaroon,
        url: UPCOP_APP,
      },
      {
        tag: 'UP पुलिस',
        title: 'uppolice.gov.in',
        desc: 'उत्तर प्रदेश पुलिस की आधिकारिक वेबसाइट।',
        icon: 'globe-outline',
        color: colors.inkNavyLight,
        url: UP_POLICE,
      },
    ],
  },
];


// 🐛 सर्वर रंग को नाम (colorKey) के रूप में भेजता है, जैसे 'shaktiMaroon' — जबकि यह
// स्क्रीन सीधे item.color (असली रंग-कोड) इस्तेमाल करती है। बिना बदले server वाली
// सूची पर item.color undefined रहता, और "undefined1A" जैसी बेमानी value से आइकन व
// रंग टूट जाते। इसलिए यहाँ नाम को असली रंग में बदल देते हैं।
//
// अनजान/खाली नाम पर डिफ़ॉल्ट रंग — ताकि एडमिन का कोई टाइपो पूरी स्क्रीन न बिगाड़े।
function resolveColor(colorKey) {
  return (colorKey && colors[colorKey]) || colors.inkNavy;
}

function normalizeGroups(list) {
  return list.map((g) => ({
    group: g.group,
    items: (g.items || []).map((it) => ({ ...it, color: resolveColor(it.colorKey) })),
  }));
}

export default function PoliceServicesScreen({ navigation }) {
  const { role, fetchPoliceServices } = useApp();
  const [openGroup, setOpenGroup] = useState(0);
  const [groups, setGroups] = useState(FALLBACK_SERVICE_GROUPS);

  useEffect(() => {
    let cancelled = false;
    fetchPoliceServices()
      .then((list) => {
        // सर्वर से खाली सूची आए तो fallback ही रहने दें — वरना स्क्रीन खाली दिखती
        if (!cancelled && Array.isArray(list) && list.length > 0) setGroups(normalizeGroups(list));
      })
      .catch(() => {
        // चुपचाप fallback पर रहें — नागरिक को सेवाएं दिखती रहनी चाहिए
      });
    return () => { cancelled = true; };
  }, [fetchPoliceServices]);

  const openService = (item) => {
    if (item.internal) {
      // ऐप के अंदर की सेवाएं — शिकायत दर्ज करने के लिए खाता ज़रूरी है
      if (!role && item.internal === 'NewComplaint') {
        return Alert.alert(
          tt('लॉगिन आवश्यक है'),
          tt('शिकायत दर्ज करने के लिए पहले नागरिक खाते से लॉगिन करें।'),
          [
            { text: tt('रद्द करें'), style: 'cancel' },
            { text: tt('लॉगिन करें'), onPress: () => navigation.navigate('Login') },
          ]
        );
      }
      navigation.navigate(item.internal);
      return;
    }
    Linking.openURL(item.url).catch(() =>
      Alert.alert(tt('त्रुटि'), tt('पेज नहीं खुल सका।'))
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
      <View style={styles.headCard}>
        <Ionicons name="shield-half" size={22} color={colors.white} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headTitle}>{tt('पुलिस सेवाएं')}</Text>
          <Text style={styles.headSub}>{tt('उत्तर प्रदेश पुलिस की आधिकारिक ऑनलाइन सेवाएं')}</Text>
        </View>
      </View>

      <View style={styles.noticeBox}>
        <Ionicons name="information-circle-outline" size={15} color={colors.inkNavy} />
        <Text style={styles.noticeText}>
          {tt('बाहरी सेवाएं सरकार के आधिकारिक पोर्टल पर खुलती हैं। किसी भी वेबसाइट पर अपना OTP या पासवर्ड साझा न करें।')}
        </Text>
      </View>

      {groups.map((g, gi) => (
        <View key={g.group} style={styles.groupWrap}>
          <TouchableOpacity
            style={styles.groupHead}
            onPress={() => setOpenGroup(openGroup === gi ? -1 : gi)}
            activeOpacity={0.8}
          >
            <Text style={styles.groupTitle}>{tt(g.group)}</Text>
            <View style={styles.groupCount}>
              <Text style={styles.groupCountText}>{g.items.length}</Text>
            </View>
            <Ionicons name={openGroup === gi ? 'chevron-up' : 'chevron-down'} size={17} color={colors.inkGrey} />
          </TouchableOpacity>

          {openGroup === gi &&
            g.items.map((item) => (
              <TouchableOpacity
                key={item.title}
                style={styles.card}
                onPress={() => openService(item)}
                activeOpacity={0.85}
              >
                <View style={[styles.iconBox, { backgroundColor: item.color + '1A' }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={[styles.tagPill, { backgroundColor: item.color + '18' }]}>
                    <Text style={[styles.tagText, { color: item.color }]}>{tt(item.tag)}</Text>
                  </View>
                  <Text style={styles.cardTitle}>{tt(item.title)}</Text>
                  <Text style={styles.cardDesc}>{tt(item.desc)}</Text>
                  <View style={styles.proceedRow}>
                    <Text style={[styles.proceedText, { color: item.color }]}>
                      {item.internal ? tt('खोलें') : tt('पोर्टल खोलें')}
                    </Text>
                    <Ionicons
                      name={item.internal ? 'arrow-forward' : 'open-outline'}
                      size={13}
                      color={item.color}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.inkNavy, borderRadius: radius.lg, padding: 15, marginBottom: 12 },
  headTitle: { fontSize: 16, fontWeight: '800', color: colors.white },
  headSub: { fontSize: 11.5, color: '#C9D6E4', marginTop: 2 },
  noticeBox: { flexDirection: 'row', gap: 7, backgroundColor: '#FFF8E6', borderRadius: radius.md, padding: 10, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: colors.marigold },
  noticeText: { flex: 1, fontSize: 11, color: colors.inkGrey, lineHeight: 16 },
  groupWrap: { marginBottom: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  groupTitle: { flex: 1, fontSize: 13.5, fontWeight: '800', color: colors.inkNavy },
  groupCount: { backgroundColor: colors.shaktiMaroonWash, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  groupCountText: { fontSize: 11, fontWeight: '800', color: colors.shaktiMaroon },
  card: { flexDirection: 'row', gap: 11, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, marginTop: 8, marginLeft: 8, borderWidth: 1, borderColor: colors.border },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tagPill: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4 },
  tagText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  cardTitle: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  cardDesc: { fontSize: 11.5, color: colors.inkGrey, lineHeight: 16, marginTop: 3 },
  proceedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  proceedText: { fontSize: 12, fontWeight: '800' },
});
