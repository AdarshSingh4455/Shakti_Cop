import React, { useState, useEffect, useRef } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert, TouchableOpacity, Share, Switch, Linking } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { usePreventScreenshot } from '../hooks/usePreventScreenshot';
import OsmMapView from '../components/OsmMapView';
import QRCode from 'react-native-qrcode-svg';
import * as Location from 'expo-location';
import { ensureLocationPermission, getPositionWithTimeout } from '../utils/locationPermission';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
// ============================================================
// 🐛 बड़ा बग फ़िक्स: पहले यहाँ react-native-view-shot (एक NATIVE module) से QR कोड को
// screen से capture करके image बनाया जाता था। अगर APK को native rebuild
// (expo prebuild --clean) के बिना बनाया/चलाया गया हो, तो यह module native side पर
// link नहीं होता — और उसे कॉल करने पर सिर्फ़ JS error नहीं, बल्कि पूरा ऐप crash
// (बंद) हो जाता था, क्योंकि गड़बड़ी native bridge में होती है, JS के try/catch से
// पहले ही। यही "Print/Share बटन दबाते ही ऐप बंद हो जाता है" वाली शिकायत की वजह थी।
//
// फ़िक्स: अब QR कोड screen से capture ही नहीं किया जाता — बल्कि सीधे शुद्ध JavaScript
// में (कोई native code नहीं) एक SVG के रूप में बनाया जाता है, `qrcode-generator`
// लाइब्रेरी से — जो react-native-qrcode-svg की अपनी निर्भरता है (इसलिए पहले से
// project में मौजूद, कोई नया native module नहीं)। यह कभी crash नहीं कर सकता।
// ============================================================
let QrGenerator = null;
try {
  QrGenerator = require('qrcode-generator');
} catch (e) {
  // उपलब्ध न हो तो प्रिंट में QR कोड नहीं दिखेगा, रसीद फिर भी पूरी बनेगी
}

// पूरी तरह शुद्ध JS — कोई native module नहीं, इसलिए यह कभी crash नहीं कर सकता
function buildQrSvg(text, gridSize = 200) {
  if (!QrGenerator) return null;
  try {
    // 🐛 बग फ़िक्स: typeNumber = 0 (ऑटो) हर version के qrcode-generator में भरोसेमंद
    // नहीं है — लंबी शिकायत ID के लिए यह "data too long" जैसी त्रुटि दे सकता था और
    // पूरा QR ही चुपचाप नहीं बनता था। अब छोटे टाइप से शुरू करके बढ़ाते हुए वह सबसे
    // छोटा टाइप ढूंढते हैं जो हमारा टेक्स्ट समा सके — ID कितनी भी लंबी हो, हमेशा बनेगा।
    let qr = null;
    for (let type = 1; type <= 20 && !qr; type++) {
      try {
        const candidate = QrGenerator(type, 'M');
        candidate.addData(text);
        candidate.make();
        qr = candidate;
      } catch (e) {
        // यह टाइप डेटा के लिए बहुत छोटा है — अगले (बड़े) टाइप पर कोशिश जारी रखें
      }
    }
    if (!qr) return null;
    const count = qr.getModuleCount();
    const cell = gridSize / count;
    let rects = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          rects += `<rect x="${(col * cell).toFixed(2)}" y="${(row * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="#0F2A44"/>`;
        }
      }
    }
    // 🐛 बग फ़िक्स: पहले width/height को pixel में तय (200) रखा जाता था, फिर उसे
    // print HTML में एक छोटे (110px) container में डाला जाता था — SVG खुद scale नहीं
    // होता (सिर्फ़ viewBox वाला हिस्सा होता तो होता), इसलिए बड़ा QR छोटे box में overflow
    // होकर crop हो जाता था। अब width/height="100%" रखा है — SVG हमेशा अपने container
    // के हिसाब से अपने-आप सही आकार में fit होगा, चाहे container कितना भी बड़ा/छोटा हो।
    return `<svg width="100%" height="100%" viewBox="0 0 ${gridSize} ${gridSize}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/>${rects}</svg>`;
  } catch (e) {
    return null; // कोई भी समस्या हो तो चुपचाप QR के बिना रसीद बने
  }
}
// ⚠️ expo-av (आवाज़) का native module link न होने पर पूरी screen crash कर सकती थी — अब सुरक्षित तरीके से
let Audio = null;
let AUDIO_AVAILABLE = false;
try {
  const avModule = require('expo-av');
  Audio = avModule.Audio;
  AUDIO_AVAILABLE = true;
} catch (e) {
  // native module उपलब्ध नहीं — आवाज़ से जुड़े बटन छुपे रहेंगे, बाकी screen सामान्य रहेगी
}
import { colors, radius } from '../theme/colors';
import { STATUSES, REJECTED_STATUS } from '../data/constants';
import { REPORT_TEMPLATES } from '../data/reportTemplates';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import TimelineStepper from '../components/TimelineStepper';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import SuccessOverlay from '../components/SuccessOverlay';

import { formatDateShort, formatTimeFull } from '../utils/datetime';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  isBackgroundTrackingActive,
  BACKGROUND_LOCATION_AVAILABLE,
} from '../utils/backgroundLocation';
const PRIORITIES = ['सामान्य', 'उच्च', 'अति-आवश्यक'];
const PRIORITY_COLORS = { 'सामान्य': colors.sage, 'उच्च': colors.marigold, 'अति-आवश्यक': colors.alert };

// आधिकारिक लोगो को एक बार base64 में लोड करके cache कर लेते हैं — हर प्रिंट पर दोबारा पढ़ना न पड़े
let _logoBase64Cache = null;
async function getLogoBase64() {
  if (_logoBase64Cache) return _logoBase64Cache;
  try {
    const asset = Asset.fromModule(require('../../assets/up-police-logo.png'));
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (!uri) return null;
    _logoBase64Cache = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return _logoBase64Cache;
  } catch (e) {
    return null; // लोगो न मिले तो भी रसीद बिना लोगो के बन जाए
  }
}

