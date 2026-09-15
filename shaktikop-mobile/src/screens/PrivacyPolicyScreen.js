import React from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';

// ============================================================
// गोपनीयता नीति (Privacy Policy) — Digital Personal Data Protection Act, 2023
// (DPDP Act 2023) के अंतर्गत सरकारी ऐप के लिए कानूनी रूप से अनिवार्य दस्तावेज़।
//
// ⚠️ यह पेज जानबूझकर static (कोड में लिखा) रखा गया है, admin-editable नहीं —
// चूंकि यह एक कानूनी दस्तावेज़ है, इसमें बदलाव सिर्फ़ विभागीय/कानूनी समीक्षा के
// बाद ऐप अपडेट के ज़रिए होना चाहिए, किसी भी एडमिन के free-text संपादन से नहीं।
//
// नोट: यह टेम्पलेट है — तैनाती से पहले नीचे दिए गए [ ] वाले प्लेसहोल्डर
// (डेटा संरक्षण अधिकारी का नाम/ईमेल, विभाग का पता आदि) असली जानकारी से भरें,
// और विभागीय विधि प्रकोष्ठ (Legal Cell) से एक बार समीक्षा ज़रूर कराएं।
// ============================================================

const EFFECTIVE_DATE = '31 जुलाई 2026';
const GRIEVANCE_EMAIL = 'grievance@shaktikop.up.gov.in'; // [प्लेसहोल्डर — असली ईमेल से बदलें]
const GRIEVANCE_PHONE = '1090'; // UP महिला हेल्पलाइन नंबर — डेटा-सुरक्षा शिकायत हेतु भी संपर्क बिंदु के तौर पर

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingBottom: 50 }}>
      <View style={styles.headerBox}>
        <Ionicons name="shield-checkmark" size={28} color={colors.shaktiMaroon} />
        <Text style={styles.h1}>{tt('गोपनीयता नीति')}</Text>
        <Text style={styles.effectiveDate}>{tt('प्रभावी तिथि')}: {EFFECTIVE_DATE}</Text>
      </View>

      <Text style={styles.intro}>
        {tt(
          'ShaktiCop (मिशन शक्ति डिजिटल शिकायत प्रणाली) उत्तर प्रदेश पुलिस की एक आधिकारिक पहल है। ' +
          'यह नीति बताती है कि हम आपकी व्यक्तिगत जानकारी क्यों, कैसे और कब तक इकट्ठा, इस्तेमाल व सुरक्षित करते हैं — ' +
          'Digital Personal Data Protection Act, 2023 (DPDP अधिनियम) के अनुसार। ऐप इस्तेमाल करके आप इस नीति से सहमत होते हैं।'
        )}
      </Text>

      <Section num="1" title="हम कौन-सी जानकारी इकट्ठा करते हैं">
        <Bullet text={tt('पहचान: नाम, पिता/पति का नाम, मोबाइल नंबर, पता, प्रोफ़ाइल फ़ोटो (वैकल्पिक)')} />
        <Bullet text={tt('शिकायत विवरण: घटना का विवरण, फ़ोटो/आवाज़ रिकॉर्डिंग (यदि संलग्न करें), घटनास्थल')} />
        <Bullet text={tt('लोकेशन: शिकायत दर्ज करते समय की GPS लोकेशन, और आपकी सहमति से चालू की गई लाइव लोकेशन (सुरक्षित यात्रा मोड / SOS में)')} />
        <Bullet text={tt('तकनीकी: डिवाइस से जुड़ी सामान्य जानकारी, पुश-नोटिफ़िकेशन टोकन (सूचनाएं भेजने हेतु)')} />
        <Bullet text={tt('आपातकालीन संपर्क: यदि आप जोड़ें — सुरक्षा उद्देश्य से')} />
      </Section>

      <Section num="2" title="हम इस जानकारी का इस्तेमाल क्यों करते हैं">
        <Bullet text={tt('आपकी शिकायत दर्ज करने, संबंधित थाने तक पहुंचाने और उस पर कार्यवाही करने के लिए')} />
        <Bullet text={tt('आपात स्थिति (SOS) में आपकी लोकेशन तुरंत नज़दीकी पुलिस बल तक पहुंचाने के लिए — जीवन-रक्षा हेतु')} />
        <Bullet text={tt('शिकायत की स्थिति की सूचना देने और आपसे संपर्क करने के लिए')} />
        <Bullet text={tt('धोखाधड़ी, फ़र्ज़ी या दोहराई गई शिकायतों की पहचान करने के लिए')} />
        <Bullet text={tt('विभागीय आंकड़े व रिपोर्टिंग के लिए — व्यक्तिगत पहचान हटाकर (anonymised रूप में)')} />
      </Section>

      <Section num="3" title="सहमति (Consent)">
        <Text style={styles.para}>
          {tt(
            'खाता बनाते समय, और लाइव लोकेशन/फ़ोटो/आवाज़ जैसी संवेदनशील जानकारी हर बार जोड़ते समय, ऐप स्पष्ट रूप से आपकी ' +
            'सहमति मांगता है। लाइव लोकेशन शेयरिंग आप कभी भी बंद कर सकते हैं — यह अनिवार्य नहीं, आपकी इच्छा पर निर्भर है। ' +
            'नाबालिग़ों (18 वर्ष से कम आयु) की ओर से शिकायत दर्ज करते समय माता-पिता/अभिभावक की जानकारी अपेक्षित है।'
          )}
        </Text>
      </Section>

      <Section num="4" title="जानकारी किसके साथ साझा की जाती है">
        <Bullet text={tt('संबंधित थाने के जांच अधिकारी (SI/SHO) और ज़िम्मेदार वरिष्ठ अधिकारी (DSP/ASP/SSP) — सिर्फ़ मामले की जांच हेतु')} />
        <Bullet text={tt('कोई भी जानकारी किसी निजी कंपनी, विज्ञापनदाता या तीसरे पक्ष को व्यावसायिक उद्देश्य से कभी नहीं बेची या साझा नहीं की जाती')} />
        <Bullet text={tt('कानूनी आवश्यकता होने पर (जैसे न्यायालय का आदेश) सक्षम प्राधिकारी को दी जा सकती है')} />
        <Bullet text={tt('गुमनाम (anonymous) शिकायत के विकल्प में आपका नाम/मोबाइल/पता जांच अधिकारी को भी नहीं दिखता')} />
      </Section>

      <Section num="5" title="डेटा सुरक्षा">
        <Bullet text={tt('पासवर्ड सुरक्षित (hashed) रूप में संग्रहीत होते हैं — कोई कर्मचारी भी उन्हें पढ़ नहीं सकता')} />
        <Bullet text={tt('सभी डेटा एन्क्रिप्टेड कनेक्शन (HTTPS) से भेजा जाता है')} />
        <Bullet text={tt('एक्सेस भूमिका-आधारित (role-based) है — जो अधिकारी मामले से नहीं जुड़ा, वह विवरण नहीं देख सकता')} />
        <Bullet text={tt('हर संवेदनशील कार्रवाई (किसने कब क्या देखा/बदला) का ऑडिट लॉग रखा जाता है')} />
      </Section>

      <Section num="6" title="डेटा कितने समय तक रखा जाता है">
        <Text style={styles.para}>
          {tt(
            'शिकायत व उससे जुड़ा रिकॉर्ड विभागीय रिकॉर्ड-प्रतिधारण नियमों और लागू कानून के अनुसार तय अवधि तक सुरक्षित रखा जाता है — ' +
            'चूंकि यह पुलिस जांच व कानूनी कार्यवाही का आधिकारिक अभिलेख बन सकता है। खाता निष्क्रिय करने पर भी दर्ज शिकायतों का रिकॉर्ड ' +
            'विभागीय आवश्यकता अनुसार सुरक्षित रह सकता है।'
          )}
        </Text>
      </Section>

      <Section num="7" title="आपके अधिकार (DPDP अधिनियम के अंतर्गत)">
        <Bullet text={tt('अपनी जानकारी देखने और उसकी एक प्रति मांगने का अधिकार')} />
        <Bullet text={tt('ग़लत/अधूरी जानकारी को सुधरवाने का अधिकार (प्रोफ़ाइल स्क्रीन से खुद भी बदल सकते हैं)')} />
        <Bullet text={tt('सहमति वापस लेने का अधिकार (जैसे लाइव लोकेशन शेयरिंग बंद करना)')} />
        <Bullet text={tt('शिकायत निवारण अधिकारी से संपर्क करने का अधिकार (नीचे विवरण)')} />
        <Text style={styles.paraSmall}>
          {tt('ध्यान दें: दर्ज की जा चुकी शिकायत का पुलिस-रिकॉर्ड, कानूनी जांच पूरी होने से पहले हटाया नहीं जा सकता — यह कानून-व्यवस्था बनाए रखने के लिए आवश्यक है।')}
        </Text>
      </Section>

      <Section num="8" title="डेटा संरक्षण अधिकारी / शिकायत निवारण">
        <Text style={styles.para}>
          {tt('अपनी जानकारी, इस नीति, या डेटा-सुरक्षा से जुड़ी किसी भी शिकायत के लिए संपर्क करें:')}
        </Text>
        <TouchableOpacity onPress={() => Linking.openURL(`mailto:${GRIEVANCE_EMAIL}`)} style={styles.contactRow}>
          <Ionicons name="mail-outline" size={16} color={colors.shaktiMaroon} />
          <Text style={styles.contactText}>{GRIEVANCE_EMAIL}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(`tel:${GRIEVANCE_PHONE}`)} style={styles.contactRow}>
          <Ionicons name="call-outline" size={16} color={colors.shaktiMaroon} />
          <Text style={styles.contactText}>{GRIEVANCE_PHONE} ({tt('महिला हेल्पलाइन')})</Text>
        </TouchableOpacity>
      </Section>

      <Section num="9" title="नीति में बदलाव">
        <Text style={styles.para}>
          {tt('इस नीति को समय-समय पर अपडेट किया जा सकता है। किसी बड़े बदलाव की सूचना ऐप के अंदर या Home स्क्रीन के "नया क्या है" सेक्शन में दी जाएगी।')}
        </Text>
      </Section>

      <Text style={styles.footer}>
        {tt('ShaktiCop — उत्तर प्रदेश पुलिस, मिशन शक्ति। यह एक आधिकारिक सरकारी सेवा है।')}
      </Text>
    </ScrollView>
  );
}

