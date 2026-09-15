import React, { useEffect, useRef, useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import PoliceLogoIcon from './PoliceLogoIcon';

// ============================================================
// ऐप शुरू होने का लोडर।
//
// ⚠️ यह theme लगने से पहले चलता है, इसलिए यहाँ theme/colors से रंग नहीं लिए
// गए — सीधे मान लिखे हैं। वरना ऐप शुरू होते ही रंग आधे-अधूरे दिखते।
//
// खाली सफ़ेद स्क्रीन पर लोगों को लगता है कि ऐप अटक गया। इसलिए यहाँ धड़कता
// लोगो, बढ़ती पट्टी और बदलते संदेश हैं — इससे यह भरोसा बना रहता है कि काम
// चल रहा है, और प्रतीक्षा छोटी लगती है।
// ============================================================

const PINK = '#D6336C';
const SAND = '#FDF3F6';
const NAVY = '#0F2A44';
const GREY = '#8A8578';

export default function SplashLoader({ message }) {
  // 🐛 बग फ़िक्स (कम-असर, पर संगति के लिए): पहले यह module-level थी — अब
  // component के अंदर, ताकि भाषा-चयन के अनुसार सही संदेश दिखें।
  const MESSAGES = [
    tt('सुरक्षा सेवाएं तैयार हो रही हैं…'),
    tt('आपकी भाषा व सेटिंग्स लोड हो रही हैं…'),
    tt('हेल्पलाइन व थाना सूची जुड़ रही है…'),
    tt('लगभग तैयार…'),
  ];
  const pulse = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.8)).current;
  const ringFade = useRef(new Animated.Value(0.5)).current;
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    // पूरा दृश्य धीरे से उभरे
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();

    // लोगो की हल्की धड़कन
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();

    // लोगो के चारों ओर फैलती लहर
    Animated.loop(
      Animated.parallel([
        Animated.timing(ringScale, { toValue: 1.6, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(ringFade, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();

    // नीचे बढ़ती पट्टी — आगे-पीछे चलती रहती है
    Animated.loop(
      Animated.sequence([
        Animated.timing(bar, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bar, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();

    // संदेश बदलते रहें — इससे लगता है कि काम आगे बढ़ रहा है
    const timer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 1600);
    return () => clearInterval(timer);
  }, []);

  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const barX = bar.interpolate({ inputRange: [0, 1], outputRange: [-70, 70] });

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      <View style={styles.logoWrap}>
        {/* फैलती लहर */}
        <Animated.View
          style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringFade }]}
          pointerEvents="none"
        />
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <PoliceLogoIcon size={82} />
        </Animated.View>
      </View>

      <Text style={styles.brand}>ShaktiCop</Text>
      <Text style={styles.tagline}>{tt('उत्तर प्रदेश पुलिस · मिशन शक्ति')}</Text>

      {/* बढ़ती पट्टी */}
      <View style={styles.track}>
        <Animated.View style={[styles.bar, { transform: [{ translateX: barX }] }]} />
      </View>

      <Text style={styles.message}>{message || MESSAGES[msgIndex]}</Text>

      <Text style={styles.footer}>{tt('आपकी सुरक्षा · आपके अधिकार · आपकी शक्ति')}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SAND, padding: 30 },
  logoWrap: { alignItems: 'center', justifyContent: 'center', width: 130, height: 130 },
  ring: { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: PINK },
  brand: { fontSize: 26, fontWeight: '800', color: PINK, marginTop: 14, letterSpacing: 0.4 },
  tagline: { fontSize: 12, color: NAVY, marginTop: 4, fontWeight: '600' },
  track: { width: 160, height: 4, borderRadius: 2, backgroundColor: '#F0DCE4', overflow: 'hidden', marginTop: 26 },
  bar: { width: 60, height: 4, borderRadius: 2, backgroundColor: PINK },
  message: { fontSize: 12.5, color: GREY, marginTop: 16, textAlign: 'center', minHeight: 34, lineHeight: 17 },
  footer: { position: 'absolute', bottom: 30, fontSize: 10.5, color: GREY, letterSpacing: 0.3 },
});