export default function ComplaintDetailScreen({ route, navigation }) {
  // 🔒 यह स्क्रीन पीड़िता का नाम/पता/मोबाइल/विवरण दिखाती है — सबसे संवेदनशील स्क्रीन
  usePreventScreenshot();
  const { id } = route.params;
  const {
    role, user, complaints, officers, transferOfficers,
    assign, updateStatus, sendAlert, transferComplaintToOfficer,
    sosTrigger, confirmSafeArrival, submitFeedback,
    fetchPrivateNotes, addPrivateNote, fetchFieldVisits, addFieldVisit, requestBackup,
    updatePriority, toggleChecklistItem, verifyResolution, updateLiveLocation, refreshComplaint,
    fetchLocationTrail,
    fetchAccusedHistory,
    deleteComplaintById,
  } = useApp();
  const complaint = complaints.find((c) => c.id === id);
  const isMonitor = role === 'admin' && user?.adminRole === 'monitor'; // DSP/ASP/SSP — सिर्फ़ देख सकते हैं
  const isSHO = role === 'officer' && user?.rank === 'SHO';
  const isSuperAdmin = role === 'admin' && user?.adminRole === 'super_admin';
  const [deleting, setDeleting] = useState(false);
  // 🐛 बग फ़िक्स: नियुक्ति (Assign) UI पहले सिर्फ़ role === 'admin' पर दिखता था — SHO
  // के लिए यह ब्लॉक कभी render ही नहीं होता था, चाहे शिकायत दिख रही हो। साथ ही SHO के
  // लिए `officers` (सिर्फ़ admin के लिए fetch होती है) हमेशा खाली रहती — इसलिए भले ही
  // UI दिख भी जाता, dropdown खाली होता। अब SHO के लिए पहले से मौजूद `transferOfficers`
  // सूची (खुद को छोड़कर बाक़ी सक्रिय अधिकारी) इस्तेमाल होती है।
  // SHO के "नियुक्त करें" dropdown में सिर्फ़ अपने ही थाने के अधिकारी दिखें —
  // backend भी अब यही नियम लागू करता है, तो dropdown में गलत विकल्प दिखाकर
  // भ्रम पैदा नहीं होगा। "स्थानांतरण" (transfer) के लिए पूरी सूची अब भी उपलब्ध रहती है।
  const assignableOfficers =
    role === 'admin'
      ? officers
      : isSHO
      ? transferOfficers.filter(
          (o) => (o.station || '').trim().toLowerCase() === (user?.station || '').trim().toLowerCase()
        )
      : transferOfficers;
  const [assignOfficerId, setAssignOfficerId] = useState(assignableOfficers[0]?.id || null);
  const [nextStatus, setNextStatus] = useState(STATUSES[1]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertBusy, setAlertBusy] = useState(false);
  const [transferToId, setTransferToId] = useState(transferOfficers[0]?.id || null);
  const [transferNote, setTransferNote] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);
  const [geoName, setGeoName] = useState(null);      // शिकायत दर्ज करते समय की जगह का नाम
  const [liveGeoName, setLiveGeoName] = useState(null); // लाइव लोकेशन की जगह का नाम
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [arrivalBusy, setArrivalBusy] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [checklistBusy, setChecklistBusy] = useState(null);
  // कौन checklist भर सकता है — नियुक्त अधिकारी, या कोई भी एडमिन (monitor को छोड़कर,
  // उसे backend वैसे भी रोक देता है)। पहले सिर्फ़ 'officer' role जांचा जाता था,
  // इसलिए एडमिन के टैप करने पर कुछ होता ही नहीं था।
  const canEditChecklist =
    !isMonitor &&
    ((role === 'officer' && complaint?.officerId === user?.id) || role === 'admin');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [liveSharing, setLiveSharing] = useState(false);
  const liveIntervalRef = useRef(null);
  const [bgTracking, setBgTracking] = useState(false);

  // Phase H — निजी टिप्पणियां
  const [privateNotes, setPrivateNotes] = useState([]);
  const [newPrivateNote, setNewPrivateNote] = useState('');
  const [privateNoteBusy, setPrivateNoteBusy] = useState(false);

  // Phase H — GPS फील्ड विज़िट
  const [fieldVisits, setFieldVisits] = useState([]);
  const [checkinBusy, setCheckinBusy] = useState(false);

  // Phase H — Backup अनुरोध
  const [backupBusy, setBackupBusy] = useState(false);

  // Phase (bugfix) — voice note playback
  const [soundPlaying, setSoundPlaying] = useState(false);
  const [soundObj, setSoundObj] = useState(null);

  useEffect(() => {
    return () => {
      if (soundObj) soundObj.unloadAsync().catch(() => {});
    };
  }, [soundObj]);

  const playVoiceNote = async () => {
    try {
      if (soundPlaying && soundObj) {
        await soundObj.stopAsync();
        setSoundPlaying(false);
        return;
      }
      // सुरक्षा — अगर officer ने अभी-अभी अपनी क्लोज़िंग-नोट रिकॉर्ड की हो, तो mode अब भी
      // "recording" पर हो सकता है — playback से पहले पक्का प्लेबैक-मोड पर लाएं
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: complaint.voiceNoteUrl });
      setSoundObj(sound);
      setSoundPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) setSoundPlaying(false);
      });
      await sound.playAsync();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('आवाज़ चलाई नहीं जा सकी। अगर यह शिकायत बहुत पुरानी है तो हो सकता है इसकी रिकॉर्डिंग सुरक्षित न हुई हो।'));
      setSoundPlaying(false);
    }
  };

  // Phase (नया) — लाइव लोकेशन का पूरा रास्ता (breadcrumb trail)
  const [locationTrail, setLocationTrail] = useState([]);
  // 🆕 दोहराए-आरोपी की पहचान — सिर्फ़ officer/admin को दिखता है
  const [accusedHistory, setAccusedHistory] = useState(null);

  useEffect(() => {
    if ((role === 'officer' || role === 'admin') && complaint) {
      fetchPrivateNotes(complaint.id).then(setPrivateNotes).catch(() => {});
      fetchFieldVisits(complaint.id).then(setFieldVisits).catch(() => {});
      if (complaint.accusedMobile) {
        fetchAccusedHistory(complaint.id).then(setAccusedHistory).catch(() => {});
      }
    }
  }, [role, complaint?.id]);

  // 🆕 लाइव ट्रैकिंग चालू हो तो नागरिक का पूरा चला हुआ रास्ता भी लोड करें, और
  // हर 15 सेकंड में ताज़ा करते रहें (जैसे लोकेशन खुद अपडेट होती है)
  useEffect(() => {
    if (!complaint?.id || !complaint?.liveShareActive) {
      setLocationTrail([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetchLocationTrail(complaint.id)
        .then((points) => { if (!cancelled) setLocationTrail(points || []); })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [complaint?.id, complaint?.liveShareActive]);

  // "लाइव" स्टेटस — यह स्क्रीन खुली रहने तक हर 10 सेकंड में शिकायत को ताज़ा करते रहें,
  // ताकि status/timeline/कार्यवाही लॉग बिना manually refresh किए अपने-आप अपडेट होते रहें
  useEffect(() => {
    if (!id) return;
    refreshComplaint(id); // स्क्रीन खुलते ही तुरंत एक बार ताज़ा कर लें
    const poll = setInterval(() => refreshComplaint(id), 10000);
    return () => clearInterval(poll);
  }, [id, refreshComplaint]);

  // ऐप दोबारा खोलने पर भी सही स्थिति दिखे — ट्रैकिंग चल रही हो तो switch चालू मिले
  useEffect(() => {
    let cancelled = false;
    isBackgroundTrackingActive().then((on) => {
      if (!cancelled && on) setBgTracking(true);
    });
    return () => { cancelled = true; };
  }, []);

  // GPS बिंदु को पढ़ने लायक जगह के नाम में बदलें — नागरिक ने जो पता टाइप किया उससे अलग,
  // यह सीधे coordinates से निकलता है, इसलिए अधिकारी को असली जगह का पता चलता है
  const toPlaceName = (places) => {
    if (!places || !places[0]) return null;
    const p = places[0];
    return (
      [p.name, p.street, p.district, p.subregion, p.city, p.region, p.postalCode]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(', ') || null
    );
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!complaint?.latitude || !complaint?.longitude) return;
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: complaint.latitude,
          longitude: complaint.longitude,
        });
        if (!cancelled) setGeoName(toPlaceName(places));
      } catch (e) {
        if (!cancelled) setGeoName(null); // इंटरनेट न हो तो नाम नहीं मिलेगा, coordinates तब भी हैं
      }
    })();
    return () => { cancelled = true; };
  }, [complaint?.latitude, complaint?.longitude]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!complaint?.liveLat || !complaint?.liveLng) return;
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: complaint.liveLat,
          longitude: complaint.liveLng,
        });
        if (!cancelled) setLiveGeoName(toPlaceName(places));
      } catch (e) {
        if (!cancelled) setLiveGeoName(null);
      }
    })();
    return () => { cancelled = true; };
  }, [complaint?.liveLat, complaint?.liveLng]);

  // मोबाइल के नक्शा ऐप में खोलकर रास्ता दिखाएं — मौके पर पहुँचने के लिए
  const openInMapsApp = (lat, lng, label) => {
    const url = `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label || 'शिकायत स्थल')})`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`).catch(() => {
        Alert.alert(tt('त्रुटि'), tt('नक्शा ऐप नहीं खुल सका।'));
      });
    });
  };

  // अधिकारी — मामला बंद करते समय वैकल्पिक फ़ोटो/आवाज़
  const [closeAttachmentUri, setCloseAttachmentUri] = useState(null);
  const [closeRecording, setCloseRecording] = useState(null);
  const [closeIsRecording, setCloseIsRecording] = useState(false);
  const [closeVoiceUri, setCloseVoiceUri] = useState(null);
  // ⚠️ यहाँ भी वही सुरक्षा सीमा — base64 में बदलने के बाद बैकएंड की 5MB सीमा से
  // बचने के लिए रिकॉर्डिंग 2 मिनट पर अपने-आप रुक जाती है
  const CLOSE_MAX_RECORDING_SECONDS = 60;
  const [closeRecordSeconds, setCloseRecordSeconds] = useState(0);
  const closeRecordTimerRef = useRef(null);
  useEffect(() => {
    return () => {
      if (closeRecordTimerRef.current) clearInterval(closeRecordTimerRef.current);
    };
  }, []);

  // 🐛 बग फ़िक्स: पहले यहाँ `if (!complaint) return (...)` से function से जल्दी बाहर
  // निकल जाते थे — पर इसके नीचे अभी भी 2 और useEffect() hooks हैं (लाइव लोकेशन
  // resume/cleanup के लिए)। जब कोई complaint स्थानीय cache में तुरंत उपलब्ध न हो
  // (जैसे QR स्कैन के "आगे बढ़ें" flow में, पहली बार खुलने पर) — component इसी जगह
  // से लौट जाता और नीचे वाले hooks उस render में कभी call ही नहीं होते। जैसे ही डेटा
  // load होकर complaint उपलब्ध होता, अगली render में वो दोनों hook भी call होते —
  // और React को "Rendered more hooks than during the previous render" crash मिलता।
  // अब जल्दी return नहीं करते — सिर्फ़ एक flag रखते हैं, हर render में सभी hooks
  // बिना शर्त चलते हैं, और असली UI सिर्फ़ आख़िरी JSX return में तय होता है।
  const complaintNotFound = !complaint;

  const isRejected = complaint?.status === REJECTED_STATUS;
  const stepIndex = isRejected ? STATUSES.indexOf('दर्ज') : STATUSES.indexOf(complaint?.status);
  const nextOptions = [...STATUSES.slice(stepIndex + 1).filter((s) => s !== 'अधिकारी नियुक्त'), REJECTED_STATUS];

  const doAssign = async () => {
    // 🐛 बग फ़िक्स: बटन के loading prop पर ही निर्भर न रहें — वही double-submit गड़बड़ी
    // यहाँ भी संभव थी (देखें submit() में विस्तृत टिप्पणी)
    if (busy) return;
    if (!assignOfficerId) {
      Alert.alert(tt('कोई अधिकारी उपलब्ध नहीं'), tt('पहले अधिकारी सूची लोड होने का इंतज़ार करें।'));
      return;
    }
    setBusy(true);
    try {
      await assign(complaint.id, assignOfficerId);
      Alert.alert(tt('अधिकारी नियुक्त किया गया'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  // 🆕 सिर्फ़ Super Admin — शिकायत हटाना (अब soft-delete — "हटाई गई शिकायतें" सूची से वापस लाई जा सकती है)
  const handleDelete = () => {
    Alert.alert(
      tt('⚠️ शिकायत हटाएं?'),
      tt('यह शिकायत तुरंत सभी सूचियों/खोज से हट जाएगी। असली डेटा सुरक्षित रहता है — Super Admin "हटाई गई शिकायतें" मेनू से इसे बाद में वापस ला सकते हैं।'),
      [
        { text: tt('रद्द करें'), style: 'cancel' },
        {
          text: tt('हां, हटाएं'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteComplaintById(complaint.id);
              Alert.alert(tt('शिकायत हटा दी गई'));
              navigation.goBack();
            } catch (e) {
              Alert.alert(tt('त्रुटि'), e.message || tt('शिकायत हटाई नहीं जा सकी'));
            }
            setDeleting(false);
          },
        },
      ]
    );
  };

  const doUpdate = async () => {
    if (busy) return;
    if (nextStatus === REJECTED_STATUS && !note.trim()) {
      Alert.alert(tt('कारण आवश्यक है'), tt('शिकायत अस्वीकृत करने का कारण लिखें।'));
      return;
    }
    setBusy(true);
    try {
      await updateStatus(complaint.id, nextStatus, note.trim(), closeAttachmentUri, closeVoiceUri);
      setNote('');
      Alert.alert(tt('कार्यवाही अपडेट सुरक्षित हुई'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBusy(false);
  };

  const pickCloseAttachment = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(tt('अनुमति चाहिए'), tt('फोटो चुनने के लिए गैलरी एक्सेस की अनुमति दें।'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (!result.canceled) setCloseAttachmentUri(result.assets[0].uri);
  };

  const startCloseRecording = async () => {
    if (!AUDIO_AVAILABLE) {
      Alert.alert(tt('आवाज़ रिकॉर्डिंग उपलब्ध नहीं'), tt('यह सुविधा इस APK build में उपलब्ध नहीं है।'));
      return;
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(tt('अनुमति चाहिए'), tt('माइक्रोफ़ोन एक्सेस दें।'));
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setCloseRecording(rec);
      setCloseIsRecording(true);
      setCloseRecordSeconds(0);
      closeRecordTimerRef.current = setInterval(() => {
        setCloseRecordSeconds((s) => {
          if (s + 1 >= CLOSE_MAX_RECORDING_SECONDS) {
            stopCloseRecording();
            return CLOSE_MAX_RECORDING_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('रिकॉर्डिंग शुरू नहीं हो सकी।'));
    }
  };

  const stopCloseRecording = async () => {
    if (closeRecordTimerRef.current) {
      clearInterval(closeRecordTimerRef.current);
      closeRecordTimerRef.current = null;
    }
    if (!closeRecording) return;
    try {
      await closeRecording.stopAndUnloadAsync();
      // 🐛 वही बग फ़िक्स — recording रुकने के बाद playback-मोड पर वापस लाना ज़रूरी है,
      // वरना iOS पर आवाज़ सिर्फ़ धीमे earpiece से बजती है, सुनने में "काम न करने" जैसा लगता है
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const uri = closeRecording.getURI();
      setCloseVoiceUri(uri);
      // ⚠️ यही बग फ़िक्स यहाँ भी — अधिकारी/एडमिन की खुद की जोड़ी आवाज़ भी पहले
      // डिवाइस की लोकल path के रूप में भेजी जाती थी, इसलिए बाद में कोई और नहीं सुन पाता था
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        setCloseVoiceUri(`data:audio/m4a;base64,${base64}`);
      } catch (convErr) {
        // base64 न बन पाए तो local URI ही भेज देंगे, कम से कम कुछ न कुछ रिकॉर्ड रहेगा
      }
    } catch (e) {
      // ignore
    }
    setCloseRecording(null);
    setCloseIsRecording(false);
  };

  const doSos = async () => {
    if (sosBusy) return;
    setSosBusy(true);
    try {
      const perm = await ensureLocationPermission();
      let lat, lon;
      if (perm.granted) {
        // 🐛 सुरक्षा-गंभीर बग फ़िक्स: GPS अटक जाए तो नीचे वाली SOS-लाइन कभी चलती ही
        // नहीं थी। अब ज़्यादा से ज़्यादा 5 सेकंड, फिर cached लोकेशन, और वह भी न मिले
        // तो बिना निर्देशांक के ही SOS चला जाता है (देर करने से बेहतर है)।
        const pos = await getPositionWithTimeout({ timeoutMs: 5000 });
        if (pos) {
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        }
      }
      const res = await sosTrigger(complaint.id, lat, lon);

      // SOS दबाते ही लाइव लोकेशन शेयरिंग अपने-आप चालू — नागरिक को अलग से toggle नहीं करना पड़ता
      if (lat && lon && !liveIntervalRef.current) {
        setLiveSharing(true);
        liveIntervalRef.current = setInterval(async () => {
          try {
            // 🐛 बग फ़िक्स: यहां कोई समय-सीमा नहीं थी। यह हर 15 सेकंड चलता है, और
            // GPS अटक जाए (इमारत के अंदर आम) तो हर बार एक और कभी न पूरा होने वाला
            // अनुरोध जुड़ता जाता — बैटरी व मेमोरी दोनों खर्च, और लोकेशन फिर भी नहीं
            // जाती। अब 10 सेकंड (interval से कम) की सीमा, ताकि अनुरोध जमा न हों।
            const p = await getPositionWithTimeout({ timeoutMs: 10000 });
            if (!p) return;
            await updateLiveLocation(complaint.id, { active: true, latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy ?? null });
          } catch (e) {
            // ignore
          }
        }, 15000); // पहले 30 सेकंड था — अब ज़्यादा बार-बार, ज़्यादा सटीक ट्रैकिंग के लिए
      }

      const stationLine = res?.nearestStation
        ? `\n\n${tt('नज़दीकी थाना')}: ${res.nearestStation.name} (${res.nearestStation.distanceKm} ${tt('किमी')}) ${tt('को भी सूचित किया गया')}।`
        : '';
      // कितने तक सूचना पहुँची — यह बताना ज़रूरी है, वरना नागरिक को पता ही नहीं
      // चलता कि उसका SOS किसी तक पहुँचा या नहीं
      const reachLine = res?.alerted
        ? `\n\n✅ ${tt('सूचना पहुँची')}: ${res.alerted.officers} ${tt('अधिकारी')} · ${res.alerted.admins} ${tt('एडमिन')}`
        : '';
      // SOS के बाद ट्रैकिंग अपने-आप चालू — आपात स्थिति में नागरिक से
      // अलग से switch दबाने की उम्मीद करना ठीक नहीं
      const bg = await startBackgroundTracking(complaint.id);
      setBgTracking(bg.ok);
      // 🐛 बग फ़िक्स: पहले यहां liveSharing हमेशा true सेट हो जाता था, चाहे
      // background tracking असल में शुरू हुई हो या permission न मिलने से विफल
      // रही हो — नागरिक को झूठा भरोसा मिलता कि उसकी लोकेशन लगातार जा रही है,
      // जबकि असल में कुछ नहीं भेजा जा रहा था। अब सिर्फ़ तभी true जब सच में
      // ट्रैकिंग (background या screen-खुली foreground) चल रही हो।
      const trackingActuallyOn = bg.ok || !!liveIntervalRef.current;
      setLiveSharing(trackingActuallyOn);

      setSuccessMsg(tt('🆘 SOS भेज दिया गया'));
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        const trackingLine = trackingActuallyOn
          ? tt('आपकी लाइव लोकेशन के साथ तुरंत सूचना भेज दी गई है — अब लगातार आपकी लोकेशन अपडेट होती रहेगी।')
          : tt('सूचना भेज दी गई है — पर लोकेशन-अनुमति न होने के कारण लगातार लाइव लोकेशन ट्रैकिंग शुरू नहीं हो सकी। कृपया फ़ोन सेटिंग्स से लोकेशन अनुमति दें।');
        Alert.alert(
          tt('🆘 SOS भेज दिया गया'),
          `${trackingLine}${reachLine}${stationLine}`
        );
      }, 700);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setSosBusy(false);
  };

  const doSafeArrival = async () => {
    setArrivalBusy(true);
    try {
      await confirmSafeArrival(complaint.id);
      // 🐛 बग फ़िक्स: पहले सुरक्षित पहुंच की पुष्टि के बाद भी लाइव लोकेशन भेजना
      // (foreground व background दोनों) चलता रहता था — बैटरी बेवजह खर्च होती,
      // और अब जिसकी ज़रूरत ही नहीं है वह लोकेशन डेटा भी भेजा/सेव होता रहता।
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
      try {
        await stopBackgroundTracking();
        await updateLiveLocation(complaint.id, { active: false });
      } catch (e) {
        // ट्रैकिंग बंद करने में समस्या हो तो भी सुरक्षित-पहुंच की पुष्टि सफल मानें
      }
      setLiveSharing(false);
      Alert.alert(tt('सूचना दर्ज हुई'), tt('आपकी सुरक्षित पहुँच की जानकारी सुरक्षित कर ली गई है — लाइव लोकेशन शेयरिंग बंद कर दी गई है।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setArrivalBusy(false);
  };

  const doFeedback = async () => {
    if (ratingValue < 1) {
      Alert.alert(tt('रेटिंग दें'), tt('कृपया 1 से 5 सितारे चुनकर रेटिंग दें।'));
      return;
    }
    setFeedbackBusy(true);
    try {
      await submitFeedback(complaint.id, ratingValue, feedbackNote.trim());
      Alert.alert(tt('धन्यवाद'), tt('आपकी प्रतिक्रिया सुरक्षित कर ली गई है।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setFeedbackBusy(false);
  };

  const doUpdatePriority = async (p) => {
    setPriorityBusy(true);
    try {
      await updatePriority(complaint.id, p);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPriorityBusy(false);
  };

  const doToggleChecklist = async (key, currentDone) => {
    setChecklistBusy(key);
    try {
      await toggleChecklistItem(complaint.id, key, !currentDone);
      // ⚠️ पहले यहाँ कुछ नहीं होता था — सर्वर पर बदलाव हो जाता था, पर स्क्रीन पर
      // तब तक कुछ नहीं दिखता था जब तक अगली auto-refresh (10 सेकंड बाद) न चले।
      // इसीलिए लगता था कि checklist काम ही नहीं कर रही। अब तुरंत ताज़ा करते हैं।
      await refreshComplaint(complaint.id);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setChecklistBusy(null);
  };

  const doVerify = async () => {
    setVerifyBusy(true);
    try {
      await verifyResolution(complaint.id);
      Alert.alert(tt('✔ सत्यापित किया गया'), tt('निस्तारण की पुष्टि दर्ज कर दी गई है।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setVerifyBusy(false);
  };

  const toggleLiveSharing = async (value) => {
    if (value) {
      try {
        const perm = await ensureLocationPermission();
        if (!perm.granted) {
          Alert.alert(tt('अनुमति चाहिए'), tt('लाइव लोकेशन शेयर करने के लिए लोकेशन एक्सेस दें।'));
          return;
        }
      } catch (e) {
        Alert.alert(tt('त्रुटि'), tt('लोकेशन अनुमति जांचने में समस्या आई।'));
        return;
      }
      const sendUpdate = async () => {
        try {
          // 🐛 बग फ़िक्स: ऊपर वाली ही समस्या — हर 15 सेकंड, बिना समय-सीमा के
          const pos = await getPositionWithTimeout({ timeoutMs: 10000 });
          if (!pos) return;
          await updateLiveLocation(complaint.id, { active: true, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null });
        } catch (e) {
          // एक बार अपडेट न हो पाए तो चुपचाप छोड़ें, अगली बार फिर कोशिश होगी
        }
      };
      await sendUpdate();
      setLiveSharing(true);
      liveIntervalRef.current = setInterval(sendUpdate, 15000); // स्क्रीन खुली रहने पर — पहले 30 सेकंड था

      // 🔴 असली सुरक्षा — स्क्रीन बंद होने पर भी लोकेशन भेजती रहे।
      // ऊपर वाला interval सिर्फ़ तभी चलता है जब यह स्क्रीन खुली हो; यात्रा में
      // फ़ोन जेब में रहता है, इसलिए background ट्रैकिंग ही असल में काम आती है।
      const bg = await startBackgroundTracking(complaint.id);
      setBgTracking(bg.ok);
      if (!bg.ok) {
        if (bg.reason === 'background-denied') {
          Alert.alert(
            tt('पृष्ठभूमि अनुमति चाहिए'),
            tt('स्क्रीन बंद होने पर भी लोकेशन भेजने के लिए सेटिंग्स में जाकर लोकेशन की अनुमति "हमेशा अनुमति दें" पर रखें। अभी सिर्फ़ ऐप खुला रहने तक लोकेशन जाएगी।')
          );
        } else if (bg.reason === 'unavailable') {
          Alert.alert(
            tt('सीमित ट्रैकिंग'),
            tt('इस build में पृष्ठभूमि ट्रैकिंग उपलब्ध नहीं है — ऐप खुला रखें ताकि लोकेशन जाती रहे।')
          );
        }
      }
    } else {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
      await stopBackgroundTracking();
      setBgTracking(false);
      setLiveSharing(false);
      try {
        await updateLiveLocation(complaint.id, { active: false });
      } catch (e) {
        // ignore
      }
    }
  };

  useEffect(() => {
    // शिकायत विवरण बंद करने पर लाइव लोकेशन भेजना अपने-आप रुक जाए (background में चलते रहने से बचाव)
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    // पहले से चालू था (पिछली बार बंद किए बिना screen छोड़ी थी) तो सही तरीके से resume करें
    if (complaint?.liveShareActive && !liveSharing) toggleLiveSharing(true);
  }, [complaint?.id]);

  const doAddPrivateNote = async () => {
    if (!newPrivateNote.trim()) return;
    setPrivateNoteBusy(true);
    try {
      const saved = await addPrivateNote(complaint.id, newPrivateNote.trim());
      setPrivateNotes((prev) => [saved, ...prev]);
      setNewPrivateNote('');
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setPrivateNoteBusy(false);
  };

  const doFieldCheckin = async () => {
    setCheckinBusy(true);
    try {
      const perm = await ensureLocationPermission();
      if (!perm.granted) {
        Alert.alert(tt('अनुमति चाहिए'), tt('GPS एक्सेस की अनुमति दें।'));
        setCheckinBusy(false);
        return;
      }
      // 🐛 बग फ़िक्स: GPS अटकने पर setCheckinBusy(false) कभी नहीं चलता था — बटन
      // हमेशा के लिए "चेक-इन हो रहा है…" पर अटका रह जाता। अब समय-सीमा के साथ।
      const pos = await getPositionWithTimeout({ timeoutMs: 10000 });
      if (!pos) throw new Error('no-fix');
      const saved = await addFieldVisit(complaint.id, pos.coords.latitude, pos.coords.longitude, 'फील्ड विज़िट चेक-इन');
      setFieldVisits((prev) => [saved, ...prev]);
      Alert.alert(tt('चेक-इन सुरक्षित हुआ'), tt('आपकी लोकेशन दर्ज कर ली गई है।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('GPS लोकेशन नहीं मिल सकी।'));
    }
    setCheckinBusy(false);
  };

  const doBackupRequest = async () => {
    setBackupBusy(true);
    try {
      const perm = await ensureLocationPermission();
      let lat, lon;
      if (perm.granted) {
        // 🐛 सुरक्षा-गंभीर बग फ़िक्स: अधिकारी ख़तरे में backup माँग रहा हो और GPS
        // अटक जाए, तो अनुरोध भेजा ही नहीं जाता था। अब समय-सीमा के साथ — लोकेशन न
        // मिले तो भी backup-अनुरोध ज़रूर जाए।
        const pos = await getPositionWithTimeout({ timeoutMs: 5000 });
        if (pos) {
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        }
      }
      await requestBackup(complaint.id, lat, lon, `शिकायत ${complaint.id} पर तुरंत सहायता चाहिए`);
      Alert.alert(tt('🆘 Backup अनुरोध भेजा गया'), tt('सभी सक्रिय एडमिन को सूचना भेज दी गई है।'));
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setBackupBusy(false);
  };

  const doAlert = async () => {
    setAlertBusy(true);
    try {
      await sendAlert(complaint.id, alertMsg.trim());
      Alert.alert(tt('अलर्ट भेज दिया गया'), `${complaint.officer} को सूचना भेज दी गई है।`);
      setAlertMsg('');
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setAlertBusy(false);
  };

  const doTransfer = async () => {
    if (!transferToId) {
      Alert.alert(tt('कोई अधिकारी नहीं मिला'));
      return;
    }
    setTransferBusy(true);
    try {
      await transferComplaintToOfficer(complaint.id, transferToId, transferNote.trim());
      Alert.alert(tt('मामला स्थानांतरित हो गया'));
      setTransferNote('');
    } catch (e) {
      Alert.alert(tt('त्रुटि'), e.message);
    }
    setTransferBusy(false);
  };

  const doShareWithFamily = async () => {
    try {
      await Share.share({
        message: `ShaktiCop शिकायत अपडेट\nID: ${complaint.id}\nस्थिति: ${complaint.status}\nश्रेणी: ${complaint.category}\n\nयह जानकारी सुरक्षा हेतु परिवार के साथ साझा की जा रही है।`,
      });
    } catch (e) {
      // ignore
    }
  };

  const doPrint = async () => {
    try {
      const qrSvg = buildQrSvg(`SHAKTICOP:${complaint.id}`, 200);
      const logoBase64 = await getLogoBase64();
      const html = buildPrintHtml(complaint, { qrSvg, logoBase64 });
      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('प्रिंट करने में समस्या आई। कृपया दोबारा कोशिश करें।'));
    }
  };

  const doShare = async () => {
    try {
      const qrSvg = buildQrSvg(`SHAKTICOP:${complaint.id}`, 200);
      const logoBase64 = await getLogoBase64();
      const html = buildPrintHtml(complaint, { qrSvg, logoBase64 });
      const { uri } = await Print.printToFileAsync({ html });
      const shareAvailable = await Sharing.isAvailableAsync();
      if (shareAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `शिकायत ${complaint.id}` });
      } else {
        Alert.alert(tt('साझा करना उपलब्ध नहीं'), tt('इस डिवाइस पर शेयर सुविधा उपलब्ध नहीं है।'));
      }
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('PDF बनाने/साझा करने में समस्या आई। कृपया दोबारा कोशिश करें।'));
    }
  };

  // अब सभी hooks चल चुके हैं (कोई भी conditionally skip नहीं हुआ) — यहीं तय करते हैं
  // कि असली UI दिखाना है या "शिकायत नहीं मिली" वाला fallback
  if (complaintNotFound) {
    return (
      <View style={styles.container}>
        <Text>{tt('शिकायत नहीं मिली।')}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.card}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cid}>{complaint.id}</Text>
            <Text style={styles.title}>{complaint.category}</Text>
          </View>
          <StatusBadge status={complaint.status} />
        </View>

        {/* 📍 कूरियर-ट्रैकिंग जैसा स्टेटस स्टेपर — View पर क्लिक करते ही सबसे ऊपर तुरंत दिखे */}
        <View style={styles.stepperTopWrap}>
          <TimelineStepper status={complaint.status} size="full" history={complaint.history} createdAt={complaint.createdAt} />
        </View>

        {complaint.description ? <Text style={styles.desc}>{complaint.description}</Text> : null}

        <View style={styles.infoGrid}>
          <InfoItem label={tt('स्थान')} value={complaint.location} />
          {complaint.district ? <InfoItem label={tt('ज़िला')} value={tt(complaint.district)} /> : null}
          {complaint.policeStation ? <InfoItem label={tt('थाना')} value={tt(complaint.policeStation)} /> : null}
          {complaint.incidentLocation ? <InfoItem label={tt('घटना स्थल')} value={complaint.incidentLocation} /> : null}
          {role !== 'citizen' && <InfoItem label="दर्ज करने वाला" value={complaint.filedByName} />}
          <InfoItem label={tt('नियुक्त अधिकारी')} value={complaint.officer || '—'} />
          {complaint.extraDetails?.vehicleNumber ? <InfoItem label={tt('वाहन नंबर')} value={complaint.extraDetails.vehicleNumber} /> : null}
          {complaint.extraDetails?.relationshipToAccused ? <InfoItem label={tt('आरोपी से संबंध')} value={complaint.extraDetails.relationshipToAccused} /> : null}
          {complaint.accusedName ? <InfoItem label={tt('आरोपी का नाम')} value={complaint.accusedName} /> : null}
          {complaint.accusedMobile ? <InfoItem label={tt('आरोपी का मोबाइल')} value={complaint.accusedMobile} /> : null}
          {complaint.extraDetails?.fromLocation ? <InfoItem label={tt('कहाँ से')} value={complaint.extraDetails.fromLocation} /> : null}
          {complaint.extraDetails?.toLocation ? <InfoItem label={tt('कहाँ तक')} value={complaint.extraDetails.toLocation} /> : null}
          {complaint.sosTriggered ? <InfoItem label={tt('SOS स्थिति')} value={`🆘 सक्रिय (${formatDateTime(complaint.sosTriggeredAt)})`} /> : null}
          {complaint.safeArrivalConfirmed ? <InfoItem label={tt('सुरक्षित पहुँच')} value={`✔ पुष्टि हुई (${formatDateTime(complaint.safeArrivalConfirmedAt)})`} /> : null}
        </View>

        {/* 🆕 दोहराए-आरोपी की पहचान — सिर्फ़ officer/admin को दिखता है, सिर्फ़ तभी जब
            आरोपी का मोबाइल दिया गया हो और उसी नंबर से कोई और शिकायत भी मिली हो।
            जान-बूझकर दूसरी पीड़िता का नाम/मोबाइल कभी नहीं दिखाया जाता — सिर्फ़ पैटर्न। */}
        {(role === 'officer' || role === 'admin') && accusedHistory?.hasAccusedInfo && accusedHistory.priorComplaintsCount > 0 && (
          <View style={styles.accusedWarningBox}>
            <View style={styles.accusedWarningHeader}>
              <Ionicons name="warning" size={18} color={colors.alert} />
              <Text style={styles.accusedWarningTitle}>
                {tt(`⚠️ इसी आरोपी के मोबाइल-नंबर से ${accusedHistory.priorComplaintsCount} और शिकायत(ें) मिलीं`)}
              </Text>
            </View>
            <Text style={styles.accusedWarningHint}>
              {tt('गोपनीयता के लिए किसी और पीड़िता की पहचान नहीं दिखाई जाती — सिर्फ़ पैटर्न। नीचे दी शिकायत ID से (अगर अपने दायरे में हो) पूरा विवरण खोल सकते हैं।')}
            </Text>
            {accusedHistory.priorComplaints.map((pc) => (
              <TouchableOpacity
                key={pc.id}
                style={styles.accusedPriorRow}
                onPress={() => navigation.push('ComplaintDetail', { id: pc.id })}
              >
                <Text style={styles.accusedPriorId}>{pc.id}</Text>
                <Text style={styles.accusedPriorMeta} numberOfLines={1}>
                  {tt(pc.category)} · {tt(pc.status)} · {pc.district ? tt(pc.district) : '—'} · {formatDateTime(pc.createdAt)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 🆕 Complaint Chat — नागरिक और नियुक्त अधिकारी/SHO के बीच सीधी बातचीत */}
        {((role === 'citizen' && complaint.officerId) ||
          (role === 'officer' &&
            (complaint.officerId === user?.id ||
              (isSHO && (user?.station || '').trim().toLowerCase() === (complaint.policeStation || '').trim().toLowerCase())))) && (
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() =>
              navigation.navigate('ComplaintChat', {
                complaintId: complaint.id,
                otherName: role === 'citizen' ? complaint.officer : complaint.filedByName || tt('नागरिक'),
              })
            }
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.white} />
            <Text style={styles.chatBtnText}>{tt('बातचीत करें')}</Text>
          </TouchableOpacity>
        )}
        {complaint.voiceNoteUrl ? (
          <TouchableOpacity style={styles.voiceNotePlayBtn} onPress={playVoiceNote}>
            <Ionicons name={soundPlaying ? 'pause-circle' : 'play-circle'} size={22} color={colors.shaktiMaroon} />
            <Text style={styles.voiceNote}>{soundPlaying ? 'रोकें' : '🎤 आवाज़ रिकॉर्डिंग सुनें'}</Text>
          </TouchableOpacity>
        ) : null}

        {complaint.latitude && complaint.longitude ? (
          <>
            <View style={styles.gpsCard}>
              <View style={styles.gpsHeadRow}>
                <Ionicons name="location" size={16} color={colors.shaktiMaroon} />
                <Text style={styles.gpsHeadText}>{tt('GPS स्थान (शिकायत दर्ज करते समय)')}</Text>
              </View>
              {geoName ? (
                <Text style={styles.gpsPlace}>{geoName}</Text>
              ) : (
                <Text style={styles.gpsPlaceMissing}>{tt('जगह का नाम लोड हो रहा है / उपलब्ध नहीं')}</Text>
              )}
              <Text style={styles.gpsCoords}>
                अक्षांश {complaint.latitude.toFixed(6)} · देशांतर {complaint.longitude.toFixed(6)}
              </Text>
              {role !== 'citizen' && (
                <TouchableOpacity
                  style={styles.gpsNavBtn}
                  onPress={() => openInMapsApp(complaint.latitude, complaint.longitude, complaint.id)}
                >
                  <Ionicons name="navigate" size={14} color={colors.white} />
                  <Text style={styles.gpsNavBtnText}>{tt('नक्शा ऐप में रास्ता देखें')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {complaint.liveShareActive && complaint.liveLat && complaint.liveLng ? (
              <View style={[styles.gpsCard, styles.gpsCardLive]}>
                <View style={styles.gpsHeadRow}>
                  <Ionicons name="radio" size={16} color={colors.sage} />
                  <Text style={[styles.gpsHeadText, { color: colors.sage }]}>{tt('नागरिक की लाइव लोकेशन')}</Text>
                </View>
                {liveGeoName ? (
                  <Text style={styles.gpsPlace}>{liveGeoName}</Text>
                ) : (
                  <Text style={styles.gpsPlaceMissing}>{tt('जगह का नाम लोड हो रहा है / उपलब्ध नहीं')}</Text>
                )}
                <Text style={styles.gpsCoords}>
                  अक्षांश {complaint.liveLat.toFixed(6)} · देशांतर {complaint.liveLng.toFixed(6)}
                </Text>
                {complaint.liveAccuracy != null ? (
                  <Text style={styles.gpsUpdated}>
                    📍 {tt('GPS सटीकता')}: ±{Math.round(complaint.liveAccuracy)} {tt('मीटर')}
                    {complaint.liveAccuracy > 100 ? ` (${tt('कम सटीक — खुले आसमान में जाने पर बेहतर होगी')})` : ''}
                  </Text>
                ) : null}
                {complaint.liveUpdatedAt ? (
                  <Text style={styles.gpsUpdated}>अंतिम अपडेट: {formatDateTime(complaint.liveUpdatedAt)}</Text>
                ) : null}
                {role !== 'citizen' && (
                  <TouchableOpacity
                    style={[styles.gpsNavBtn, { backgroundColor: colors.sage }]}
                    onPress={() => openInMapsApp(complaint.liveLat, complaint.liveLng, 'नागरिक की लाइव लोकेशन')}
                  >
                    <Ionicons name="navigate" size={14} color={colors.white} />
                    <Text style={styles.gpsNavBtnText}>{tt('लाइव जगह का रास्ता देखें')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <OsmMapView
              style={styles.map}
              region={{
                latitude: complaint.liveLat || complaint.latitude,
                longitude: complaint.liveLng || complaint.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              markers={[
                {
                  id: 'filed-location',
                  latitude: complaint.latitude,
                  longitude: complaint.longitude,
                  title: geoName || complaint.id,
                  description: tt('शिकायत दर्ज करते समय की लोकेशन'),
                  color: '#8E2A46',
                },
                complaint.liveShareActive && complaint.liveLat && complaint.liveLng
                  ? {
                      id: 'live-location',
                      latitude: complaint.liveLat,
                      longitude: complaint.liveLng,
                      title: liveGeoName || tt('नागरिक की लाइव लोकेशन'),
                      description: complaint.liveUpdatedAt ? `अपडेट: ${formatDateTime(complaint.liveUpdatedAt)}` : '',
                      color: '#2E7D5B',
                    }
                  : null,
              ].filter(Boolean)}
              circles={
                complaint.liveShareActive && complaint.liveLat && complaint.liveLng && complaint.liveAccuracy
                  ? [{ id: 'live-accuracy', latitude: complaint.liveLat, longitude: complaint.liveLng, radiusMeters: complaint.liveAccuracy, color: '#2E7D5B' }]
                  : []
              }
              polylines={
                locationTrail.length > 1
                  ? [{ id: 'live-trail', coords: locationTrail.map((p) => ({ latitude: p.latitude, longitude: p.longitude })), color: '#2E7D5B', width: 3 }]
                  : []
              }
            />
          </>
        ) : null}

        {complaint.liveShareActive && role !== 'citizen' && (
          <View style={styles.liveBadgeRow}>
            <View style={styles.liveDotSmall} />
            <Text style={styles.liveBadgeText}>
              नागरिक लाइव लोकेशन शेयर कर रहे हैं — आख़िरी अपडेट: {complaint.liveUpdatedAt ? formatDateTime(complaint.liveUpdatedAt) : '—'}
            </Text>
          </View>
        )}

        {role === 'citizen' && !['निस्तारित', REJECTED_STATUS].includes(complaint.status) && (
          <View>
            <View style={styles.liveShareBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.liveShareTitle}>{tt('लाइव लोकेशन शेयर करें')}</Text>
                <Text style={styles.liveShareHint}>
                  {liveSharing
                    ? tt('अधिकारी अब आपकी वर्तमान लोकेशन देख सकते हैं।')
                    : tt('चालू करने पर अधिकारी आपकी वर्तमान लोकेशन देख सकेंगे — आप कभी भी बंद कर सकते हैं।')}
                </Text>
              </View>
              <Switch value={liveSharing} onValueChange={toggleLiveSharing} trackColor={{ true: colors.sage }} />
            </View>

            {/* नागरिक को साफ़ पता रहे कि सुरक्षा किस स्तर की है —
                "स्क्रीन बंद होने पर भी" वाली बात सबसे ज़्यादा भरोसा देती है */}
            {liveSharing && (
              <View style={[styles.trackBanner, bgTracking ? styles.trackBannerOn : styles.trackBannerWeak]}>
                <Ionicons
                  name={bgTracking ? 'shield-checkmark' : 'warning-outline'}
                  size={15}
                  color={bgTracking ? colors.sage : '#B26A00'}
                />
                <Text style={[styles.trackText, !bgTracking && { color: '#B26A00' }]}>
                  {bgTracking
                    ? tt('स्क्रीन बंद होने पर भी आपकी लोकेशन पुलिस तक पहुँचती रहेगी।')
                    : tt('सीमित सुरक्षा — लोकेशन सिर्फ़ यह स्क्रीन खुली रहने तक जाएगी। "हमेशा अनुमति दें" चुनकर पूरी सुरक्षा पाएं।')}
                </Text>
              </View>
            )}
          </View>
        )}

        {((role === 'admin' && !isMonitor) || isSHO) && !complaint.officer && (
          <View style={styles.assignRow}>
            <View style={[styles.pickerWrap, { flex: 1 }]}>
              <Picker selectedValue={assignOfficerId} onValueChange={setAssignOfficerId}>
                {assignableOfficers.map((o) => (
                  <Picker.Item key={o.id} label={`${o.name}${o.pno ? ' (' + o.pno + ')' : ''}${o.station ? ' · ' + o.station : ''}`} value={o.id} />
                ))}
              </Picker>
            </View>
            <PrimaryButton title={busy ? tt('नियुक्त हो रहा है…') : tt('नियुक्त करें')} onPress={doAssign} style={styles.assignBtn} loading={busy} />
          </View>
        )}
      </View>

      {role === 'citizen' && complaint.category === 'सुरक्षित यात्रा मोड' && !['निस्तारित', REJECTED_STATUS].includes(complaint.status) && !complaint.safeArrivalConfirmed && (
        <View style={[styles.card, { borderWidth: 1.5, borderColor: colors.alert }]}>
          <Text style={styles.sectionTitle}>{tt('सुरक्षा नियंत्रण')}</Text>
          <TouchableOpacity
            style={styles.sosBtn}
            onPress={doSos}
            disabled={sosBusy}
            accessibilityRole="button"
            accessibilityLabel={tt('SOS — तुरंत मदद चाहिए')}
            accessibilityHint={tt('दबाते ही आपकी लाइव लोकेशन पुलिस व आपातकालीन संपर्कों को भेजी जाएगी')}
          >
            <Ionicons name="alert-circle" size={22} color={colors.white} />
            <Text style={styles.sosBtnText}>{sosBusy ? 'भेजा जा रहा है…' : '🆘 SOS — तुरंत मदद चाहिए'}</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>{tt('दबाने पर आपकी लाइव लोकेशन के साथ एडमिन को तुरंत अलर्ट जाएगा।')}</Text>
          <PrimaryButton
            title={arrivalBusy ? tt('सुरक्षित हो रहा है…') : '✔ मैं सुरक्षित अपनी जगह पहुँच गया'}
            onPress={doSafeArrival}
            style={{ marginTop: 14, backgroundColor: colors.sage }}
           loading={arrivalBusy} />
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.priorityRow}>
          <Text style={styles.sectionTitle}>{tt('प्राथमिकता')}</Text>
          <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[complaint.priority] || colors.sage }]}>
            <Text style={styles.priorityBadgeText}>{complaint.priority}</Text>
          </View>
        </View>
        {role === 'admin' && !isMonitor && (
          <View style={styles.priorityChipRow}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.priorityChip, complaint.priority === p && { backgroundColor: PRIORITY_COLORS[p], borderColor: PRIORITY_COLORS[p] }]}
                onPress={() => doUpdatePriority(p)}
                disabled={priorityBusy}
              >
                <Text style={[styles.priorityChipText, complaint.priority === p && { color: colors.white }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {complaint.adminVerified && (
          <View style={styles.verifiedRow}>
            <Ionicons name="checkmark-done-circle" size={16} color={colors.sage} />
            <Text style={styles.verifiedText}>{complaint.adminVerifiedBy} द्वारा सत्यापित · {formatDateTime(complaint.adminVerifiedAt)}</Text>
          </View>
        )}
        {role === 'admin' && !isMonitor && complaint.status === 'निस्तारित' && !complaint.adminVerified && (
          <TouchableOpacity style={styles.verifyBtn} onPress={doVerify} disabled={verifyBusy}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.white} />
            <Text style={styles.verifyBtnText}>{verifyBusy ? 'सत्यापित हो रहा है…' : 'निस्तारण सत्यापित करें (Sign-off)'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.qrToggleBtn} onPress={() => setShowQR((s) => !s)}>
          <Ionicons name="qr-code-outline" size={16} color={colors.shaktiMaroon} />
          <Text style={styles.qrToggleText}>{showQR ? 'QR पावती छुपाएं' : 'आधिकारिक QR पावती देखें'}</Text>
        </TouchableOpacity>
        {showQR && (
          <View style={styles.qrBox}>
            <QRCode value={`SHAKTICOP:${complaint.id}`} size={160} color={colors.inkNavy} backgroundColor={colors.white} />
            <Text style={styles.qrCaption}>{complaint.id}</Text>
            <Text style={styles.qrHint}>{tt('यह QR शिकायत की पहचान सत्यापित करता है — थाने में दिखाया जा सकता है।')}</Text>
          </View>
        )}
      </View>

      {(role === 'officer' || role === 'admin') && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('जांच Checklist')}</Text>
          {(complaint.checklist || []).map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.checklistRow}
              onPress={() => canEditChecklist && doToggleChecklist(item.key, item.done)}
              disabled={!canEditChecklist || checklistBusy === item.key}
            >
              <Ionicons
                name={item.done ? 'checkbox' : 'square-outline'}
                size={20}
                color={item.done ? colors.sage : canEditChecklist ? colors.inkLight : colors.border}
              />
              <Text style={[styles.checklistLabel, item.done && styles.checklistLabelDone]}>{tt(item.label)}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.checklistProgress}>
            {(complaint.checklist || []).filter((c) => c.done).length} / {(complaint.checklist || []).length} {tt('पूर्ण')}
          </Text>
          {!canEditChecklist && (
            <Text style={styles.checklistNote}>
              {tt('सिर्फ़ नियुक्त अधिकारी या एडमिन ही checklist भर सकते हैं।')}
            </Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>पीड़ित का विवरण {complaint.isSelf ? '(स्वयं शिकायतकर्ता)' : ''}</Text>
        <View style={styles.infoGrid}>
          <InfoItem label={tt('नाम')} value={complaint.victimName} />
          <InfoItem label={tt('पिता/पति का नाम')} value={complaint.victimFatherName || '—'} />
          <InfoItem label={tt('पता')} value={complaint.victimAddress || '—'} />
          <InfoItem label={tt('मोबाइल')} value={complaint.victimMobile || '—'} />
        </View>
      </View>

      {(role === 'officer' || role === 'admin') && (
        <View style={[styles.card, { borderStyle: 'dashed', borderWidth: 1.5, borderColor: colors.marigold }]}>
          <View style={styles.privateHeader}>
            <Ionicons name="lock-closed" size={14} color={colors.marigold} />
            <Text style={styles.sectionTitle}>{tt('निजी टिप्पणियां (नागरिक को नहीं दिखतीं)')}</Text>
          </View>
          {role === 'officer' && (
            <View style={styles.privateInputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={tt('आंतरिक टिप्पणी लिखें…')}
                value={newPrivateNote}
                onChangeText={setNewPrivateNote}
                maxLength={1000}
              />
              <TouchableOpacity style={styles.addNoteBtn} onPress={doAddPrivateNote} disabled={privateNoteBusy}>
                <Text style={styles.addNoteBtnText}>{tt('जोड़ें')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {privateNotes.length === 0 ? (
            <Text style={styles.hint}>{tt('अभी कोई निजी टिप्पणी नहीं।')}</Text>
          ) : (
            privateNotes.map((n) => (
              <View key={n.id} style={styles.privateNoteRow}>
                <Text style={styles.privateNoteText}>{n.note}</Text>
                <Text style={styles.hint}>{n.officerName} · {formatDateTime(n.createdAt)}</Text>
              </View>
            ))
          )}
        </View>
      )}

      {(role === 'officer' || role === 'admin') && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('फील्ड विज़िट GPS चेक-इन')}</Text>
          {role === 'officer' && !['निस्तारित', REJECTED_STATUS].includes(complaint.status) && (
            <SecondaryButton
              title={checkinBusy ? tt('चेक-इन हो रहा है…') : '📍 अभी घटनास्थल पर चेक-इन करें'}
              onPress={doFieldCheckin}
              style={{ marginBottom: 10 }}
            />
          )}
          {fieldVisits.length === 0 ? (
            <Text style={styles.hint}>{tt('अभी कोई फील्ड विज़िट दर्ज नहीं।')}</Text>
          ) : (
            fieldVisits.map((v) => (
              <View key={v.id} style={styles.privateNoteRow}>
                <Text style={styles.privateNoteText}>📍 {v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}</Text>
                <Text style={styles.hint}>{v.officerName} · {formatDateTime(v.createdAt)}</Text>
              </View>
            ))
          )}
        </View>
      )}

      {role === 'officer' && (
        <TouchableOpacity style={styles.backupBtn} onPress={doBackupRequest} disabled={backupBusy}>
          <Ionicons name="alert-circle" size={18} color={colors.white} />
          <Text style={styles.backupBtnText}>{backupBusy ? 'भेजा जा रहा है…' : '🆘 तुरंत Backup माँगें'}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('शिकायत की स्थिति')}</Text>
        {STATUSES.map((s, i) => {
          const done = i <= stepIndex;
          const entry = complaint.history.find((h) => h.status === s);
          return (
            <View key={s} style={styles.tlItem}>
              <View style={styles.tlDotCol}>
                <Ionicons
                  name={done ? 'shield-checkmark' : 'shield-outline'}
                  size={22}
                  color={done ? colors.shaktiMaroon : colors.border}
                />
                <View style={[styles.tlLine, done && !isRejected && { backgroundColor: colors.shaktiMaroonLight }]} />
              </View>
              <View style={{ flex: 1, paddingBottom: 18 }}>
                <Text style={[styles.tlStatus, done && { color: colors.inkNavy }]}>{s}</Text>
                {entry && <Text style={styles.tlDate}>{formatDateTime(entry.created_at)} {entry.actor_name ? `· ${entry.actor_name} द्वारा` : ''}</Text>}
                {s === 'अधिकारी नियुक्त' && complaint.officer && (
                  <Text style={styles.tlOfficer}>👮 नियुक्त अधिकारी: {complaint.officer}</Text>
                )}
                {entry && entry.note ? <Text style={styles.tlNote}>{entry.note}</Text> : null}
              </View>
            </View>
          );
        })}
        {isRejected && (
          <View style={styles.tlItem}>
            <View style={styles.tlDotCol}>
              <Ionicons name="close-circle" size={22} color={colors.alert} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.tlStatus, { color: colors.alert }]}>{tt('अस्वीकृत')}</Text>
              {complaint.history
                .filter((h) => h.status === REJECTED_STATUS)
                .map((h, idx) => (
                  <View key={idx}>
                    <Text style={styles.tlDate}>{formatDateTime(h.created_at)} {h.actor_name ? `· ${h.actor_name}` : ''}</Text>
                    {h.note ? <Text style={[styles.tlNote, { backgroundColor: colors.alertWash }]}>{h.note}</Text> : null}
                  </View>
                ))}
            </View>
          </View>
        )}
      </View>

      {(role === 'officer' || (role === 'admin' && !isMonitor)) && !['निस्तारित', REJECTED_STATUS].includes(complaint.status) && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>कार्यवाही अपडेट करें {role === 'admin' ? '(एडमिन)' : ''}</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={nextStatus} onValueChange={setNextStatus}>
              {nextOptions.map((s) => (
                <Picker.Item key={s} label={tt(s)} value={s} />
              ))}
            </Picker>
          </View>
          {role === 'officer' && (
            <View style={styles.templateRow}>
              {REPORT_TEMPLATES.map((t) => (
                <TouchableOpacity key={t.label} style={styles.templateChip} onPress={() => setNote(t.text)}>
                  <Text style={styles.templateChipText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TextInput
            style={styles.textarea}
            placeholder={nextStatus === REJECTED_STATUS ? tt('अस्वीकृत करने का कारण लिखें (आवश्यक)…') : tt('कार्यवाही विवरण / टिप्पणी लिखें…')}
            multiline
            value={note}
            onChangeText={setNote}
            maxLength={1000}
          />
          {nextStatus === 'निस्तारित' && role === 'officer' && (
            <View style={{ marginBottom: 4 }}>
              <Text style={styles.hint}>{tt('मामला बंद करते समय चाहें तो प्रमाण/फ़ोटो या आवाज़ टिप्पणी जोड़ सकते हैं (वैकल्पिक):')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={styles.smallBtn} onPress={pickCloseAttachment}>
                  <Ionicons name="image-outline" size={15} color={colors.inkNavy} />
                  <Text style={styles.smallBtnText}>{closeAttachmentUri ? 'फ़ोटो जुड़ी ✓' : 'फ़ोटो जोड़ें'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={closeIsRecording ? stopCloseRecording : startCloseRecording}>
                  <Ionicons name={closeIsRecording ? 'stop-circle' : 'mic-outline'} size={15} color={colors.inkNavy} />
                  <Text style={styles.smallBtnText}>
                    {closeIsRecording
                      ? `रोकें · ${String(Math.floor(closeRecordSeconds / 60)).padStart(1, '0')}:${String(closeRecordSeconds % 60).padStart(2, '0')} / 1:00`
                      : closeVoiceUri
                      ? 'आवाज़ जुड़ी ✓'
                      : 'आवाज़ जोड़ें'}
                  </Text>
                </TouchableOpacity>
                {!!closeVoiceUri && !closeIsRecording && (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: colors.alertWash }]}
                    onPress={() => {
                      setCloseVoiceUri(null);
                      setCloseRecordSeconds(0);
                    }}
                  >
                    <Ionicons name="refresh" size={15} color={colors.alert} />
                    <Text style={[styles.smallBtnText, { color: colors.alert }]}>{tt('रीसेट')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          <PrimaryButton
            title={busy ? tt('सुरक्षित हो रहा है…') : tt('अपडेट सुरक्षित करें')}
            onPress={doUpdate}
            style={{ marginTop: 12 }}
           loading={busy} />
        </View>
      )}

      {role === 'officer' && user?.permissions?.canTransfer && !['निस्तारित', REJECTED_STATUS].includes(complaint.status) && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('मामला स्थानांतरित करें')}</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={transferToId} onValueChange={setTransferToId}>
              {transferOfficers.map((o) => (
                <Picker.Item key={o.id} label={`${o.name}${o.pno ? ' (' + o.pno + ')' : ''}${o.station ? ' · ' + o.station : ''}`} value={o.id} />
              ))}
            </Picker>
          </View>
          <TextInput
            style={styles.textarea}
            placeholder={tt('स्थानांतरण का कारण (वैकल्पिक)…')}
            multiline
            value={transferNote}
            onChangeText={setTransferNote}
            maxLength={1000}
          />
          <SecondaryButton
            title={transferBusy ? tt('स्थानांतरित हो रहा है…') : '↔ दूसरे अधिकारी को स्थानांतरित करें'}
            onPress={doTransfer}
            style={{ marginTop: 10 }}
          />
        </View>
      )}

      {role === 'admin' && !isMonitor && complaint.officer && !['निस्तारित', REJECTED_STATUS].includes(complaint.status) && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{complaint.officer} को अलर्ट भेजें</Text>
          <TextInput
            style={styles.textarea}
            placeholder={tt('तुरंत ध्यान देने हेतु संदेश लिखें (वैकल्पिक)…')}
            multiline
            value={alertMsg}
            onChangeText={setAlertMsg}
            maxLength={500}
          />
          <SecondaryButton title={alertBusy ? tt('भेजा जा रहा है…') : '🔔 अलर्ट भेजें'} onPress={doAlert} style={{ marginTop: 10 }} />
        </View>
      )}

      {['निस्तारित', REJECTED_STATUS].includes(complaint.status) && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('प्रतिक्रिया / रेटिंग')}</Text>
          {role === 'citizen' && !complaint.feedbackRating && (
            <>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setRatingValue(n)}>
                    <Ionicons name={n <= ratingValue ? 'star' : 'star-outline'} size={30} color={colors.marigold} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.textarea}
                placeholder={tt('अपनी प्रतिक्रिया लिखें (वैकल्पिक)…')}
                multiline
                value={feedbackNote}
                onChangeText={setFeedbackNote}
                maxLength={1000}
              />
              <PrimaryButton title={feedbackBusy ? tt('सुरक्षित हो रहा है…') : tt('प्रतिक्रिया भेजें')} onPress={doFeedback}  loading={feedbackBusy} />
            </>
          )}
          {complaint.feedbackRating ? (
            <View>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons key={n} name={n <= complaint.feedbackRating ? 'star' : 'star-outline'} size={22} color={colors.marigold} />
                ))}
              </View>
              {complaint.feedbackNote ? <Text style={styles.desc}>{complaint.feedbackNote}</Text> : null}
              <Text style={styles.hint}>{formatDateTime(complaint.feedbackSubmittedAt)}</Text>
            </View>
          ) : role !== 'citizen' ? (
            <Text style={styles.hint}>{tt('नागरिक ने अभी तक प्रतिक्रिया नहीं दी है।')}</Text>
          ) : null}
        </View>
      )}

      {role === 'citizen' && (
        <SecondaryButton title={tt('👪 परिवार के साथ स्थिति शेयर करें')} onPress={doShareWithFamily} style={{ marginBottom: 10 }} />
      )}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
        <TouchableOpacity style={styles.printShareBtn} onPress={doPrint} activeOpacity={0.85}>
          <Ionicons name="print" size={22} color={colors.white} />
          <Text style={styles.printShareBtnText}>{tt('प्रिंट करें')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.printShareBtn, styles.printShareBtnShare]} onPress={doShare} activeOpacity={0.85}>
          <Ionicons name="share-social" size={22} color={colors.white} />
          <Text style={styles.printShareBtnText}>{tt('शेयर करें')}</Text>
        </TouchableOpacity>
      </View>

      {isSuperAdmin && (
        <TouchableOpacity
          style={styles.deleteComplaintBtn}
          onPress={handleDelete}
          disabled={deleting}
          activeOpacity={0.85}
        >
          <Ionicons name="trash" size={18} color={colors.alert} />
          <Text style={styles.deleteComplaintBtnText}>
            {deleting ? tt('हटाया जा रहा है...') : tt('यह शिकायत हटाएं')}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
    <SuccessOverlay visible={showSuccess} message={successMsg} />
    </View>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  return formatDateShort(iso);
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const datePart = formatDateShort(d);
  const timePart = formatTimeFull(d);
  return `${datePart}, ${timePart}`;
}

function buildPrintHtml(c, assets = {}) {
  const { qrSvg, logoBase64 } = assets;
  // यूज़र-द्वारा टाइप किया गया कोई भी टेक्स्ट (विवरण, पता, नाम आदि) में < > & जैसे characters
  // हों तो रसीद का HTML layout टूट सकता है — इसलिए प्रिंट से पहले escape करना ज़रूरी है
  const esc = (v) => (v == null || v === '' ? null : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  const rows = (label, val) =>
    `<tr><td style="padding:6px 10px;color:#5B5750;font-size:12px;border-bottom:1px solid #EEE;white-space:nowrap;">${tt(label)}</td><td style="padding:6px 10px;font-weight:600;border-bottom:1px solid #EEE;">${esc(val) || '—'}</td></tr>`;

  const logoImg = logoBase64
    ? `<img src="data:image/png;base64,${logoBase64}" style="width:56px;height:auto;display:block;" />`
    : '';
  // qrSvg पहले से पूरा <svg>...</svg> markup है (buildQrSvg से) — सीधे HTML में जोड़ते हैं,
  // कोई native image capture नहीं, इसलिए यह कभी crash नहीं कर सकता
  const qrImg = qrSvg
    ? `<div style="width:110px;height:110px;margin-left:auto;">${qrSvg}</div>`
    : '';

  // "स्थान" row में पता + captured GPS coordinates (लाइव या शिकायत दर्ज करते समय की
  // एक बार वाली) दोनों एक साथ — अलग "लाइव लोकेशन विवरण" सेक्शन की जगह अब यहीं समाहित
  const gpsLat = c.liveLat ?? c.latitude;
  const gpsLng = c.liveLng ?? c.longitude;
  const hasGps = gpsLat != null && gpsLng != null;
  const locationValue = [
    c.location,
    hasGps ? `(अक्षांश ${Number(gpsLat).toFixed(6)}, देशांतर ${Number(gpsLng).toFixed(6)})` : null,
    c.liveShareActive ? '— लाइव लोकेशन चालू' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return `
    <html><body style="font-family:sans-serif;padding:24px;color:#0F2A44;">
      <table style="width:100%;border-bottom:3px solid #7A1836;padding-bottom:12px;margin-bottom:18px;">
        <tr>
          <td style="width:64px;vertical-align:middle;">${logoImg}</td>
          <td style="vertical-align:middle;padding-left:10px;">
            <h2 style="color:#7A1836;margin:0;">${tt('ShaktiCop — शिकायत रसीद')}</h2>
            <p style="color:#8A8578;font-size:12px;margin:4px 0 0;">${tt('मिशन शक्ति डिजिटल शिकायत प्रणाली — उत्तर प्रदेश पुलिस')}</p>
          </td>
          <td style="width:120px;text-align:right;vertical-align:middle;">
            ${qrImg}
            <p style="font-size:9px;color:#8A8578;margin:4px 0 0;">${tt('सत्यापन हेतु QR स्कैन करें')}</p>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;">
        ${rows('शिकायत ID', c.id)}
        ${rows('श्रेणी', c.category)}
        ${rows('विवरण', c.description)}
        ${rows('ज़िला', c.district)}
        ${rows('थाना', c.policeStation)}
        ${rows('स्थान', locationValue)}
        ${rows('घटना स्थल', c.incidentLocation)}
        ${rows('स्थिति', c.status)}
        ${rows('नियुक्त अधिकारी', c.officer)}
        ${rows('पीड़ित का नाम', c.victimName)}
        ${rows('पिता/पति का नाम', c.victimFatherName)}
        ${rows('पता', c.victimAddress)}
        ${rows('मोबाइल', c.victimMobile)}
        ${c.extraDetails?.vehicleNumber ? rows('वाहन नंबर', c.extraDetails.vehicleNumber) : ''}
        ${c.extraDetails?.relationshipToAccused ? rows('आरोपी से संबंध', c.extraDetails.relationshipToAccused) : ''}
      </table>

      <p style="font-size:10px;color:#8A8578;margin-top:26px;border-top:1px solid #EEE;padding-top:8px;">
        ${tt('यह रसीद स्वचालित रूप से जनरेट हुई है — QR कोड स्कैन करके थाने में सत्यापित की जा सकती है।')}
      </p>
    </body></html>
  `;
}


function InfoItem({ label, value }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoK}>{label}</Text>
      <Text style={styles.infoV}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  accusedWarningBox: {
    backgroundColor: '#FDEDEA',
    borderWidth: 1.5,
    borderColor: colors.alert,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 14,
  },
  accusedWarningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  accusedWarningTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.alert },
  accusedWarningHint: { fontSize: 11, color: colors.inkGrey, lineHeight: 15, marginBottom: 10 },
  accusedPriorRow: { backgroundColor: colors.white, borderRadius: radius.sm, padding: 10, marginBottom: 6 },
  accusedPriorId: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
  accusedPriorMeta: { fontSize: 11, color: colors.inkGrey, marginTop: 2 },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.shaktiMaroon,
    borderRadius: radius.md,
    paddingVertical: 12,
    marginTop: 14,
  },
  chatBtnText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  stepperTopWrap: { marginTop: 14, marginBottom: 4, paddingHorizontal: 2 },
  printShareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.shaktiMaroon,
    paddingVertical: 16,
    borderRadius: radius.lg,
    shadowColor: colors.shaktiMaroon,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  printShareBtnShare: { backgroundColor: colors.sage },
  printShareBtnText: { color: colors.white, fontSize: 15.5, fontWeight: '800' },
  // सिर्फ़ Super Admin — शिकायत को स्थायी रूप से हटाने का बटन (जान-बूझकर बाकी बटनों से
  // अलग, हल्का/outline स्टाइल में, ताकि गलती से न दब जाए — पर साफ़ दिखे कि यह मौजूद है)
  deleteComplaintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.alert,
    backgroundColor: colors.white,
  },
  deleteComplaintBtnText: { color: colors.alert, fontSize: 14, fontWeight: '700' },
  privateHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  privateInputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  privateNoteRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  privateNoteText: { fontSize: 12.5, color: colors.inkGrey, lineHeight: 18 },
  // 🐛 बग फ़िक्स: यहाँ styles.hint और styles.input पूरे screen में 9 जगह इस्तेमाल हो रहे
  // थे (निजी टिप्पणी, फील्ड विज़िट, प्रतिक्रिया सेक्शन) पर कभी परिभाषित ही नहीं थे —
  // यानी वो Text/TextInput बिना किसी styling के दिखते (plain काला टेक्स्ट, कोई border
  // नहीं)। अब बाकी फ़ाइल की डिज़ाइन भाषा से मेल खाती हुई styles जोड़ दीं।
  hint: { fontSize: 11.5, color: colors.inkLight, fontStyle: 'italic', lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.inkNavy,
    backgroundColor: colors.white,
  },
  addNoteBtn: { backgroundColor: colors.marigold, paddingHorizontal: 14, borderRadius: radius.sm, justifyContent: 'center' },
  addNoteBtnText: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.alert,
    paddingVertical: 13,
    borderRadius: radius.md,
    marginBottom: 16,
  },
  backupBtnText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  templateChip: { backgroundColor: colors.sand, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  templateChipText: { fontSize: 11, fontWeight: '600', color: colors.inkNavy },
  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.alert,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  sosBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.sand,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
  },
  smallBtnText: { fontSize: 11.5, fontWeight: '600', color: colors.inkNavy },
  starsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  logRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  logTime: { fontSize: 10.5, color: colors.inkLight, fontWeight: '600' },
  logActor: { fontSize: 12.5, color: colors.inkNavy, fontWeight: '700', marginTop: 2 },
  logRole: { fontWeight: '400', color: colors.inkGrey },
  logNote: { fontSize: 12, color: colors.inkGrey, marginTop: 3, lineHeight: 17 },
  logAttach: { fontSize: 11, color: colors.shaktiMaroon, fontWeight: '600', marginTop: 3 },
  container: { flex: 1, backgroundColor: colors.sand },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 16,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cid: { fontSize: 12, color: colors.shaktiMaroon, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '700', color: colors.inkNavy, marginTop: 6 },
  desc: { fontSize: 13.5, color: colors.inkGrey, marginTop: 8, lineHeight: 20 },
  voiceNote: { fontSize: 12, color: colors.shaktiMaroon, fontWeight: '700', marginTop: 10 },
  voiceNotePlayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  map: { width: '100%', height: 180, borderRadius: radius.sm, marginTop: 12 },
  gpsCard: { marginTop: 12, backgroundColor: '#FBF6F8', borderRadius: radius.md, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.shaktiMaroon },
  gpsCardLive: { backgroundColor: '#F4F9F6', borderLeftColor: colors.sage },
  gpsHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  gpsHeadText: { fontSize: 11.5, fontWeight: '700', color: colors.shaktiMaroon, letterSpacing: 0.2 },
  gpsPlace: { fontSize: 13, fontWeight: '600', color: colors.inkNavy, lineHeight: 19 },
  gpsPlaceMissing: { fontSize: 12, color: colors.inkLight, fontStyle: 'italic' },
  gpsCoords: { fontSize: 11.5, color: colors.inkGrey, marginTop: 5 },
  gpsUpdated: { fontSize: 11, color: colors.inkLight, marginTop: 3 },
  gpsNavBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, backgroundColor: colors.shaktiMaroon, paddingVertical: 9, borderRadius: radius.md },
  gpsNavBtnText: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoItem: { width: '50%', marginBottom: 10 },
  infoK: { fontSize: 10.5, color: colors.inkLight, fontWeight: '600', textTransform: 'uppercase' },
  infoV: { fontSize: 13, color: colors.inkNavy, fontWeight: '600', marginTop: 2 },
  assignRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  assignBtn: { paddingHorizontal: 16, justifyContent: 'center' },
  pickerWrap: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.inkNavy, marginBottom: 14 },
  tlItem: { flexDirection: 'row', gap: 12 },
  tlDotCol: { alignItems: 'center', width: 22 },
  tlLine: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 4 },
  tlStatus: { fontSize: 14, fontWeight: '700', color: colors.inkLight },
  tlDate: { fontSize: 11, color: colors.inkLight, marginTop: 2 },
  tlOfficer: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon, marginTop: 4 },

  liveBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.sageWash, padding: 10, borderRadius: radius.sm, marginTop: 10 },
  liveDotSmall: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sage },
  liveBadgeText: { fontSize: 11, color: colors.sage, fontWeight: '600', flex: 1 },
  liveShareBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginTop: 12, borderWidth: 1, borderColor: colors.border },
  trackBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: radius.sm, padding: 10, marginTop: -4, marginBottom: 12 },
  trackBannerOn: { backgroundColor: '#F4F9F6', borderLeftWidth: 3, borderLeftColor: colors.sage },
  trackBannerWeak: { backgroundColor: '#FFF8E6', borderLeftWidth: 3, borderLeftColor: '#B26A00' },
  trackText: { flex: 1, fontSize: 11.5, color: colors.sage, fontWeight: '600', lineHeight: 16 },
  liveShareTitle: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  liveShareHint: { fontSize: 11, color: colors.inkGrey, marginTop: 3, lineHeight: 15 },

  priorityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priorityBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  priorityBadgeText: { color: colors.white, fontSize: 11.5, fontWeight: '700' },
  priorityChipRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  priorityChip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  priorityChipText: { fontSize: 11.5, fontWeight: '600', color: colors.inkGrey },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: colors.sageWash, padding: 10, borderRadius: radius.sm },
  verifiedText: { fontSize: 11, color: colors.sage, fontWeight: '600', flex: 1 },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.sage, paddingVertical: 11, borderRadius: radius.md, marginTop: 12 },
  verifyBtnText: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  qrToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, alignSelf: 'flex-start' },
  qrToggleText: { fontSize: 12, fontWeight: '700', color: colors.shaktiMaroon },
  qrBox: { alignItems: 'center', marginTop: 16, backgroundColor: colors.sand, borderRadius: radius.md, padding: 18 },
  qrCaption: { fontSize: 13, fontWeight: '800', color: colors.inkNavy, marginTop: 10, letterSpacing: 1 },
  qrHint: { fontSize: 10.5, color: colors.inkLight, marginTop: 6, textAlign: 'center', lineHeight: 15 },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  checklistLabel: { fontSize: 12.5, color: colors.inkGrey, flex: 1 },
  checklistLabelDone: { color: colors.inkNavy, fontWeight: '600', textDecorationLine: 'line-through' },
  checklistProgress: { fontSize: 11, color: colors.inkLight, marginTop: 10, textAlign: 'right' },
  checklistNote: { fontSize: 11, color: colors.inkLight, fontStyle: 'italic', marginTop: 6 },
  tlNote: {
    fontSize: 12.5,
    color: colors.inkGrey,
    marginTop: 5,
    backgroundColor: colors.sand,
    padding: 8,
    borderRadius: 8,
    lineHeight: 18,
  },
  textarea: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    color: colors.inkNavy,
  },
});