function Section({ num, title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{num}. {tt(title)}</Text>
      {children}
    </View>
  );
}

function Bullet({ text }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  headerBox: { alignItems: 'center', marginBottom: 16, paddingVertical: 10 },
  h1: { fontSize: 19, fontWeight: '800', color: colors.inkNavy, marginTop: 8 },
  effectiveDate: { fontSize: 11.5, color: colors.inkLight, marginTop: 4 },
  intro: { fontSize: 13, color: colors.inkGrey, lineHeight: 20, marginBottom: 18, backgroundColor: colors.white, padding: 14, borderRadius: radius.md },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 14.5, fontWeight: '800', color: colors.shaktiMaroon, marginBottom: 8 },
  para: { fontSize: 12.5, color: colors.inkGrey, lineHeight: 19 },
  paraSmall: { fontSize: 11, color: colors.inkLight, lineHeight: 17, marginTop: 8, fontStyle: 'italic' },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 7, paddingRight: 6 },
  bulletDot: { fontSize: 13, color: colors.shaktiMaroon, fontWeight: '800' },
  bulletText: { flex: 1, fontSize: 12.5, color: colors.inkGrey, lineHeight: 19 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  contactText: { fontSize: 13, color: colors.shaktiMaroon, fontWeight: '700' },
  footer: { fontSize: 10.5, color: colors.inkLight, textAlign: 'center', marginTop: 20 },
});
