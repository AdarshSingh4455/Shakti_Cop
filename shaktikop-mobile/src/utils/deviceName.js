import { Platform } from 'react-native';

// 🆕 "किन-किन डिवाइस में लॉगिन है" सुविधा के लिए — लॉगिन के समय एक बार डिवाइस का
// नाम पता करके सर्वर को भेजते हैं। expo-device उपलब्ध न हो (जैसे Expo Go के कुछ
// पुराने संस्करण) तो भी सुरक्षित रूप से एक सामान्य नाम (Platform.OS) काम आता है।
export async function getDeviceName() {
  try {
    const Device = require('expo-device');
    const name = Device.deviceName || Device.modelName;
    if (name) return `${name}${Device.osName ? ` (${Device.osName} ${Device.osVersion || ''})`.trim() : ''}`;
  } catch (e) {
    // expo-device उपलब्ध न हो — नीचे fallback
  }
  return Platform.OS === 'ios' ? 'iOS डिवाइस' : 'Android डिवाइस';
}
