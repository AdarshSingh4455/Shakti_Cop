import React from 'react';
import { Image } from 'react-native';

// ✅ असली UP पुलिस का आधिकारिक चिह्न (crest) — assets/up-police-logo.png
// पुराने ringColor/bgColor/starColor props अब इस्तेमाल नहीं होते, पर पुराने कोड को
// तोड़े बिना चलने देने के लिए पैरामीटर के तौर पर स्वीकार किए जाते हैं (चुपचाप अनदेखा)।
export default function PoliceLogoIcon({ size = 56 }) {
  return (
    <Image
      source={require('../../assets/up-police-logo.png')}
      style={{ width: size, height: size * (415 / 373), resizeMode: 'contain' }}
    />
  );
}
