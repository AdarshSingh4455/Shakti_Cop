import React from 'react';
import Svg, { Circle, Path, Rect, G, Defs, LinearGradient, Stop, Ellipse } from 'react-native-svg';

// ============================================================
// Home कार्ड के लिए flat-style चित्र — बिना किसी बाहरी image file के।
//
// ⚠️ ये असली photo/AI illustrations नहीं हैं — मेरे पास तस्वीरें बनाने का
// कोई tool नहीं है। ये react-native-svg से हाथ से बनाए गए vector shapes हैं,
// जो सरकारी/बड़े ऐप्स में आम "flat illustration" शैली जैसे दिखते हैं। फ़ायदा —
// कोई image file नहीं (APK का आकार नहीं बढ़ता), हर screen size पर तेज़/धुंधला
// नहीं होता, और रंग theme से मेल खाते हैं।
//
// हर illustration एक सामान्य महिला-आकृति (सिर+बाल+शरीर) पर आधारित है, बिना
// चेहरे के विवरण के — ताकि किसी असली व्यक्ति जैसा न लगे और हर पृष्ठभूमि/रंग
// पर अच्छा दिखे।
// ============================================================

// साझा महिला-आकृति — बाल, सिर, शरीर की बुनियादी रूपरेखा
function WomanFigure({ x = 0, y = 0, scale = 1, skin = '#F2C6A5', hair = '#3A2A22', shirt = '#7A1836' }) {
  return (
    <G translate={`${x}, ${y}`} scale={scale}>
      {/* बाल — पीछे की परत */}
      <Path
        d="M50 20 C 30 20, 22 45, 28 75 C 30 85, 34 92, 34 92 L 20 130 L 34 128 C 34 128, 30 100, 34 85 C 36 95, 40 100, 40 100 L 44 60 C 44 60, 70 60, 70 40 C 70 26, 62 20, 50 20 Z"
        fill={hair}
      />
      {/* शरीर */}
      <Path d="M32 92 C 32 78, 40 68, 52 68 C 64 68, 72 78, 72 92 L 76 145 L 28 145 Z" fill={shirt} />
      {/* गर्दन */}
      <Rect x="44" y="58" width="16" height="16" rx="6" fill={skin} />
      {/* सिर */}
      <Circle cx="52" cy="46" r="24" fill={skin} />
      {/* बाल — आगे की परत */}
      <Path
        d="M28 42 C 26 24, 40 12, 54 14 C 70 16, 78 30, 74 46 C 72 38, 66 34, 60 34 C 60 40, 56 44, 50 44 C 50 38, 46 34, 40 36 C 34 38, 30 42, 28 42 Z"
        fill={hair}
      />
    </G>
  );
}

// ---------- 1. घरेलू हिंसा — खुद को गले लगाए महिला, पीछे परछाई ----------
export function DomesticViolenceArt({ width = 160, height = 130 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 170">
      <Circle cx="110" cy="90" r="78" fill="#FBEAF0" />
      {/* पीछे धुंधली परछाई — ख़तरे का संकेत, बिना डरावना दिखाए */}
      <G opacity={0.18}>
        <Circle cx="170" cy="55" r="20" fill="#7A1836" />
        <Path d="M148 90 C148 75, 158 65, 172 65 C186 65, 196 75, 196 90 L200 140 L142 140 Z" fill="#7A1836" />
      </G>
      {/* सुरक्षा-कवच */}
      <Path d="M158 118 L158 100 Q158 92 170 88 Q182 92 182 100 L182 118 Q182 132 170 140 Q158 132 158 118 Z" fill="#F4A6BE" opacity={0.6} />
      <Path d="M164 112 L169 118 L178 104" stroke="#7A1836" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.7} />
      {/* मुख्य महिला — खुद को गले लगाते हुए */}
      <G translate="20, 10">
        <Path
          d="M46 18 C 26 18, 18 43, 24 73 C 26 83, 30 90, 30 90 L 16 128 L 30 126 C 30 126, 26 98, 30 83 C 32 93, 36 98, 36 98 L 40 58 C 40 58, 66 58, 66 38 C 66 24, 58 18, 46 18 Z"
          fill="#3A2A22"
        />
        <Path d="M28 90 C 28 76, 36 66, 48 66 C 60 66, 68 76, 68 90 L 72 143 L 24 143 Z" fill="#7A1836" />
        <Rect x="40" y="56" width="16" height="16" rx="6" fill="#F2C6A5" />
        <Circle cx="48" cy="44" r="24" fill="#F2C6A5" />
        <Path
          d="M24 40 C 22 22, 36 10, 50 12 C 66 14, 74 28, 70 44 C 68 36, 62 32, 56 32 C 56 38, 52 42, 46 42 C 46 36, 42 32, 36 34 C 30 36, 26 40, 24 40 Z"
          fill="#3A2A22"
        />
        {/* बाहें — खुद को गले लगाते हुए (सांत्वना, सुरक्षा का भाव) */}
        <Path d="M30 95 Q46 108 62 95" stroke="#5E1329" strokeWidth="9" strokeLinecap="round" fill="none" />
        <Path d="M34 100 Q46 90 58 100" stroke="#F2C6A5" strokeWidth="6" strokeLinecap="round" fill="none" opacity={0.9} />
      </G>
    </Svg>
  );
}

