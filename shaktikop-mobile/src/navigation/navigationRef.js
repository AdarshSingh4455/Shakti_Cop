// ============================================================
// नेविगेशन-रेफ़ (navigation ref)
//
// क्यों चाहिए:
//   सूचना (notification) पर टैप करने का काम किसी screen के अंदर नहीं, AppContext में
//   होता है — और वहाँ navigation prop उपलब्ध नहीं होता। इसीलिए अब तक टैप करने पर
//   सिर्फ़ ऐप खुलता था, संबंधित शिकायत नहीं खुलती थी।
//
//   React Navigation इसी स्थिति के लिए यह तरीक़ा देता है: NavigationContainer को एक
//   ref देकर, कहीं से भी navigate किया जा सकता है।
//
// ⚠️ isReady() की जाँच ज़रूरी है: ऐप बंद होने पर आई सूचना पर टैप करें तो listener
//    navigator के तैयार होने से पहले ही चल सकता है। तब navigate() चुपचाप कुछ नहीं
//    करता — यानी वही पुरानी समस्या दूसरे रूप में लौट आती। इसलिए तैयार न होने पर
//    अनुरोध याद रखा जाता है और तैयार होते ही चला दिया जाता है।
// ============================================================

import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

let pending = null;

export function navigateFromAnywhere(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  } else {
    pending = { name, params };
  }
}

// NavigationContainer के onReady से बुलाया जाता है
export function flushPendingNavigation() {
  if (pending && navigationRef.isReady()) {
    const { name, params } = pending;
    pending = null;
    navigationRef.navigate(name, params);
  }
}
