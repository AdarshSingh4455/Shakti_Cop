import React, { useState } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius } from '../theme/colors';

// ⚠️ expo-camera का native module सिर्फ़ पूरी तरह prebuild की गई असली APK में उपलब्ध होता है —
// सीधा static import होने पर link न होने की स्थिति में पूरी screen crash हो सकती थी। अब सुरक्षित तरीके से।
let CameraView = null;
let useCameraPermissions = () => [{ granted: false, unavailable: true }, async () => {}];
let CAMERA_AVAILABLE = false;
try {
  const cameraModule = require('expo-camera');
  CameraView = cameraModule.CameraView;
  useCameraPermissions = cameraModule.useCameraPermissions;
  CAMERA_AVAILABLE = true;
} catch (e) {
  // native module उपलब्ध नहीं — नीचे "उपलब्ध नहीं" वाला संदेश दिखेगा, ऐप crash नहीं होगा
}

export default function QRScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // दोबारा स्कैन स्क्रीन पर लौटने पर (verify स्क्रीन से "वापस" दबाने पर) कैमरा फिर से सक्रिय हो
  useFocusEffect(
    React.useCallback(() => {
      setScanned(false);
    }, [])
  );

  const onScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    const id = data.includes(':') ? data.split(':').pop().trim() : data.trim();
    navigation.navigate('QRVerifyResult', { id });
  };

  if (!CAMERA_AVAILABLE) {
    return (
      <View style={styles.permissionBox}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.inkLight} />
        <Text style={styles.permissionText}>{tt('QR स्कैनर इस APK build में उपलब्ध नहीं है। शिकायत ID से सीधे खोजने के लिए "सभी शिकायतें" में search इस्तेमाल करें।')}</Text>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionBox}>
        <Ionicons name="camera-outline" size={44} color={colors.inkLight} />
        <Text style={styles.permissionText}>{tt('QR स्कैन करने के लिए कैमरा एक्सेस की अनुमति दें।')}</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>{tt('अनुमति दें')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : onScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>{tt('शिकायत की QR पावती को फ़्रेम के अंदर लाएं')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: colors.white, borderRadius: radius.lg, backgroundColor: 'transparent' },
  hint: { color: colors.white, fontSize: 13, marginTop: 20, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: colors.sand },
  permissionText: { fontSize: 13, color: colors.inkGrey, textAlign: 'center', marginTop: 14, lineHeight: 19 },
  permissionBtn: { marginTop: 18, backgroundColor: colors.shaktiMaroon, paddingHorizontal: 22, paddingVertical: 11, borderRadius: radius.md },
  permissionBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
});