// ---------- 2. सुरक्षित यात्रा — फ़ोन में नक्शा-पिन + ढाल ----------
export function SafeTravelArt({ width = 160, height = 130 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 170">
      <Circle cx="110" cy="90" r="78" fill="#E4F0EA" />
      {/* फ़ोन */}
      <Rect x="70" y="35" width="70" height="120" rx="14" fill="#0F2A44" />
      <Rect x="77" y="46" width="56" height="90" rx="4" fill="#E9F3EE" />
      {/* नक्शे की रेखाएं */}
      <Path d="M80 70 L133 70 M80 90 L133 90 M80 110 L133 110" stroke="#CFE3D9" strokeWidth="3" />
      {/* स्थान-पिन */}
      <Path d="M105 78 C 96 78 90 85 90 94 C 90 106 105 122 105 122 C 105 122 120 106 120 94 C 120 85 114 78 105 78 Z" fill="#2E7D5B" />
      <Circle cx="105" cy="93" r="6" fill="#E9F3EE" />
      {/* नीचे शील्ड — सुरक्षा की पुष्टि */}
      <Path d="M155 105 L155 128 Q155 145 175 155 Q195 145 195 128 L195 105 Q175 96 155 105 Z" fill="#2E7D5B" />
      <Path d="M165 128 L172 136 L188 116" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* सड़क/गति की रेखाएं — यात्रा का भाव */}
      <Path d="M20 130 L48 130 M14 145 L40 145" stroke="#8FBFA8" strokeWidth="4" strokeLinecap="round" opacity={0.6} />
    </Svg>
  );
}

// ---------- 3. वॉइस शिकायत — माइक्रोफ़ोन + ध्वनि-तरंगें ----------
export function VoiceComplaintArt({ width = 160, height = 130 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 170">
      <Circle cx="110" cy="90" r="78" fill="#FCF1DE" />
      {/* बाहरी तरंग वलय */}
      <Circle cx="110" cy="85" r="62" stroke="#E3A93B" strokeWidth="2" fill="none" opacity={0.35} />
      <Circle cx="110" cy="85" r="46" stroke="#E3A93B" strokeWidth="2" fill="none" opacity={0.5} />
      {/* माइक्रोफ़ोन बॉडी */}
      <Rect x="92" y="45" width="36" height="58" rx="18" fill="#B26A00" />
      <Rect x="98" y="51" width="24" height="46" rx="12" fill="#E3A93B" />
      {/* माइक स्टैंड */}
      <Path d="M78 92 Q78 118 110 118 Q142 118 142 92" stroke="#B26A00" strokeWidth="6" strokeLinecap="round" fill="none" />
      <Rect x="106" y="118" width="8" height="24" rx="4" fill="#B26A00" />
      <Rect x="88" y="140" width="44" height="8" rx="4" fill="#B26A00" />
      {/* ध्वनि-तरंगें — दोनों ओर */}
      <Path d="M55 70 L55 100 M45 78 L45 92 M35 84 L35 86" stroke="#E3A93B" strokeWidth="5" strokeLinecap="round" />
      <Path d="M165 70 L165 100 M175 78 L175 92 M185 84 L185 86" stroke="#E3A93B" strokeWidth="5" strokeLinecap="round" />
    </Svg>
  );
}

