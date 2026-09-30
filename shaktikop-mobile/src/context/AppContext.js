import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { tt } from '../context/LocaleContext';
import { Alert } from 'react-native';
import { secureSetItem, secureGetItem, secureRemoveItem } from '../utils/secureStorage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import NetInfo from '@react-native-community/netinfo';
import { setThemeColor } from '../theme/colors';
import * as api from '../services/api';
import { setLocationData } from '../data/districts';
import { setCategoriesData, setHelplinesData, setRelationshipOptions, setOfficerDesignations } from '../data/constants';
import { ensureLocationPermission, requestLocationPermissionOnce, getPositionWithTimeout } from '../utils/locationPermission';

import { stopBackgroundTracking } from '../utils/backgroundLocation';
import { useBiometricLock } from '../hooks/useBiometricLock';
import { navigateFromAnywhere } from '../navigation/navigationRef';
const AppContext = createContext(null);
const SESSION_KEY = 'shaktikop:session';
const OFFLINE_QUEUE_KEY = 'shaktikop:offlineQueue';


// 🐛 बग फ़िक्स (सुरक्षा-गंभीर — production में एक भी सूचना नहीं जाती थी):
// getExpoPushTokenAsync() को Expo SDK 48+ में projectId चाहिए। पहले वह बिना
// projectId के बुलाया जाता था, और नीचे हर जगह catch खाली था — यानी वह विफल होकर
// चुपचाप लौट आता, token कभी सेव ही नहीं होता, और *कोई भी* push सूचना नहीं जाती।
// SOS अलर्ट भी नहीं। और चूँकि त्रुटि निगल ली जाती थी, यह कहीं दिखता तक नहीं था।
//
// eas build चलाने पर EAS यह projectId ख़ुद app config में डाल देता है — इसीलिए यह
// चूक EAS-बिल्ड में छिपी रहती। पर local (expo prebuild + gradlew) बिल्ड में EAS
// कुछ नहीं डालता, इसलिए वहाँ यह पक्का टूटता है।
//
// ⚠️ app.json में यह ज़रूर जोड़ें, वरना token अब भी नहीं बनेगा:
//     "extra": { "eas": { "projectId": "आपकी-project-id" } }
//     (Expo खाते में: expo.dev → project → Settings, या `eas project:info`)
async function getPushTokenOrWarn(who) {
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    undefined;
  if (!projectId) {
    console.warn(
      `⚠️ push token (${who}) नहीं बन सका — app.json में extra.eas.projectId सेट नहीं है। ` +
      'इसके बिना कोई भी सूचना (SOS समेत) फ़ोन पर नहीं आएगी।'
    );
    return null;
  }
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData?.data || null;
  } catch (e) {
    // पहले यह त्रुटि पूरी तरह निगल ली जाती थी। अब कम-से-कम लॉग में दिखती है,
    // ताकि "सूचनाएं क्यों नहीं आ रहीं" का पता लगाया जा सके।
    console.warn(`⚠️ push token (${who}) लेने में त्रुटि:`, e?.message);
    return null;
  }
}

