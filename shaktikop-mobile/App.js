import React, { useState, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import { LocaleProvider } from './src/context/LocaleContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import { loadSavedAppearance } from './src/theme/appearance';
import SplashLoader from './src/components/SplashLoader';
import { initSentry } from './src/utils/sentry';

initSentry();

// ⚠️ AppGate (और उसके ज़रिए सारी स्क्रीनें) जान-बूझकर ऊपर import नहीं की गईं।
// React Native में हर स्क्रीन अपनी StyleSheet module लोड होते ही बना लेती है —
// यानी अगर यहाँ ऊपर import कर देते तो Super Admin का चुना रंग/आकार लागू होने
// से पहले ही सारी styles पुराने रंगों से बन चुकी होतीं। इसलिए पहले theme
// लोड करते हैं, फिर require() से स्क्रीनें बनने देते हैं।
export default function App() {
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    loadSavedAppearance().finally(() => setThemeReady(true));
  }, []);

  if (!themeReady) {
    return <SplashLoader />;
  }

  // theme लग चुका है — अब स्क्रीनें बनने दें
  const AppGate = require('./src/components/AppGate').default;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LocaleProvider>
          <AppProvider>
            <StatusBar style="light" />
            <ErrorBoundary>
              <AppGate />
            </ErrorBoundary>
          </AppProvider>
        </LocaleProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