// ---------- 4. काउंसलिंग — दो महिलाएं आमने-सामने बात करते हुए ----------
export function CounsellingArt({ width = 160, height = 130 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 170">
      <Circle cx="110" cy="95" r="78" fill="#FBEAF0" />
      {/* कुर्सियां */}
      <Rect x="42" y="128" width="40" height="8" rx="4" fill="#E8C4D2" />
      <Rect x="140" y="128" width="40" height="8" rx="4" fill="#F4D9E2" />
      {/* बात-चीत का बुलबुला */}
      <Path d="M96 40 Q96 26 112 26 L128 26 Q144 26 144 40 Q144 54 128 54 L120 54 L110 64 L112 54 L112 54 Q96 54 96 40 Z" fill="#F4A6BE" opacity={0.85} />
      <Circle cx="112" cy="40" r="3" fill="#7A1836" />
      <Circle cx="120" cy="40" r="3" fill="#7A1836" />
      <Circle cx="128" cy="40" r="3" fill="#7A1836" />
      {/* महिला 1 — बाईं ओर, गहरा रंग (काउंसलर) */}
      <G translate="20, 60">
        <Path d="M18 20 C 6 20, 0 36, 4 55 C 6 62, 8 66, 8 66 L 28 66 C 28 66, 30 62, 32 55 C 36 36, 30 20, 18 20 Z" fill="#3A2A22" />
        <Path d="M4 66 C 4 56, 10 50, 20 50 C 30 50, 36 56, 36 66 L 40 105 L 0 105 Z" fill="#7A1836" />
        <Circle cx="20" cy="42" r="18" fill="#E8B48C" />
        <Path d="M2 40 C 0 26, 12 16, 22 18 C 34 20, 40 30, 36 42 C 34 36, 28 33, 24 33 C 24 38, 20 41, 16 41 C 16 36, 12 33, 8 34 C 4 36, 2 40, 2 40 Z" fill="#3A2A22" />
      </G>
      {/* महिला 2 — दाईं ओर (नागरिक) */}
      <G translate="130, 62">
        <Path d="M18 20 C 32 20, 38 36, 34 55 C 32 62, 30 66, 30 66 L 8 66 C 8 66, 6 62, 4 55 C 0 36, 6 20, 18 20 Z" fill="#5C3D2E" />
        <Path d="M4 66 C 4 56, 10 50, 20 50 C 30 50, 36 56, 36 66 L 40 103 L 0 103 Z" fill="#D6336C" />
        <Circle cx="20" cy="42" r="18" fill="#F2C6A5" />
        <Path d="M0 40 C 2 24, 16 14, 26 18 C 38 22, 42 32, 38 44 C 36 36, 30 34, 26 34 C 28 40, 24 42, 20 42 C 20 36, 16 33, 10 35 C 4 37, 0 40, 0 40 Z" fill="#5C3D2E" />
      </G>
    </Svg>
  );
}

// ---------- 5. कानूनी सहायता — न्याय की तराज़ू + हथौड़ा + किताबें ----------
export function LegalAidArt({ width = 160, height = 130 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 170">
      <Circle cx="110" cy="90" r="78" fill="#FBEAF0" />
      {/* किताबें */}
      <Rect x="55" y="128" width="110" height="14" rx="3" fill="#0F2A44" />
      <Rect x="62" y="116" width="96" height="14" rx="3" fill="#1B4A73" />
      {/* तराज़ू का खम्भा */}
      <Rect x="106" y="55" width="8" height="62" fill="#7A1836" />
      <Path d="M70 118 L150 118" stroke="#7A1836" strokeWidth="4" />
      {/* क्षैतिज पट्टी */}
      <Path d="M60 65 L160 65" stroke="#7A1836" strokeWidth="4" />
      <Circle cx="110" cy="65" r="7" fill="#7A1836" />
      {/* दो पलड़े */}
      <Path d="M40 65 L60 65 L52 90 Q46 98 32 90 Z" fill="none" stroke="#D6336C" strokeWidth="3.5" />
      <Path d="M160 65 L180 65 L188 90 Q182 98 168 90 Z" fill="none" stroke="#D6336C" strokeWidth="3.5" />
      <Path d="M40 65 L32 90" stroke="#D6336C" strokeWidth="3" />
      <Path d="M180 65 L188 90" stroke="#D6336C" strokeWidth="3" />
      {/* ऊपर हथौड़ा (gavel) */}
      <G translate="130, 15" rotate="35">
        <Rect x="0" y="10" width="30" height="14" rx="4" fill="#5C3D2E" />
        <Rect x="12" y="0" width="6" height="34" rx="3" fill="#8B5E3C" />
      </G>
    </Svg>
  );
}

