import React from 'react';
import Svg, { Circle, Path, Rect, G } from 'react-native-svg';

// कल्याणकारी योजनाओं के सामान्य कार्ड के लिए साझा चित्र (हर योजना के लिए
// अलग चित्र बनाना व्यावहारिक नहीं — सैकड़ों योजनाएं हो सकती हैं, Admin
// पैनल से नई जुड़ती रहती हैं)। सरकारी दस्तावेज़/प्रमाणपत्र का भाव।
export default function SchemeArt({ width = 100, height = 84 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 140 120">
      <Circle cx="70" cy="60" r="54" fill="#FBEAF0" />
      {/* इमारत — सरकारी भवन का संकेत */}
      <Path d="M35 95 L105 95 L105 100 L35 100 Z" fill="#D6336C" opacity={0.25} />
      <Path d="M40 60 L100 60 L100 95 L40 95 Z" fill="#D6336C" opacity={0.15} />
      <Path d="M70 35 L100 55 L40 55 Z" fill="#D6336C" opacity={0.3} />
      {/* दस्तावेज़/प्रमाणपत्र */}
      <Rect x="48" y="48" width="44" height="56" rx="4" fill="#FFFFFF" stroke="#D6336C" strokeWidth="2" />
      <Path d="M56 60 L84 60 M56 70 L84 70 M56 80 L74 80" stroke="#D6336C" strokeWidth="2.5" strokeLinecap="round" opacity={0.6} />
      {/* मुहर/सील */}
      <Circle cx="80" cy="92" r="12" fill="#E3A93B" />
      <Path d="M75 92 L79 96 L86 87" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