export function AppProvider({ children }) {
  const [role, setRole] = useState(null); // 'citizen' | 'officer' | 'admin'
  // 🐛 बग फ़िक्स (गंभीर — सुरक्षा): पहले AppGate.js अपना खुद का useBiometricLock()
  // instance रखता था, और ProfileScreen सिर्फ़ AsyncStorage में लिख देता था — दोनों
  // के बीच कोई संपर्क नहीं था। नतीजा: नागरिक biometric-lock चालू करता, UI "सफल"
  // दिखाता, पर असली सुरक्षा तभी लागू होती जब पूरा ऐप बंद करके दोबारा खोला जाए —
  // तब तक झूठा भरोसा (false sense of security) बना रहता। अब यह hook यहीं, ऊपर
  // AppContext में है — AppGate और ProfileScreen दोनों इसी एक साझा state को
  // पढ़ते/बदलते हैं, इसलिए टॉगल करते ही तुरंत असर होता है।
  const biometricLock = useBiometricLock(role);
  const [user, setUser] = useState(null);
  const [justLoggedIn, setJustLoggedIn] = useState(false); // असली login के बाद Welcome स्क्रीन दिखाने के लिए (session restore पर नहीं)
  const [complaints, setComplaints] = useState([]);
  const [mySessions, setMySessions] = useState([]); // 🆕 काउंसलर की अपनी अपॉइंटमेंट्स
  const [officers, setOfficers] = useState([]);
  const [ready, setReady] = useState(false);
  const [pendingCategory, setPendingCategory] = useState(null);
  const [categoryStats, setCategoryStats] = useState([]);
  const [allOfficers, setAllOfficers] = useState([]); // प्रबंधन सूची (active+inactive)
  const [adminProfile, setAdminProfile] = useState(null);
  const [transferOfficers, setTransferOfficers] = useState([]); // officer के transfer-picker के लिए
  const [offlineQueue, setOfflineQueue] = useState([]); // नेटवर्क न होने पर locally रुकी शिकायतें
  // 🆕 वे शिकायतें जो सर्वर ने स्थायी रूप से अस्वीकार कर दीं (4xx) — इन्हें कतार में
  // दोबारा डालना बेकार है, पर उपयोगकर्ता को बताना ज़रूरी है कि ये नहीं गईं
  const [failedOfflineComplaints, setFailedOfflineComplaints] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0); // bell आइकन का badge
  const [hasCriticalUnread, setHasCriticalUnread] = useState(false); // SOS/आपात — bell को अलग दिखाने के लिए
  const [notifications, setNotifications] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [appSettings, setAppSettings] = useState(null); // feature flags, maintenance mode, min version, आदि
  const [settingsReady, setSettingsReady] = useState(false);
  // 🐛 बग फ़िक्स: DISTRICTS/DISTRICTS_WITH_STATIONS (data/districts.js) एक सादा,
  // mutable JS array/object है — React state नहीं। जब सर्वर से असली सूची आकर
  // setLocationData() उसे mutate करती है, जो स्क्रीन पहले से render हो चुकी थी
  // (जैसे "My Profile" — नागरिक टैब खोलते ही mount हो जाती है, अक्सर location-data
  // आने से पहले ही) उसे कभी पता ही नहीं चलता — React को कोई संकेत नहीं मिलता कि
  // दोबारा पढ़ना है, इसलिए वह पुरानी (सिर्फ़ 10-11 ज़िलों वाली fallback) सूची ही
  // दिखाती रहती है, भले ही असली सूची में सभी 75 ज़िले आ चुके हों। यह counter हर
  // बार बढ़ता है जब असली सूची लोड/अपडेट होती है — स्क्रीनें इसे Picker पर key की
  // तरह लगाकर React को दोबारा-render करने पर मजबूर कर सकती हैं।
  const [districtsVersion, setDistrictsVersion] = useState(0);

  useEffect(() => {
    (async () => {
      // ऐप खुलते ही location अनुमति माँगें — शिकायत दर्ज करते समय बार-बार पूछना न पड़े।
      // यह पूरे app में एकमात्र जगह है जहाँ असली popup दिखाने की अनुमति है — बाक़ी हर
      // जगह (SOS, फ़ॉर्म, नज़दीकी सहायता) सिर्फ़ चुपचाप मौजूदा स्थिति जांचती है।
      try {
        await requestLocationPermissionOnce();
      } catch (e) {
        // permission मॉड्यूल उपलब्ध न हो (जैसे web preview) तो चुपचाप छोड़ें
      }

      // ज़िला/थाना की असली सूची सर्वर से लाएं (Super Admin ने जो भी अपलोड की हो) —
      // बिना login के भी काम करे (साइनअप फॉर्म में भी चाहिए), इसलिए session से पहले
      try {
        const loc = await api.fetchLocationData();
        if (loc?.stationsByDistrict) {
          setLocationData(loc.stationsByDistrict, loc.districtsEnMap, loc.stationsEnByDistrict);
          setDistrictsVersion((v) => v + 1);
        }
      } catch (e) {
        // सर्वर से न मिले तो fallback starter सूची इस्तेमाल होती रहेगी
      }

      // शिकायत श्रेणियां — Super Admin ने database से जो भी बनाई हों
      try {
        const cats = await api.fetchCategories();
        setCategoriesData(cats);
      } catch (e) {
        // सर्वर से न मिले तो fallback categories इस्तेमाल होती रहेंगी
      }

      // हेल्पलाइन नंबर — Admin के "योजना, हेल्पलाइन" से जो भी प्रबंधित हों
      try {
        const helplines = await api.fetchPublicHelplines();
        setHelplinesData(helplines);
      } catch (e) {
        // सर्वर से न मिले तो fallback list इस्तेमाल होती रहेगी
      }

      // App Settings — feature flags, maintenance mode, न्यूनतम version, आदि
      try {
        const settings = await api.fetchAppSettings();
        setAppSettings(settings);
        if (settings?.relationship_options?.values) setRelationshipOptions(settings.relationship_options.values);
        if (settings?.officer_designations?.values) setOfficerDesignations(settings.officer_designations.values);
        if (settings?.theme_color?.primary) setThemeColor(settings.theme_color.primary);
      } catch (e) {
        // सर्वर से न मिले तो app सामान्य रूप से काम करता रहे (सब features चालू मानें)
        setAppSettings(null);
      }
      setSettingsReady(true);

      // 🔒 सुरक्षा सुधार: सेशन (नाम/भूमिका) व ऑफ़लाइन-कतार (पीड़िता के अधूरे विवरण)
      // अब AES-एन्क्रिप्टेड रूप में सेव होते हैं, सादे टेक्स्ट में नहीं (देखें utils/secureStorage.js)
      const parsed = await secureGetItem(SESSION_KEY);
      if (parsed) {
        setRole(parsed.role);
        setUser(parsed.user);
        await refreshAll(parsed.role);
        // 🐛 बग फ़िक्स (सूचनाएं चुपचाप बंद हो जाती थीं): push token सिर्फ़ *लॉगिन* के
        // समय सर्वर पर भेजा जाता था। पर उपयोगकर्ता एक बार लॉगिन करके महीनों बना रहता
        // है, जबकि Expo का token बीच में बदल सकता है — ऐप दोबारा इंस्टॉल करने पर, फ़ोन
        // restore करने पर, या Expo/FCM के अपने rotation से। तब सर्वर के पास पुराना,
        // बेकार token पड़ा रह जाता और उस अधिकारी/नागरिक तक *कोई* सूचना नहीं पहुँचती —
        // SOS भी नहीं। और चूँकि कहीं कोई त्रुटि नहीं आती, यह पता ही नहीं चलता।
        // अब हर बार ऐप खुलने पर token दोबारा भेजा जाता है (सर्वर पर वही हो तो कुछ
        // नहीं बदलता, बदल गया हो तो अपने-आप ठीक हो जाता है)।
        reRegisterPushToken(parsed.role);
      }

      try {
        const savedQueue = await secureGetItem(OFFLINE_QUEUE_KEY);
        if (savedQueue) setOfflineQueue(savedQueue);
      } catch (e) {
        // ignore
      }

      setReady(true);
    })();
  }, []);

  const refreshAll = useCallback(async (currentRole) => {
    try {
      // 🆕 काउंसलर/प्रशिक्षक — इनका कोई "complaints" एक्सेस नहीं है, सिर्फ़ अपनी
      // अपॉइंटमेंट्स। इसलिए यहीं अलग रास्ता, बाकी सब (fetchComplaints आदि) स्किप।
      if (currentRole === 'counsellor') {
        const sessions = await api.fetchMySessions();
        setMySessions(sessions);
        const profile = await api.fetchMyProviderProfile();
        setUser((prev) => ({ ...prev, ...profile }));
        return;
      }
      const list = await api.fetchComplaints();
      setComplaints(list);
      if (currentRole === 'admin') {
        const offs = await api.fetchOfficers();
        setOfficers(offs);
        const cats = await api.fetchCategoryStats();
        setCategoryStats(cats);
        const profile = await api.fetchAdminProfile();
        setAdminProfile(profile);
      }
      if (currentRole === 'officer') {
        const forTransfer = await api.fetchOfficersForTransfer();
        setTransferOfficers(forTransfer);
      }
      const unread = await api.fetchUnreadCount();
      setUnreadCount(unread.count);
      setHasCriticalUnread(!!unread.hasCritical);
    } catch (e) {
      // पहली लोड पर टोकन अमान्य हो सकता है — चुपचाप छोड़ देते हैं, लॉगिन स्क्रीन दिखेगी
    }
  }, []);

  const refresh = useCallback(() => refreshAll(role), [refreshAll, role]);

  const persistSession = async (nextRole, userData) => {
    await secureSetItem(SESSION_KEY, { role: nextRole, user: userData });
  };

  // ---------- नागरिक: साइनअप ----------
  const signupRequestOtp = api.signupRequestOtp;
  const signupVerify = useCallback(async (payload) => {
    const userData = await api.signupVerify(payload);
    setRole('citizen');
    setUser(userData);
    setJustLoggedIn(true);
    await persistSession('citizen', userData);
    await refreshAll('citizen');
    registerCitizenPushToken();
  }, [refreshAll]);

  // ---------- नागरिक: लॉगिन ----------
  const loginCitizen = useCallback(async (mobile, password) => {
    const userData = await api.citizenLogin(mobile, password);
    setRole('citizen');
    setUser(userData);
    setJustLoggedIn(true);
    await persistSession('citizen', userData);
    await refreshAll('citizen');
    registerCitizenPushToken();
  }, [refreshAll]);

  // 🆕 ऐप चलते-चलते token बदल जाए (Expo/FCM कभी-कभी rotate करता है) तो उसी वक़्त
  // सर्वर पर नया भेज दें — वरना अगली बार ऐप खुलने तक सूचनाएं बंद रहतीं।
  useEffect(() => {
    const sub = Notifications.addPushTokenListener(() => {
      if (role) reRegisterPushToken(role);
    });
    return () => sub.remove();
  }, [role]);

  // भूमिका के हिसाब से सही register-फ़ंक्शन चुनकर token दोबारा भेजता है
  const reRegisterPushToken = useCallback((forRole) => {
    if (forRole === 'citizen') registerCitizenPushToken();
    else if (forRole === 'officer') registerOfficerPushToken();
    else if (forRole === 'admin') registerAdminPushToken();
    else if (forRole === 'counsellor') registerCounsellorPushToken();
  }, []);

  // ताकि नागरिक को अपनी शिकायत के अपडेट की सूचना मिल सके
  const registerCitizenPushToken = useCallback(async () => {
    try {
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) return;
      const token = await getPushTokenOrWarn('Citizen');
      if (!token) return;
      await api.updateCitizenPushToken(token);
    } catch (e) {
      console.warn('⚠️ push token (Citizen) सेव नहीं हो सका:', e?.message);
    }
  }, []);

  // 🆕 DPDP Act — डेटा तक पहुंच व मिटाने का अधिकार
  const exportMyData = useCallback(() => api.exportMyData(), []);
  const requestAccountDeletion = useCallback((reason) => api.requestAccountDeletion(reason), []);
  const fetchMyDeletionRequest = useCallback(() => api.fetchMyDeletionRequest(), []);

  // ---------- पासवर्ड भूल गए ----------
  const forgotPasswordRequestOtp = api.forgotPasswordRequestOtp;
  const forgotPasswordReset = api.forgotPasswordReset;

  // ---------- अधिकारी: OTP लॉगिन ----------
  const officerRequestOtp = api.officerRequestOtp;
  const loginOfficer = useCallback(async (mobile, otp) => {
    const userData = await api.officerVerifyOtp(mobile, otp);
    setRole('officer');
    setUser(userData);
    setJustLoggedIn(true);
    await persistSession('officer', userData);
    await refreshAll('officer');
    registerOfficerPushToken();
  }, [refreshAll]);

  // डिवाइस का Expo push token लेकर बैकएंड में सेव करना — ताकि एडमिन अलर्ट भेज सके
  const registerOfficerPushToken = useCallback(async () => {
    try {
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) return;
      const token = await getPushTokenOrWarn('Officer');
      if (!token) return;
      await api.updateOfficerPushToken(token);
    } catch (e) {
      console.warn('⚠️ push token (Officer) सेव नहीं हो सका:', e?.message);
    }
  }, []);

  // ताकि एडमिन को SOS/checkin अलर्ट पहुँच सकें
  const registerAdminPushToken = useCallback(async () => {
    try {
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) return;
      const token = await getPushTokenOrWarn('Admin');
      if (!token) return;
      await api.updateAdminPushToken(token);
    } catch (e) {
      console.warn('⚠️ push token (Admin) सेव नहीं हो सका:', e?.message);
    }
  }, []);

  const updateDutyStatus = useCallback(async (dutyStatus) => {
    const updated = await api.updateOfficerDutyStatus(dutyStatus);
    setUser((u) => ({ ...u, dutyStatus: updated.dutyStatus }));
    return updated;
  }, []);

  // ---------- स्टाफ़: एकीकृत लॉगिन (अधिकारी + एडमिन, मोबाइल/ईमेल + OTP) ----------
  const staffRequestOtp = api.staffRequestOtp;
  const loginStaff = useCallback(async (identifier, otp) => {
    const data = await api.staffVerifyOtp(identifier, otp);
    setRole(data.user.role); // बैकएंड ही तय करता है कि यह officer है या admin
    setUser(data.user);
    setJustLoggedIn(true);
    await persistSession(data.user.role, data.user);
    await refreshAll(data.user.role);
    if (data.user.role === 'officer') registerOfficerPushToken();
    if (data.user.role === 'admin') registerAdminPushToken();
  }, [refreshAll]);

  const transferComplaintToOfficer = useCallback(
    async (id, toOfficerId, note) => {
      await api.transferComplaint(id, toOfficerId, note);
      await refresh();
    },
    [refresh]
  );

  const loginAdmin = useCallback(async (username, password) => {
    const userData = await api.adminLogin(username, password);
    setRole('admin');
    setUser(userData);
    setJustLoggedIn(true);
    await persistSession('admin', userData);
    await refreshAll('admin');
    registerAdminPushToken();
  }, [refreshAll]);

  // 🆕 काउंसलर/प्रशिक्षक — अपने मोबाइल/ईमेल + पासवर्ड से लॉगिन
  const loginCounsellor = useCallback(async (identifier, password) => {
    const userData = await api.counsellorLogin(identifier, password);
    setRole('counsellor');
    setUser(userData);
    setJustLoggedIn(true);
    await persistSession('counsellor', userData);
    await refreshAll('counsellor');
    registerCounsellorPushToken();
  }, [refreshAll]);

  // 🆕 डिवाइस का Expo push token लेकर बैकएंड में सेव करना — ताकि नई नियुक्ति/सत्र-तिथि
  // बदलने पर काउंसलर को सूचना मिल सके। पहले यह फ़ंक्शन ही मौजूद नहीं था — काउंसलर को
  // कभी push notification मिलती ही नहीं थी, चाहे बैकएंड कितना भी भेजने की कोशिश करता।
  const registerCounsellorPushToken = useCallback(async () => {
    try {
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) return;
      const token = await getPushTokenOrWarn('Counsellor');
      if (!token) return;
      await api.updateCounsellorPushToken(token);
    } catch (e) {
      console.warn('⚠️ push token (Counsellor) सेव नहीं हो सका:', e?.message);
    }
  }, []);

  const refreshMySessions = useCallback(async () => {
    const sessions = await api.fetchMySessions();
    setMySessions(sessions);
    return sessions;
  }, []);

  const updateMySession = useCallback(async (id, payload) => {
    const updated = await api.updateMySession(id, payload);
    await refreshMySessions();
    return updated;
  }, [refreshMySessions]);

  const updateMyProviderProfile = useCallback(async (payload) => {
    const updated = await api.updateMyProviderProfile(payload);
    setUser((prev) => ({ ...prev, ...updated }));
    await persistSession('counsellor', { ...user, ...updated });
    return updated;
  }, [user]);

  const updateMyProviderPhoto = useCallback(async (photoUrl) => {
    const updated = await api.updateMyProviderPhoto(photoUrl);
    setUser((prev) => ({ ...prev, ...updated }));
    await persistSession('counsellor', { ...user, ...updated });
    return updated;
  }, [user]);

  const dismissWelcome = useCallback(() => setJustLoggedIn(false), []);

  const logout = useCallback(async () => {
    // लॉगआउट पर पृष्ठभूमि ट्रैकिंग ज़रूर रोकें — वरना यह चुपचाप चलती रहती
    // और लोकेशन भेजने की कोशिश करती रहती, जो निजता के लिहाज़ से गलत है
    try {
      await stopBackgroundTracking();
    } catch (e) {
      // ignore
    }
    setRole(null);
    setUser(null);
    setComplaints([]);
    setOfficers([]);
    setCategoryStats([]);
    setAllOfficers([]);
    setAdminProfile(null);
    setMySessions([]);
    // 🐛 बग फ़िक्स (निजता — साझा/हस्तांतरित फ़ोन): लॉगआउट पर push token सर्वर से हटाया
    // नहीं जाता था। यानी अधिकारी लॉगआउट करके फ़ोन किसी और को दे दे (थानों में फ़ोन
    // अक्सर साझा होते हैं), तो उसके नाम की सूचनाएं उसी फ़ोन पर आती रहतीं — SOS अलर्ट
    // समेत। और इन सूचनाओं के text में पीड़िता का नाम होता है (जैसे "सीमा देवी ने अभी
    // तक सुरक्षित पहुंचने की पुष्टि नहीं की"), जो lock-screen पर उस व्यक्ति को दिख
    // जाता जिसके पास अब फ़ोन है। यानी यह सिर्फ़ असुविधा नहीं, पीड़िता की जानकारी का
    // रिसाव था।
    // ⚠️ यह api.clearToken() से *पहले* होना ज़रूरी है — बाद में token ही नहीं बचेगा
    // जिससे सर्वर को यह अनुरोध भेजा जा सके।
    try {
      if (role === 'citizen') await api.updateCitizenPushToken(null);
      else if (role === 'officer') await api.updateOfficerPushToken(null);
      else if (role === 'admin') await api.updateAdminPushToken(null);
      else if (role === 'counsellor') await api.updateCounsellorPushToken(null);
    } catch (e) {
      // नेटवर्क न हो तो भी लॉगआउट न रुके — पर कोशिश ज़रूर की जाए
    }

    // 🆕 सर्वर को भी बताएं कि यह refresh token अब बेकार कर दें — सिर्फ़ स्थानीय रूप से
    // token मिटाना काफ़ी नहीं था (देखें api.js की apiLogout टिप्पणी)
    await api.apiLogout();
    await api.clearToken();
    await secureRemoveItem(SESSION_KEY);
  }, [role]);

  // 🆕 फ़ोन चोरी/खोने या खाता compromise होने के शक़ पर — सभी डिवाइस से लॉगआउट।
  // सर्वर-कॉल पहले (जब तक token अभी valid है, तभी पता चलेगा कि यह कौन है), फिर
  // सामान्य लॉगआउट जैसी ही स्थानीय सफ़ाई।
  const logoutAllDevices = useCallback(async () => {
    await api.apiLogoutAll(); // यह विफल हो तो पूरा logout रुक जाना ठीक है — यूज़र को असली त्रुटि दिखे
    await logout();
  }, [logout]);

  // 🆕 401 आते ही (token अमान्य/समाप्त, या खाता अब निष्क्रिय कर दिया गया हो) तुरंत
  // सत्र साफ़ करके लॉगिन स्क्रीन पर वापस — बजाय इसके कि यूज़र हर स्क्रीन पर बार-बार
  // वही त्रुटि देखता रहे। हर render पर नहीं, सिर्फ़ logout फ़ंक्शन बदलने पर दोबारा जोड़ते हैं।
  useEffect(() => {
    api.setOnUnauthorized(() => logout());
  }, [logout]);

  // ---------- प्रोफ़ाइल ----------
  const updateProfile = useCallback(async (payload) => {
    const updated = await api.updateMyProfile(payload);
    setUser(updated);
    await persistSession('citizen', updated);
    return updated;
  }, []);

  const updateEmergencyContacts = useCallback(async (contacts) => {
    const updated = await api.updateEmergencyContacts(contacts);
    setUser(updated);
    await persistSession('citizen', updated);
    return updated;
  }, []);

  const updateMyPhoto = useCallback(async (photoUrl) => {
    const updated = await api.updateMyPhoto(photoUrl);
    setUser(updated);
    await persistSession('citizen', updated);
    return updated;
  }, []);

  const updateMyOfficerPhoto = useCallback(async (photoUrl) => {
    const updated = await api.updateMyOfficerPhoto(photoUrl);
    setUser((prev) => ({ ...prev, ...updated }));
    await persistSession('officer', { ...user, ...updated });
    return updated;
  }, [user]);

  const updateMyAdminPhoto = useCallback(async (photoUrl) => {
    const updated = await api.updateMyAdminPhoto(photoUrl);
    setUser((prev) => ({ ...prev, ...updated }));
    setAdminProfile((prev) => ({ ...prev, ...updated }));
    await persistSession('admin', { ...user, ...updated });
    return updated;
  }, [user]);

  // ---------- शिकायतें ----------
  const addComplaint = useCallback(
    async (payload) => {
      const created = await api.createComplaint(payload);
      await refresh();
      return created;
    },
    [refresh]
  );

  // ---------- ऑफ़लाइन मोड ----------
  // नेटवर्क न हो तो शिकायत डिवाइस पर सुरक्षित रहती है, कनेक्शन वापस आते ही अपने-आप भेज दी जाती है।
  const offlineQueueRef = useRef([]);
  useEffect(() => {
    offlineQueueRef.current = offlineQueue;
  }, [offlineQueue]);

  const queueOfflineComplaint = useCallback(async (payload) => {
    const localId = `OFFLINE-${Date.now()}`;
    const item = { localId, payload, createdAt: new Date().toISOString() };
    const next = [...offlineQueueRef.current, item];
    offlineQueueRef.current = next;
    setOfflineQueue(next);
      // 🔒 पीड़िता का नाम/मोबाइल/पता/GPS इसी कतार में होता है — encryption न हो पाए तो
      // इसे बिना encryption के डिस्क पर लिखने से बेहतर है कि सेव ही न करें (नीचे
      // catch में उपयोगकर्ता को साफ़ बताया जाता है)
    await secureSetItem(OFFLINE_QUEUE_KEY, next, { allowPlaintextFallback: false });
    return { id: localId, offline: true };
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    const current = offlineQueueRef.current;
    if (current.length === 0 || syncing) return;
    setSyncing(true);
    const stillQueued = [];
    const permanentlyFailed = [];
    for (const item of current) {
      try {
        await api.createComplaint(item.payload);
      } catch (e) {
        // 🐛 बग फ़िक्स (गंभीर — शिकायत चुपचाप हमेशा के लिए अटक जाती थी): पहले *हर*
        // त्रुटि पर शिकायत दोबारा कतार में डाल दी जाती थी। लेकिन सर्वर की कुछ त्रुटियां
        // स्थायी होती हैं (जैसे validation विफल, डुप्लीकेट, या session ख़त्म — 4xx)।
        // ऐसी शिकायत हर बार नेटवर्क आते ही दोबारा भेजी जाती, हर बार वैसे ही अस्वीकार
        // होती, और कतार में हमेशा पड़ी रहती — जबकि पीड़िता को डैशबोर्ड पर लगता रहता
        // कि "भेजी जा रही है"। महिला-सुरक्षा ऐप में शिकायत का इस तरह चुपचाप खो जाना
        // सबसे भारी चूक है। अब सिर्फ़ नेटवर्क/सर्वर-डाउन जैसी अस्थायी विफलता पर ही
        // दोबारा कोशिश होती है; स्थायी अस्वीकृति अलग कर दी जाती है ताकि उपयोगकर्ता
        // को साफ़ पता चले कि यह शिकायत नहीं गई और उसे दोबारा दर्ज करना होगा।
        if (e?.status >= 400 && e?.status < 500) {
          permanentlyFailed.push({ ...item, error: e.message });
        } else {
          stillQueued.push(item); // अस्थायी समस्या — कतार में रहने दें
        }
      }
    }
    offlineQueueRef.current = stillQueued;
    setOfflineQueue(stillQueued);
    await secureSetItem(OFFLINE_QUEUE_KEY, stillQueued, { allowPlaintextFallback: false });
    if (permanentlyFailed.length > 0) {
      setFailedOfflineComplaints((prev) => [...prev, ...permanentlyFailed]);
    }
    if (stillQueued.length < current.length) {
      await refresh();
    }
    setSyncing(false);
  }, [syncing, refresh]);

  // नेटवर्क वापस आते ही अपने-आप sync करने की कोशिश करें
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        syncOfflineQueue();
      }
    });
    return () => unsub();
  }, [syncOfflineQueue]);

  // किसी एक शिकायत को ताज़ा करें (पूरी लिस्ट दोबारा लोड किए बिना) — शिकायत विवरण स्क्रीन पर
  // हर कुछ सेकंड में इसे बुलाकर status/history को "लाइव" जैसा अपडेट रखा जाता है
  const refreshComplaint = useCallback(async (id) => {
    try {
      const fresh = await api.fetchComplaint(id);
      setComplaints((prev) => {
        const exists = prev.some((c) => c.id === id);
        if (exists) return prev.map((c) => (c.id === id ? fresh : c));
        return [fresh, ...prev];
      });
      return fresh;
    } catch (e) {
      // ऑफ़लाइन हैं या token अमान्य — चुपचाप छोड़ें, screen पुराना डेटा दिखाती रहेगी
      return null;
    }
  }, []);

  const assign = useCallback(
    async (id, officerId) => {
      await api.assignOfficer(id, officerId);
      await refresh();
    },
    [refresh]
  );

  const updateStatus = useCallback(
    async (id, status, note, attachmentUrl, voiceNoteUrl) => {
      await api.updateComplaintStatus(id, status, note, attachmentUrl, voiceNoteUrl);
      await refresh();
    },
    [refresh]
  );

  // 🆕 सिर्फ़ Super Admin — शिकायत को हटाना (soft-delete — "हटाई गई शिकायतें" सूची से वापस लाई जा सकती है)
  const deleteComplaintById = useCallback(
    async (id) => {
      await api.deleteComplaint(id);
      await refresh();
    },
    [refresh]
  );
  const fetchDeletedComplaints = useCallback(() => api.fetchDeletedComplaints(), []);
  const restoreComplaintById = useCallback(
    async (id) => {
      await api.restoreComplaint(id);
      await refresh();
    },
    [refresh]
  );

  // ---------- सुरक्षित यात्रा मोड (Phase E) ----------
  const sosTrigger = useCallback(
    async (id, latitude, longitude) => {
      const res = await api.triggerSos(id, latitude, longitude);
      await refresh();
      return res;
    },
    [refresh]
  );

  // Phase G: कहीं से भी (शेक करके) तुरंत SOS — कोई खुली शिकायत हो तो उसी पर SOS ट्रिगर करता है,
  // नहीं तो एक हल्की शिकायत बनाकर तुरंत SOS भेजता है।
  const quickSos = useCallback(async () => {
    let target = complaints.find((c) => !['निस्तारित', 'अस्वीकृत'].includes(c.status));
    let latitude, longitude;
    try {
      const perm = await ensureLocationPermission();
      if (perm.granted) {
        // 🐛 सुरक्षा-गंभीर बग फ़िक्स: पहले यहां सीधे getCurrentPositionAsync() await
        // होता था, जिसमें कोई समय-सीमा नहीं होती। इमारत के अंदर/कमज़ोर सिग्नल में
        // (यानी ठीक उसी हालत में जो आपात स्थिति में सबसे आम है) यह देर तक अटका रह
        // सकता है — और तब तक नीचे वाली SOS भेजने की लाइन चलती ही नहीं। अब ज़्यादा से
        // ज़्यादा 5 सेकंड इंतज़ार, उसके बाद cached लोकेशन, और वह भी न मिले तो बिना
        // निर्देशांक के ही SOS आगे बढ़ जाता है (नीचे fallback पहले से मौजूद है)।
        const pos = await getPositionWithTimeout({ timeoutMs: 5000 });
        if (pos) {
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        }
      }
    } catch (e) {
      // location न मिले तो भी SOS भेजना बेहतर है
    }
    if (!target) {
      // 🐛 सुरक्षा-गंभीर बग फ़िक्स: अगर location permission न मिली हो या GPS fail हो जाए
      // (ठीक वही स्थिति जो असली आपात स्थिति में सबसे संभावित है — इमारत के अंदर, कमज़ोर
      // सिग्नल, या permission कभी दी ही न गई हो), तो latitude/longitude दोनों undefined
      // रहते — और backend को location टेक्स्ट या coordinates में से कम से कम एक चाहिए ही
      // होता है। पहले इस स्थिति में पूरा request 400 error के साथ अस्वीकार हो जाता, यानी
      // ठीक उसी पल SOS भेजना असफल हो जाता जब सबसे ज़्यादा ज़रूरत हो। अब coordinates न
      // मिलने पर एक साफ़ fallback location टेक्स्ट भेजते हैं ताकि SOS कभी न रुके।
      target = await api.createComplaint({
        category: 'महिला हेल्प डेस्क',
        description: tt('शेक/त्वरित SOS — तुरंत सहायता चाहिए'),
        latitude,
        longitude,
        location: latitude && longitude ? null : tt('लाइव लोकेशन उपलब्ध नहीं — SOS ट्रिगर होने के समय'),
        isSelf: true,
        victimName: user?.name,
        victimMobile: user?.mobile,
      });
    }
    await api.triggerSos(target.id, latitude, longitude);
    await refresh();
    return target.id;
  }, [complaints, refresh, user]);

  // 🐛 बग फ़िक्स (सुरक्षित यात्रा): डिवाइस पर शेड्यूल किया गया सुरक्षा-जांच रिमाइंडर
  // कहीं भी रद्द नहीं होता था। यानी महिला के "मैं सुरक्षित पहुँच गई" कहने के बाद भी,
  // तय समय पर फ़ोन बजकर पूछता: "क्या आप सुरक्षित हैं? क्या आपको मदद चाहिए?" — यात्रा
  // कब की ख़त्म हो चुकी होती। यह न सिर्फ़ भ्रमित करता है, बल्कि (अगर वह किसी के साथ
  // हो तो) असहज स्थिति भी बना सकता है, और ऐसे झूठे अलार्म से असली सुरक्षा-जांच पर
  // भरोसा घटता है। अब जवाब देते ही उस शिकायत का लंबित रिमाइंडर हटा दिया जाता है।
  const cancelCheckinReminder = useCallback(async (complaintId) => {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        scheduled
          .filter((n) => n.content?.data?.checkinComplaintId === complaintId)
          .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
      );
    } catch (e) {
      // रद्द न हो पाए तो चुपचाप छोड़ें — यह मुख्य काम (सर्वर को जवाब भेजना) कभी न रोके
    }
  }, []);

  const confirmSafeArrival = useCallback(
    async (id) => {
      await api.confirmSafeArrival(id);
      await cancelCheckinReminder(id);
      await refresh();
    },
    [refresh, cancelCheckinReminder]
  );

  const respondCheckin = useCallback(
    async (id, status) => {
      await api.checkinResponse(id, status);
      // जवाब आ गया — अब उसी शिकायत का लंबित रिमाइंडर दोबारा नहीं बजना चाहिए
      await cancelCheckinReminder(id);
      await refresh();
    },
    [refresh, cancelCheckinReminder]
  );

  const submitFeedback = useCallback(
    async (id, rating, note) => {
      await api.submitFeedback(id, rating, note);
      await refresh();
    },
    [refresh]
  );

  // सुरक्षित यात्रा शिकायत दर्ज होने के बाद — नागरिक द्वारा खुद बताए गए अनुमानित
  // यात्रा-समय के आधार पर एक स्थानीय (device-only) रिमाइंडर शेड्यूल करता है,
  // बैकएंड cron की ज़रूरत नहीं।
  // 🐛 बग फ़िक्स: पहले यह हमेशा एक काल्पनिक दूरी (20km डिफ़ॉल्ट, हमेशा null पास होता
  // था) से समय निकालता था — नतीजा: हर यात्रा के लिए रिमाइंडर एक जैसे ~45 मिनट पर आता
  // था, चाहे यात्रा 10 मिनट की हो या 3 घंटे की। अब नागरिक द्वारा फ़ॉर्म में चुना गया
  // असली अनुमानित समय (मिनटों में) सीधे इस्तेमाल होता है।
  const scheduleCheckinReminder = useCallback(async (complaintId, estimatedMinutesInput) => {
    try {
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) {
        // 🐛 बग फ़िक्स: पहले यहां चुपचाप रुक जाता था — नागरिक को पता ही नहीं चलता
        // था कि सुरक्षा-जांच रिमाइंडर सेट ही नहीं हुआ (notification अनुमति न होने से)।
        // एक सुरक्षा-सुविधा के चुपचाप काम न करने से बेहतर है साफ़ बता देना।
        Alert.alert(
          tt('सूचना अनुमति चाहिए'),
          tt('सुरक्षा-जांच रिमाइंडर के लिए notification की अनुमति चाहिए — अभी यह चालू नहीं है, इसलिए रिमाइंडर नहीं आएगा। आप फ़ोन की सेटिंग्स से अनुमति दे सकते हैं।')
        );
        return;
      }
      const estimatedMinutes = Math.max(10, Number(estimatedMinutesInput) || 45) + 15; // +15 मिनट बफ़र
      await Notifications.scheduleNotificationAsync({
        content: {
          title: tt('सुरक्षा जांच — ShaktiCop'),
          body: tt('क्या आप सुरक्षित हैं? क्या आप अपने चुने स्थान पर पहुँच गए? क्या आपको मदद चाहिए?'),
          data: { checkinComplaintId: complaintId },
        },
        trigger: { seconds: estimatedMinutes * 60 },
      });
    } catch (e) {
      // डिवाइस पर local notification शेड्यूल न हो पाए तो चुपचाप छोड़ें
    }
  }, []);

  // जब यूज़र check-in notification पर टैप करे — तीन विकल्पों वाला Alert दिखाकर सीधे जवाब भेजें
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data || {};

      // 🐛 बग फ़िक्स (सूचना पर टैप करने से कुछ नहीं होता था): नीचे वाली जाँच सिर्फ़
      // सुरक्षित-यात्रा वाली check-in सूचना संभालती थी, और बाक़ी सब पर चुपचाप लौट
      // जाती थी। यानी अधिकारी को SOS आए, वह घबराकर उस पर टैप करे — और ऐप बस खुल
      // जाता, वह शिकायत खुलती ही नहीं। उसे सूची में जाकर ख़ुद ढूँढना पड़ता, ठीक उस
      // वक़्त जब सेकंड मायने रखते हैं। यही बात नए मामले की नियुक्ति, स्थिति-बदलाव
      // और चैट-संदेश पर भी लागू थी — इन सबके payload में complaintId पहले से जाता
      // है, बस उसका इस्तेमाल नहीं हो रहा था।
      if (!data.checkinComplaintId && data.complaintId) {
        navigateFromAnywhere('ComplaintDetail', { id: data.complaintId });
        return;
      }

      const complaintId = data.checkinComplaintId;
      if (!complaintId) return;
      // 🐛 बग फ़िक्स (दो चूकें): (1) ये तीनों विकल्प सीधे api.checkinResponse() बुलाते
      // थे, यानी respondCheckin() वाला रैपर (और उसमें जुड़ा रिमाइंडर-रद्द करना) पूरी
      // तरह बायपास हो जाता — जवाब देने के बाद भी वही रिमाइंडर दोबारा बज सकता था।
      // (2) "मैं सुरक्षित हूँ" कहने पर background लोकेशन-ट्रैकिंग चलती रहती थी —
      // यात्रा ख़त्म होने के बाद भी बैटरी खर्च होती और (निजता के लिहाज़ से ज़्यादा अहम)
      // महिला की लोकेशन पुलिस तक जाती रहती, जबकि उसकी अब ज़रूरत ही नहीं। यही सफ़ाई
      // "सुरक्षित पहुँच गई" वाले रास्ते में पहले से मौजूद है — यहां छूट गई थी।
      const answer = async (status) => {
        await api.checkinResponse(complaintId, status);
        await cancelCheckinReminder(complaintId);
        if (status === 'safe') {
          try {
            await stopBackgroundTracking();
            await api.updateLiveLocation(complaintId, { active: false });
          } catch (e) {
            // ट्रैकिंग बंद न हो पाए तो भी जवाब सफल ही माना जाए
          }
        }
        await refresh();
      };
      Alert.alert(
        'सुरक्षा जांच',
        'क्या आप सुरक्षित हैं?',
        [
          { text: tt('मैं सुरक्षित हूँ'), onPress: () => answer('safe') },
          { text: tt('अभी नहीं पहुँचा/पहुँची'), onPress: () => answer('not_arrived') },
          { text: tt('मदद चाहिए'), style: 'destructive', onPress: () => answer('need_help') },
        ],
        { cancelable: true }
      );
    });
    return () => sub.remove();
  }, [refresh, cancelCheckinReminder]);

  // Phase G: Shake-to-SOS — फोन ज़ोर से हिलाने पर तुरंत SOS भेजने का विकल्प (सिर्फ़ नागरिक, ऐप में कहीं भी)
  const shakeCooldownRef = useRef(false);
  useEffect(() => {
    if (role !== 'citizen') return;
    let lastMagnitude = 1;
    Accelerometer.setUpdateInterval(150);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const delta = Math.abs(magnitude - lastMagnitude);
      lastMagnitude = magnitude;
      if (delta > 2.2 && !shakeCooldownRef.current) {
        shakeCooldownRef.current = true;
        Alert.alert(
          'SOS भेजें?',
          'फोन हिलाने की पहचान हुई। क्या आप तुरंत SOS अलर्ट भेजना चाहते हैं?',
          [
            { text: tt('नहीं'), style: 'cancel', onPress: () => { shakeCooldownRef.current = false; } },
            {
              text: tt('हाँ, SOS भेजें'),
              style: 'destructive',
              onPress: async () => {
                try {
                  await quickSos();
                  Alert.alert('SOS भेज दिया गया', 'एडमिन को आपकी लोकेशन के साथ सूचना भेज दी गई है।');
                } catch (e) {
                  Alert.alert('त्रुटि', e.message);
                }
                shakeCooldownRef.current = false;
              },
            },
          ],
          { cancelable: true, onDismiss: () => { shakeCooldownRef.current = false; } }
        );
        setTimeout(() => { shakeCooldownRef.current = false; }, 8000);
      }
    });
    return () => sub.remove();
  }, [role, quickSos]);

  // ---------- एडमिन: फ़िल्टर की गई शिकायतें (लोकल स्टेट अपडेट नहीं करता) ----------
  const queryComplaints = useCallback(async (params) => {
    return api.fetchComplaints(params);
  }, []);

  const queryActivityLogs = useCallback(async (params) => {
    return api.fetchActivityLogs(params);
  }, []);

  // ---------- अधिकारी: Phase H (सीधे API से, वैश्विक स्टेट बदलने की ज़रूरत नहीं) ----------
  // ---------- Home बैनर + शिकायत ट्रैकिंग (सार्वजनिक) ----------
  // ---------- सूचनाएं (bell आइकन) ----------
  const loadNotifications = useCallback(async () => {
    try {
      const list = await api.fetchMyNotifications();
      setNotifications(list);
      const unread = await api.fetchUnreadCount();
      setUnreadCount(unread.count);
      setHasCriticalUnread(!!unread.hasCritical);
    } catch (e) {
      // ignore
    }
  }, []);

  const markNotificationRead = useCallback(async (id) => {
    await api.markNotificationRead(id);
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await api.markAllNotificationsRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  // हर 30 सेकंड में unread count चुपचाप ताज़ा करते रहें (लॉगिन रहने पर)
  useEffect(() => {
    if (!role) return;
    const interval = setInterval(async () => {
      try {
        const unread = await api.fetchUnreadCount();
        setUnreadCount(unread.count);
      setHasCriticalUnread(!!unread.hasCritical);
      } catch (e) {
        // ignore
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [role]);

  // ---------- Analytics + Granular RBAC ----------
  // ---------- Broadcast, Duplicates, Roster, Content, Reports, Overdue, Heatmap, Bulk Import ----------
  const sendBroadcast = api.sendBroadcast;
  const fetchBroadcastHistory = api.fetchBroadcastHistory;
  const fetchPossibleDuplicates = api.fetchPossibleDuplicates;
  const markDuplicate = api.markDuplicate;
  const unmarkDuplicate = api.unmarkDuplicate;
  const fetchRoster = api.fetchRoster;
  const addRosterEntry = api.addRosterEntry;
  const deleteRosterEntry = api.deleteRosterEntry;
  const fetchAdminWelfare = api.fetchAdminWelfare;
  const createWelfareItem = api.createWelfareItem;
  const updateWelfareItem = api.updateWelfareItem;
  const deleteWelfareItem = api.deleteWelfareItem;
  const fetchAdminHelplines = api.fetchAdminHelplines;
  const createHelplineItem = api.createHelplineItem;
  const updateHelplineItem = api.updateHelplineItem;
  const deleteHelplineItem = api.deleteHelplineItem;
  const fetchBackupStats = api.fetchBackupStats;
  const createBackup = api.createBackup;
  const restoreBackup = api.restoreBackup;

  const fetchAtrSummary = api.fetchAtrSummary;
  const fetchAtr = api.fetchAtr;

  const createCounsellingRequest = api.createCounsellingRequest;
  const fetchCounsellingRequests = api.fetchCounsellingRequests;
  const updateCounsellingRequest = api.updateCounsellingRequest;
  const fetchCounsellingStats = api.fetchCounsellingStats;
  const fetchCounsellingHistory = api.fetchCounsellingHistory;

  // काउंसलर / सेवा-प्रदाता सूची (dropdown से चुनने के लिए — मुक्त टेक्स्ट की जगह)
  const fetchServiceProviders = api.fetchServiceProviders;
  const createServiceProvider = api.createServiceProvider;
  const updateServiceProvider = api.updateServiceProvider;
  const deleteServiceProvider = api.deleteServiceProvider;

  // QR स्कैन से किसी भी थाने का officer/admin शिकायत सत्यापित कर सके — अपने स्कोप से बाहर भी
  const verifyComplaintByQr = api.verifyComplaintByQr;

  const fetchPublicWelfare = api.fetchPublicWelfare;
  const fetchPublicHelplines = api.fetchPublicHelplines;
  const fetchReportSchedules = api.fetchReportSchedules;
  const createReportSchedule = api.createReportSchedule;
  const updateReportSchedule = api.updateReportSchedule;
  const deleteReportSchedule = api.deleteReportSchedule;
  const generateReportNow = api.generateReportNow;
  const fetchOverdueComplaints = api.fetchOverdueComplaints;
  const fetchHeatmapPoints = api.fetchHeatmapPoints;
  const bulkImportOfficers = api.bulkImportOfficers;

  const fetchAnalyticsOverview = api.fetchAnalyticsOverview;
  const fetchAnalyticsFilterOptions = api.fetchAnalyticsFilterOptions;
  const fetchStats = api.fetchStats;
  const fetchDistrictsSummary = api.fetchDistrictsSummary;
  const fetchStationsSummary = api.fetchStationsSummary;
  const fetchSlaAtRisk = api.fetchSlaAtRisk;
  const fetchRepeatOffenders = api.fetchRepeatOffenders;
  const fetchOfficerWorkload = api.fetchOfficerWorkload;
  const fetchOfficerLeaderboard = api.fetchOfficerLeaderboard;
  const fetchAdmins = api.fetchAdmins;
  const createDistrictAdmin = api.createDistrictAdmin;
  const deleteAdmin = api.deleteAdmin;
  const updateAdminMenuPermissions = api.updateAdminMenuPermissions;

  const fetchOfficerStatusOverview = api.fetchOfficerStatusOverview;
  const updateOfficerRank = api.updateOfficerRank;
  const fetchDraft = api.fetchDraft;
  const createSubordinateOfficer = api.createSubordinateOfficer;
  const fetchMyStationOfficers = api.fetchMyStationOfficers;
  const updateMyStationOfficer = api.updateMyStationOfficer;
  const setMyStationOfficerStatus = api.setMyStationOfficerStatus;
  const createSHOByDSP = api.createSHOByDSP;
  const fetchAdminLocationData = api.fetchAdminLocationData;
  const addLocationEntry = api.addLocationEntry;
  const deleteLocationEntry = api.deleteLocationEntry;
  const updateLocationEntryGeo = api.updateLocationEntryGeo;
  const bulkUploadLocationDataRaw = api.bulkUploadLocationData;
  const updateLiveLocation = api.updateLiveLocation;
  const fetchAdminSettings = api.fetchAdminSettings;
  const updateAdminSettingRaw = api.updateAdminSetting;
  const updateAdminSetting = useCallback(
    async (key, value) => {
      const result = await updateAdminSettingRaw(key, value);
      try {
        const settings = await api.fetchAppSettings();
        setAppSettings(settings);
      } catch (e) {
        // ignore
      }
      return result;
    },
    [updateAdminSettingRaw]
  );
  const fetchAdminCategories = api.fetchAdminCategories;
  const createCategoryRaw = api.createCategory;
  const updateCategoryRaw = api.updateCategory;
  const deactivateCategoryRaw = api.deactivateCategory;
  const refreshCategoriesCache = async () => {
    try {
      const cats = await api.fetchCategories();
      setCategoriesData(cats);
    } catch (e) {
      // ignore
    }
  };
  const createCategory = useCallback(async (payload) => {
    const result = await createCategoryRaw(payload);
    await refreshCategoriesCache();
    return result;
  }, []);
  const updateCategoryAdmin = useCallback(async (id, payload) => {
    const result = await updateCategoryRaw(id, payload);
    await refreshCategoriesCache();
    return result;
  }, []);
  const deactivateCategoryAdmin = useCallback(async (id) => {
    const result = await deactivateCategoryRaw(id);
    await refreshCategoriesCache();
    return result;
  }, []);
  const fetchPublicFaq = api.fetchPublicFaq;
  const runEscalationNow = api.runEscalationNow;
  const fetchAdminLocalesList = api.fetchAdminLocales;
  const createLocaleAdmin = api.createLocale;
  const deleteLocaleAdmin = api.deleteLocale;
  const fetchAdminTranslationsList = api.fetchAdminTranslations;
  const bulkUploadTranslationsAdmin = api.bulkUploadTranslations;
  const fetchAdminFaq = api.fetchAdminFaq;
  const createFaq = api.createFaq;
  const updateFaq = api.updateFaq;
  const deleteFaq = api.deleteFaq;
  // अपलोड के तुरंत बाद in-memory सूची (districts.js) भी ताज़ा कर देते हैं ताकि तुरंत हर जगह दिखे
  const bulkUploadLocationData = useCallback(async (rows, mode) => {
    const result = await bulkUploadLocationDataRaw(rows, mode);
    try {
      const loc = await api.fetchLocationData();
      if (loc?.stationsByDistrict) {
        setLocationData(loc.stationsByDistrict, loc.districtsEnMap, loc.stationsEnByDistrict);
        setDistrictsVersion((v) => v + 1);
      }
    } catch (e) {
      // ignore — अगली बार app खुलने पर अपने-आप sync हो जाएगा
    }
    return result;
  }, [bulkUploadLocationDataRaw]);
  const saveDraftRemote = api.saveDraftRemote;
  const deleteDraftRemote = api.deleteDraftRemote;
  const updatePriority = api.updatePriority;
  const toggleChecklistItem = api.toggleChecklistItem;
  const verifyResolution = api.verifyResolution;

  const fetchPublicStats = api.fetchPublicStats;
  const fetchBanners = api.fetchBanners;
  const fetchAllBanners = api.fetchAllBanners;
  const createBanner = api.createBanner;
  const updateBanner = api.updateBanner;
  const deleteBanner = api.deleteBanner;
  const trackComplaintPublic = api.trackComplaint;

  const fetchMyPerformance = api.fetchMyPerformance;
  const fetchStationPerformance = api.fetchStationPerformance;
  const updateNotificationPreferences = api.updateNotificationPreferences;
  const requestBackup = api.requestBackup;
  const fetchPrivateNotes = api.fetchPrivateNotes;
  const fetchLocationTrail = api.fetchLocationTrail;
  const fetchAccusedHistory = api.fetchAccusedHistory;
  const fetchActiveDeviceSessions = api.fetchActiveDeviceSessions;
  const revokeDeviceSession = api.revokeDeviceSession;
  const addPrivateNote = api.addPrivateNote;
  const fetchFieldVisits = api.fetchFieldVisits;
  const addFieldVisit = api.addFieldVisit;
  const fetchMessageRecipients = api.fetchMessageRecipients;
  const fetchInbox = api.fetchInbox;
  const fetchSentReceivedMessages = api.fetchSentReceivedMessages;
  const fetchConversation = api.fetchConversation;
  const sendMessage = api.sendMessage;
  // 🆕 Complaint Chat
  const fetchComplaintMessages = api.fetchComplaintMessages;
  const sendComplaintMessage = api.sendComplaintMessage;

  const sendAlert = useCallback(async (id, message) => {
    return api.alertOfficer(id, message);
  }, []);

  // ---------- एडमिन: अधिकारी प्रबंधन ----------
  const loadAllOfficers = useCallback(async () => {
    const list = await api.fetchAllOfficers();
    setAllOfficers(list);
    return list;
  }, []);

  const createOfficerAdmin = useCallback(async (payload) => {
    await api.createOfficer(payload);
    await loadAllOfficers();
    await refreshAll('admin');
  }, [loadAllOfficers, refreshAll]);

  const updateOfficerAdmin = useCallback(async (id, payload) => {
    await api.updateOfficer(id, payload);
    await loadAllOfficers();
  }, [loadAllOfficers]);

  const transferOfficerAdmin = useCallback(async (id, payload) => {
    const result = await api.transferOfficer(id, payload);
    await loadAllOfficers();
    await refreshAll('admin');
    return result;
  }, [loadAllOfficers, refreshAll]);

  const setOfficerActive = useCallback(async (id, isActive) => {
    await api.setOfficerStatus(id, isActive);
    await loadAllOfficers();
    await refreshAll('admin');
  }, [loadAllOfficers, refreshAll]);

  const updateOfficerPerms = useCallback(async (id, permissions) => {
    await api.updateOfficerPermissions(id, permissions);
    await loadAllOfficers();
  }, [loadAllOfficers]);

  const removeOfficer = useCallback(async (id) => {
    await api.deleteOfficer(id);
    await loadAllOfficers();
    await refreshAll('admin');
  }, [loadAllOfficers, refreshAll]);

  // ---------- एडमिन: प्रोफ़ाइल ----------
  const updateAdminName = useCallback(async (name) => {
    const updated = await api.updateAdminProfile(name);
    setAdminProfile(updated);
    return updated;
  }, []);

  const changeAdminPassword = api.changeAdminPassword;
  const changeOfficerPassword = api.changeOfficerPassword;
  const changeCounsellorPassword = api.changeCounsellorPassword;

  const value = {
    ready,
    role,
    // 🆕 Biometric App-Lock — साझा state, ताकि टॉगल करते ही AppGate में तुरंत असर हो
    biometricLocked: biometricLock.locked,
    biometricLockEnabled: biometricLock.enabled,
    unlockBiometric: biometricLock.unlock,
    setBiometricLockEnabledLive: biometricLock.setEnabled,
    user,
    justLoggedIn,
    dismissWelcome,
    complaints,
    refreshComplaint,
    officers,
    pendingCategory,
    setPendingCategory,
    categoryStats,
    allOfficers,
    adminProfile,
    transferOfficers,
    updateDutyStatus,
    transferComplaintToOfficer,
    queryComplaints,
    queryActivityLogs,
    fetchMyPerformance,
    fetchStationPerformance,
    updateNotificationPreferences,
    unreadCount,
    hasCriticalUnread,
    notifications,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    sendBroadcast,
    fetchBroadcastHistory,
    fetchPossibleDuplicates,
    markDuplicate,
    unmarkDuplicate,
    fetchRoster,
    addRosterEntry,
    deleteRosterEntry,
    fetchAdminWelfare,
    createWelfareItem,
    updateWelfareItem,
    deleteWelfareItem,
    fetchAdminHelplines,
    createHelplineItem,
    updateHelplineItem,
    deleteHelplineItem,
    fetchBackupStats,
    createBackup,
    restoreBackup,
    fetchAtrSummary,
    fetchAtr,
    createCounsellingRequest,
    fetchCounsellingRequests,
    updateCounsellingRequest,
    fetchCounsellingStats,
    fetchCounsellingHistory,
    fetchServiceProviders,
    createServiceProvider,
    updateServiceProvider,
    deleteServiceProvider,
    verifyComplaintByQr,
    fetchPublicWelfare,
    fetchPublicHelplines,
    fetchReportSchedules,
    createReportSchedule,
    updateReportSchedule,
    deleteReportSchedule,
    generateReportNow,
    fetchOverdueComplaints,
    fetchHeatmapPoints,
    bulkImportOfficers,
    fetchAnalyticsOverview,
    fetchAnalyticsFilterOptions,
    fetchStats,
    fetchDistrictsSummary,
    fetchStationsSummary,
    fetchSlaAtRisk,
    fetchRepeatOffenders,
    fetchSosResponseAnalytics: api.fetchSosResponseAnalytics,
    fetchRepeatVictims: api.fetchRepeatVictims,
    fetchOfficerWorkload,
    fetchOfficerLeaderboard,
    fetchAdmins,
    createDistrictAdmin,
    deleteAdmin,
    updateAdminMenuPermissions,
    fetchOfficerStatusOverview,
    updateOfficerRank,
    fetchDraft,
    createSubordinateOfficer,
    fetchMyStationOfficers,
    updateMyStationOfficer,
    setMyStationOfficerStatus,
    createSHOByDSP,
    fetchAdminLocationData,
    addLocationEntry,
    deleteLocationEntry,
    updateLocationEntryGeo,
    bulkUploadLocationData,
    updateLiveLocation,
    appSettings,
    settingsReady,
    districtsVersion,
    fetchAdminSettings,
    updateAdminSetting,
    fetchAdminCategories,
    createCategory,
    updateCategoryAdmin,
    deactivateCategoryAdmin,
    fetchPublicFaq,
    runEscalationNow,
    fetchAdminLocalesList,
    createLocaleAdmin,
    deleteLocaleAdmin,
    fetchAdminTranslationsList,
    bulkUploadTranslationsAdmin,
    fetchAdminFaq,
    createFaq,
    updateFaq,
    deleteFaq,
    saveDraftRemote,
    deleteDraftRemote,
    updatePriority,
    toggleChecklistItem,
    verifyResolution,
    fetchPublicStats,
    fetchBanners,
    fetchAllBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    trackComplaintPublic,
    requestBackup,
    fetchPrivateNotes,
    fetchLocationTrail,
    fetchAccusedHistory,
    fetchActiveDeviceSessions,
    revokeDeviceSession,
    addPrivateNote,
    fetchFieldVisits,
    addFieldVisit,
    fetchMessageRecipients,
    fetchInbox,
    fetchSentReceivedMessages,
    fetchConversation,
    sendMessage,
    fetchComplaintMessages,
    sendComplaintMessage,
    sendAlert,
    loadAllOfficers,
    createOfficerAdmin,
    updateOfficerAdmin,
    transferOfficerAdmin,
    setOfficerActive,
    updateOfficerPerms,
    removeOfficer,
    updateAdminName,
    changeAdminPassword,
    changeOfficerPassword,
    changeCounsellorPassword,
    fetchPoliceServices: api.fetchPoliceServices,
    fetchAllPoliceServices: api.fetchAllPoliceServices,
    createPoliceService: api.createPoliceService,
    updatePoliceService: api.updatePoliceService,
    deletePoliceService: api.deletePoliceService,
    signupRequestOtp,
    signupVerify,
    loginCitizen,
    forgotPasswordRequestOtp,
    forgotPasswordReset,
    loginOfficer,
    officerRequestOtp,
    staffRequestOtp,
    loginStaff,
    loginAdmin,
    loginCounsellor,
    mySessions,
    refreshMySessions,
    updateMySession,
    updateMyProviderProfile,
    updateMyProviderPhoto,
    logout,
    logoutAllDevices,
    exportMyData,
    requestAccountDeletion,
    fetchMyDeletionRequest,
    updateProfile,
    updateEmergencyContacts,
    updateMyPhoto,
    updateMyOfficerPhoto,
    updateMyAdminPhoto,
    addComplaint,
    offlineQueue,
    failedOfflineComplaints,
    clearFailedOfflineComplaints: () => setFailedOfflineComplaints([]),
    syncing,
    queueOfflineComplaint,
    syncOfflineQueue,
    assign,
    updateStatus,
    deleteComplaintById,
    fetchDeletedComplaints,
    restoreComplaintById,
    sosTrigger,
    quickSos,
    confirmSafeArrival,
    respondCheckin,
    submitFeedback,
    scheduleCheckinReminder,
    refresh,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp को AppProvider के अंदर इस्तेमाल करें');
  return ctx;
}