// ---------- 6. जन शिक्षण / कौशल — लैपटॉप पर सीखती महिला ----------
export function TrainingArt({ width = 160, height = 130 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 170">
      <Circle cx="110" cy="90" r="78" fill="#FBEFDD" />
      {/* मेज़ */}
      <Rect x="30" y="128" width="160" height="10" rx="3" fill="#D9A05B" />
      {/* लैपटॉप */}
      <Path d="M70 100 L70 122 L150 122 L150 100 Z" fill="#0F2A44" />
      <Path d="M74 104 L146 104 L146 118 L74 118 Z" fill="#E3EAF2" />
      <Path d="M60 122 L160 122 L165 128 L55 128 Z" fill="#1B4A73" />
      {/* कौशल-प्रतीक बुलबुले — सिलाई, कंप्यूटर, खाना */}
      <Circle cx="165" cy="55" r="17" fill="#FFFFFF" />
      <Path d="M158 55 L172 55 M165 48 L165 62" stroke="#B26A00" strokeWidth="3" strokeLinecap="round" />
      <Circle cx="128" cy="35" r="15" fill="#FFFFFF" />
      <Rect x="121" y="29" width="14" height="10" rx="2" fill="none" stroke="#B26A00" strokeWidth="2.5" />
      <Path d="M124 39 L132 39" stroke="#B26A00" strokeWidth="2.5" strokeLinecap="round" />
      <Circle cx="55" cy="60" r="15" fill="#FFFFFF" />
      <Path d="M49 66 L61 54 M49 54 L61 66" stroke="#B26A00" strokeWidth="2.5" strokeLinecap="round" />
      {/* महिला — पीछे से, सीखती हुई */}
      <G translate="78, 55">
        <Path d="M14 14 C 4 14, 0 26, 4 40 L 8 46 L 28 46 L 32 40 C 36 26, 32 14, 22 14 Z" fill="#3A2A22" />
        <Path d="M2 46 C 2 38, 8 34, 18 34 C 28 34, 34 38, 34 46 L 38 68 L -2 68 Z" fill="#D98C1F" />
        <Circle cx="18" cy="30" r="14" fill="#E8B48C" />
      </G>
    </Svg>
  );
}

// ---------- 7. आत्मरक्षा — कराटे मुद्रा में महिला ----------
export function SelfDefenceArt({ width = 160, height = 130 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 170">
      <Circle cx="110" cy="90" r="78" fill="#EEE6F7" />
      {/* पीछे ढाल — सुरक्षा का प्रतीक */}
      <Path d="M110 30 L150 45 L150 85 Q150 118 110 138 Q70 118 70 85 L70 45 Z" fill="#5B3A8E" opacity={0.16} />
      {/* आकृति — कराटे स्टांस, एक हाथ आगे मुट्ठी बांधे */}
      <G translate="60, 30">
        {/* पिछला पैर */}
        <Path d="M40 118 L28 155" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" />
        <Path d="M52 118 L64 152" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" />
        {/* शरीर — gi (uniform) */}
        <Path d="M28 70 C 28 58, 36 50, 48 50 C 60 50, 68 58, 68 70 L 72 122 L 24 122 Z" fill="#FFFFFF" />
        {/* बेल्ट */}
        <Rect x="24" y="95" width="48" height="9" fill="#0F2A44" />
        {/* पिछली बांह */}
        <Path d="M30 72 Q18 80 16 96" stroke="#FFFFFF" strokeWidth="13" strokeLinecap="round" />
        {/* आगे की बांह — मुक्का */}
        <Path d="M64 72 Q86 68 96 60" stroke="#FFFFFF" strokeWidth="13" strokeLinecap="round" />
        <Circle cx="98" cy="58" r="10" fill="#E8B48C" />
        {/* गर्दन व सिर */}
        <Rect x="40" y="42" width="16" height="14" rx="5" fill="#E8B48C" />
        <Circle cx="48" cy="32" r="20" fill="#E8B48C" />
        {/* बंधे बाल — top-knot */}
        <Circle cx="48" cy="14" r="7" fill="#3A2A22" />
        <Path d="M28 34 C 26 20, 36 10, 48 12 C 60 10, 70 20, 68 34 C 64 26, 56 24, 52 26 C 52 22, 48 20, 44 22 C 40 24, 32 28, 28 34 Z" fill="#3A2A22" />
      </G>
      {/* गति-रेखाएं */}
      <Path d="M175 75 L195 70 M172 90 L192 90" stroke="#5B3A8E" strokeWidth="4" strokeLinecap="round" opacity={0.5} />
    </Svg>
  );
}

// ---------- 8. योजना/पेंशन — बुज़ुर्ग दंपति ----------
export function PensionArt({ width = 160, height = 130 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 220 170">
      <Circle cx="110" cy="90" r="78" fill="#FBEAF0" />
      {/* सिक्का */}
      <Circle cx="175" cy="128" r="24" fill="#E3A93B" />
      <Circle cx="175" cy="128" r="18" fill="none" stroke="#B26A00" strokeWidth="2" />
      <Path d="M175 118 L175 138 M168 122 L182 122 M168 134 L182 134" stroke="#B26A00" strokeWidth="2.5" strokeLinecap="round" />
      {/* महिला (सफ़ेद बाल) */}
      <G translate="35, 40">
        <Path d="M20 20 C 8 20, 2 36, 6 55 L 10 62 L 30 62 L 34 55 C 38 36, 32 20, 20 20 Z" fill="#D9D9D9" />
        <Path d="M4 62 C 4 52, 10 46, 20 46 C 30 46, 36 52, 36 62 L 40 108 L 0 108 Z" fill="#B23A2E" />
        <Circle cx="20" cy="40" r="16" fill="#E8B48C" />
        <Path d="M4 38 C 2 24, 14 14, 22 16 C 34 18, 40 28, 36 40 C 34 34, 28 32, 24 32 C 24 26, 18 24, 14 26 C 8 28, 4 34, 4 38 Z" fill="#D9D9D9" />
        {/* चश्मा */}
        <Circle cx="14" cy="40" r="5" fill="none" stroke="#5C3D2E" strokeWidth="1.6" />
        <Circle cx="26" cy="40" r="5" fill="none" stroke="#5C3D2E" strokeWidth="1.6" />
        <Path d="M19 40 L21 40" stroke="#5C3D2E" strokeWidth="1.6" />
      </G>
      {/* पुरुष */}
      <G translate="95, 44">
        <Path d="M22 22 C 10 22, 6 36, 10 50 L 34 50 C 38 36, 34 22, 22 22 Z" fill="#8A8578" />
        <Path d="M6 58 C 6 48, 12 42, 22 42 C 32 42, 38 48, 38 58 L 42 104 L 2 104 Z" fill="#4A5568" />
        <Circle cx="22" cy="38" r="16" fill="#E0AF87" />
        <Path d="M6 36 C 4 26, 14 18, 22 18 C 30 18, 40 26, 38 36 C 34 32, 30 30, 26 31 L 26 22 L 18 22 L 18 31 C 14 30, 10 32, 6 36 Z" fill="#8A8578" />
      </G>
    </Svg>
  );
}

// नाम से चित्र चुनने का सहायक — Home स्क्रीन में एक ही जगह से इस्तेमाल हो सके
export const CARD_ART = {
  // ⚠️ "घरेलू हिंसा", "सुरक्षित यात्रा मोड", "वॉइस शिकायत" कार्ड से दाईं ओर वाला
  // बड़ा चित्र जान-बूझकर हटाया गया — बाईं ओर वाला छोटा आइकन (श्रेणी बैज) ही काफ़ी है,
  // दो आइकन दिखना भ्रमित करता था।
  counselling: CounsellingArt,
  legal_aid: LegalAidArt,
  empowerment: TrainingArt,
  self_defence: SelfDefenceArt,
  pension: PensionArt,
};
