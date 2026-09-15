import React, { useState, useEffect, useRef } from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import SafePicker from '../components/SafePicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureSetItem, secureGetItem, secureRemoveItem } from '../utils/secureStorage';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import { ensureLocationPermission } from '../utils/locationPermission';
import { sanitizeMobileInput } from '../utils/validators';

// ⚠️ expo-av (आवाज़ रिकॉर्डिंग) भी उसी class का जोखिम रखता है — link न होने पर सुरक्षित तरीके से लोड
let Audio = null;
let AUDIO_RECORDING_AVAILABLE = false;
try {
  const avModule = require('expo-av');
  Audio = avModule.Audio;
  AUDIO_RECORDING_AVAILABLE = true;
} catch (e) {
  // native module उपलब्ध नहीं — आवाज़ रिकॉर्डिंग बटन छुपा रहेगा, बाकी फॉर्म सामान्य रहेगा
}
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { categoryDef, RELATIONSHIP_OPTIONS } from '../data/constants';
import { DISTRICTS, stationsForDistrict } from '../data/districts';
import { PrimaryButton } from '../components/Buttons';
import { useApp } from '../context/AppContext';

// ⚠️ आवाज़-से-टेक्स्ट (speech-to-text) का native module सिर्फ़ पूरी तरह prebuild की गई असली APK
// में उपलब्ध होता है। असल crash log से पता चला — सिर्फ़ require() सफल होना काफ़ी नहीं है; कई बार
// import तो हो जाता है, पर native module का सिर्फ़ खाली "stub" मिलता है (असली functions मौजूद नहीं),
// और हुक (hook) चलने पर "undefined is not a function" क्रैश आता है। इसलिए अब require() के साथ-साथ
// यह भी जांचा जाता है कि ज़रूरी functions सच में मौजूद हैं या नहीं — तभी असली hook इस्तेमाल होता है,
// वरना हमेशा सुरक्षित no-op ही चलता है।
let ExpoSpeechRecognitionModule = null;
let useSpeechRecognitionEvent = () => {}; // native module न हो (या टूटा हो) तो कुछ नहीं करता (no-op)
let SPEECH_TO_TEXT_AVAILABLE = false;
try {
  const speechModule = require('expo-speech-recognition');
  const candidateModule = speechModule.ExpoSpeechRecognitionModule;
  const candidateHook = speechModule.useSpeechRecognitionEvent;
  const looksReal =
    candidateModule &&
    typeof candidateModule.addListener === 'function' &&
    typeof candidateModule.start === 'function' &&
    typeof candidateHook === 'function';
  if (looksReal) {
    ExpoSpeechRecognitionModule = candidateModule;
    useSpeechRecognitionEvent = candidateHook;
    SPEECH_TO_TEXT_AVAILABLE = true;
  }
} catch (e) {
  // require() ही fail हुआ — native module पूरी तरह अनुपलब्ध, no-op fallback इस्तेमाल होगा
}

export default function CategoryComplaintFormScreen({ route, navigation }) {
  const { category } = route.params;
  const def = categoryDef(category);
  const has = (key) => def.fields.includes(key);
  const { user, addComplaint, scheduleCheckinReminder, queueOfflineComplaint, fetchDraft, saveDraftRemote, deleteDraftRemote, appSettings, districtsVersion } = useApp();
  const voiceToTextEnabled = SPEECH_TO_TEXT_AVAILABLE && appSettings?.feature_flags?.voiceToText !== false;
  const audioRecordingEnabled = AUDIO_RECORDING_AVAILABLE && appSettings?.feature_flags?.audioRecording !== false;
  const draftKey = `shaktikop:draft:${category}`;

  const [isSelf, setIsSelf] = useState(true);
  const [victimName, setVictimName] = useState(user?.name || '');
  const [victimFatherName, setVictimFatherName] = useState(user?.fatherName || '');
  const [victimMobile, setVictimMobile] = useState(user?.mobile || '');

  const [district, setDistrict] = useState(DISTRICTS[0]);
  const [policeStation, setPoliceStation] = useState(stationsForDistrict(DISTRICTS[0])[0]);
  const [description, setDescription] = useState('');
  const [incidentLocation, setIncidentLocation] = useState('');
  const [relationship, setRelationship] = useState(RELATIONSHIP_OPTIONS[0]);
  const [accusedName, setAccusedName] = useState('');
  const [accusedMobile, setAccusedMobile] = useState('');
  const [fullAddress, setFullAddress] = useState(isSelf ? user?.address || '' : '');
  const [coords, setCoords] = useState(null);
  const [locationName, setLocationName] = useState(null);
  const [accuracyM, setAccuracyM] = useState(null); // GPS कितना सटीक है (मीटर में)
  const [locBusy, setLocBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);

  // वाहन विवरण (सुरक्षित यात्रा मोड)
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [travelMinutes, setTravelMinutes] = useState('45'); // सुरक्षा-जांच रिमाइंडर के लिए

  // असली आवाज़ रिकॉर्डिंग (expo-av) — अब सभी फॉर्म में विवरण के साथ उपलब्ध
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNoteUri, setVoiceNoteUri] = useState(null);
  // ⚠️ बग फ़िक्स: पहले सर्वर पर voiceNoteUri (डिवाइस की लोकल file:// path) सीधे भेजी
  // जाती थी। यह सिर्फ़ उसी डिवाइस पर काम करती है — Admin/Officer के डिवाइस पर वह
  // फ़ाइल मौजूद ही नहीं होती, इसलिए वे आवाज़ सुन नहीं पाते थे ("आवाज़ चलाई नहीं जा
  // सकी"), और कभी-कभी OS भी temp फ़ाइल हटा देता है तो नागरिक ख़ुद भी नहीं सुन पाता।
  // अब रिकॉर्डिंग रुकते ही उसे base64 data URI में बदल कर रखते हैं — यह हर डिवाइस
  // पर, हमेशा चलता/दिखता रहता है, चाहे मूल फ़ाइल डिलीट हो जाए।
  const [voiceNoteBase64, setVoiceNoteBase64] = useState(null);
  // ⚠️ सुरक्षा सीमा — बैकएंड 5MB तक ही request स्वीकार करता है (base64 में बदलने पर
  // साइज़ ~33% बढ़ जाता है), इसलिए ~3 मिनट से ज़्यादा लंबी रिकॉर्डिंग अपलोड नहीं हो
  // पाएगी। 2 मिनट पर एक सुरक्षित मार्जिन के साथ अपने-आप रुक जाती है, ताकि silently
  // fail न हो और शिकायत सुरक्षित रूप से दर्ज हो सके।
  const MAX_RECORDING_SECONDS = 60;
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef(null);
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);
  const [playbackSound, setPlaybackSound] = useState(null);
  const [isPlayingBack, setIsPlayingBack] = useState(false);

  // बोलकर टाइप करना (speech-to-text) — नागरिक भाषा चुन सकता है
  const [sttLang, setSttLang] = useState('hi-IN'); // 'hi-IN' | 'en-US'
  const [sttActive, setSttActive] = useState(false);
  const sttBaseTextRef = useRef('');

  // ⚠️ असल crash log से पता चला — सिर्फ़ पहले से जांचना काफ़ी नहीं, hook चलते समय भी टूट सकता है।
  // इसलिए हर कॉल को यहीं try/catch में लपेटा गया है — Rules of Hooks नहीं टूटता (फिर भी हर render
  // में एक ही क्रम में, एक जैसी संख्या में hooks चलते हैं), पर अंदर की गड़बड़ी अब बाहर crash नहीं फैलाती।
  const safeUseSttEvent = (eventName, handler) => {
    try {
      useSpeechRecognitionEvent(eventName, handler);
    } catch (e) {
      // native module टूटा/अनुपलब्ध — चुपचाप छोड़ें, आवाज़-से-टेक्स्ट काम नहीं करेगा पर screen नहीं टूटेगी
    }
  };

  safeUseSttEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript || '';
    setDescription((sttBaseTextRef.current + ' ' + transcript).trim());
  });
  safeUseSttEvent('end', () => setSttActive(false));
  safeUseSttEvent('error', () => {
    setSttActive(false);
    Alert.alert(tt('त्रुटि'), tt('आवाज़ पहचानने में समस्या आई, दोबारा कोशिश करें।'));
  });

  const toggleSpeechToText = async () => {
    if (!voiceToTextEnabled) {
      Alert.alert(
        tt('आवाज़-से-टेक्स्ट उपलब्ध नहीं'),
        tt('यह सुविधा इस APK build में उपलब्ध नहीं है — कृपया टाइप करके विवरण भरें।')
      );
      return;
    }
    try {
      if (sttActive) {
        ExpoSpeechRecognitionModule.stop();
        setSttActive(false);
        return;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(tt('अनुमति चाहिए'), tt('आवाज़ पहचानने के लिए माइक्रोफ़ोन एक्सेस दें।'));
        return;
      }
      sttBaseTextRef.current = description;
      ExpoSpeechRecognitionModule.start({
        lang: sttLang,
        interimResults: true,
        continuous: true,
      });
      setSttActive(true);
    } catch (e) {
      setSttActive(false);
      Alert.alert(
        tt('आवाज़-से-टेक्स्ट उपलब्ध नहीं'),
        tt('यह सुविधा सिर्फ़ असली APK build में काम करती है (Expo Go में नहीं) — कृपया टाइप करके विवरण भरें।')
      );
    }
  };

  // ऐप खुलते ही location permission पहले ही मिल चुकी होती है (AppContext) —
  // यहाँ स्क्रीन खुलते ही अपने-आप coordinates ले लेते हैं ताकि यूज़र को बटन न दबाना पड़े
  useEffect(() => {
    getLiveLocation(true);
  }, []);

  // Draft — अगर पहले से अधूरा फॉर्म सेव है (इसी डिवाइस पर, या किसी और डिवाइस से sync होकर) तो पूछकर वापस भर दें
  useEffect(() => {
    (async () => {
      let draft = null;
      try {
        // 🐛 बग फ़िक्स (गंभीर): यह draft (विवरण, पीड़िता का पता आदि — बहुत संवेदनशील)
        // पहले सादे (unencrypted) AsyncStorage में रहता था — बिल्कुल वही डेटा जिसके
        // लिए secureStorage.js का envelope-encryption ख़ास तौर पर बनाया गया था, पर
        // यहां इस्तेमाल ही नहीं हो रहा था। rooted/compromised डिवाइस पर यह draft
        // (शिकायत जमा होने से पहले ही) सादे टेक्स्ट में पढ़ा जा सकता था।
        const localDraft = await secureGetItem(draftKey);

        // सर्वर से भी जांचें — दूसरे डिवाइस पर शुरू किया गया draft भी मिल सके
        let serverDraft = null;
        try {
          const remote = await fetchDraft(category);
          serverDraft = remote?.draft || null;
        } catch (e) {
          // ऑफ़लाइन हैं तो चुपचाप छोड़ें — local draft से काम चलेगा
        }

        draft = serverDraft || localDraft;

        if (draft && Object.keys(draft).length > 0) {
          Alert.alert(tt('अधूरी शिकायत मिली'), tt('पिछली बार भरा अधूरा फॉर्म मिला है (किसी भी डिवाइस से) — क्या उसे वापस भरें?'), [
            {
              text: tt('नहीं, नया शुरू करें'),
              style: 'cancel',
              onPress: () => {
                secureRemoveItem(draftKey).catch(() => {});
                deleteDraftRemote(category).catch(() => {});
              },
            },
            {
              text: tt('हाँ, भरें'),
              onPress: () => {
                if (draft.description !== undefined) setDescription(draft.description);
                if (draft.fullAddress !== undefined) setFullAddress(draft.fullAddress);
                if (draft.incidentLocation !== undefined) setIncidentLocation(draft.incidentLocation);
                if (draft.district) setDistrict(draft.district);
                if (draft.policeStation) setPoliceStation(draft.policeStation);
                if (draft.relationship) setRelationship(draft.relationship);
                if (draft.vehicleNumber !== undefined) setVehicleNumber(draft.vehicleNumber);
                if (draft.fromLocation !== undefined) setFromLocation(draft.fromLocation);
                if (draft.toLocation !== undefined) setToLocation(draft.toLocation);
              },
            },
          ]);
        }
      } catch (e) {
        // ignore
      }
      setDraftChecked(true);
    })();
  }, []);

  // हर बदलाव पर draft सेव करते रहें — डिवाइस पर तुरंत, और सर्वर पर भी (multi-device sync के लिए)
  useEffect(() => {
    if (!draftChecked) return;
    const snapshot = { description, fullAddress, incidentLocation, district, policeStation, relationship, vehicleNumber, fromLocation, toLocation };
    // 🔒 draft में भी पीड़िता का विवरण होता है — बिना encryption सेव न हो
    secureSetItem(draftKey, snapshot, { allowPlaintextFallback: false }).catch(() => {});
    saveDraftRemote(category, snapshot).catch(() => {}); // ऑफ़लाइन हों तो चुपचाप छूट जाए, अगली बार sync हो जाएगा
  }, [draftChecked, description, fullAddress, incidentLocation, district, policeStation, relationship, vehicleNumber, fromLocation, toLocation]);

  const toggleSelf = (val) => {
    setIsSelf(val);
    if (val) {
      setVictimName(user?.name || '');
      setVictimFatherName(user?.fatherName || '');
      setVictimMobile(user?.mobile || '');
      setFullAddress(user?.address || '');
    } else {
      setVictimName('');
      setVictimFatherName('');
      setVictimMobile('');
      setFullAddress('');
    }
  };

  const onDistrictChange = (d) => {
    setDistrict(d);
    setPoliceStation(stationsForDistrict(d)[0]);
  };

  const getLiveLocation = async (silent = false) => {
    setLocBusy(true);
    try {
      const perm = await ensureLocationPermission();
      if (!perm.granted) {
        if (!silent) Alert.alert(tt('अनुमति चाहिए'), tt('लाइव लोकेशन के लिए सेटिंग्स में जाकर ShaktiCop को Location की अनुमति दें।'));
        setLocBusy(false);
        return;
      }

      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        if (!silent) Alert.alert(tt('GPS बंद है'), tt('कृपया फोन की Location/GPS सेटिंग ऑन करें, फिर दोबारा कोशिश करें।'));
        setLocBusy(false);
        return;
      }

      // 🎯 सटीक लोकेशन के लिए Accuracy.Highest — यह असली GPS satellite fix लेता है (~5-10 मीटर)।
      // पहले Balanced था, जो सिर्फ़ WiFi/मोबाइल टावर से अंदाज़ा लगाता था (~100 मीटर तक की ग़लती)।
      // GPS शुरू में मोटा fix देकर धीरे-धीरे सुधरता है, इसलिए 20 सेकंड तक बेहतर fix का इंतज़ार करते हैं।
      const getAccurateFix = () =>
        new Promise((resolve, reject) => {
          let best = null;
          let sub = null;
          let done = false;

          const finish = () => {
            if (done) return;
            done = true;
            if (sub) sub.remove();
            best ? resolve(best) : reject(new Error('no-fix'));
          };

          // 20 सेकंड की ऊपरी सीमा — तब तक जो सबसे अच्छा fix मिला, वही लेते हैं
          const hardStop = setTimeout(finish, 20000);

          Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 },
            (p) => {
              if (!best || (p.coords.accuracy ?? 9999) < (best.coords.accuracy ?? 9999)) best = p;
              // 15 मीटर या बेहतर मिल गया तो और इंतज़ार की ज़रूरत नहीं
              if ((best.coords.accuracy ?? 9999) <= 15) {
                clearTimeout(hardStop);
                finish();
              }
            }
          )
            .then((s) => {
              sub = s;
              if (done) s.remove();
            })
            .catch(() => {
              clearTimeout(hardStop);
              reject(new Error('watch-failed'));
            });
        });

      let pos;
      try {
        pos = await getAccurateFix();
      } catch (fixErr) {
        // watch न चले तो सीधे एक बार high-accuracy fix लेने की कोशिश
        try {
          // 🐛 बग फ़िक्स: इस fallback पर कोई समय-सीमा नहीं थी — GPS अटकने पर फ़ॉर्म
          // हमेशा के लिए अटका रह जाता। यहां जान-बूझकर साझा getPositionWithTimeout()
          // इस्तेमाल *नहीं* किया गया: उसका cached-fallback ढीला (बिना maxAge/accuracy
          // सीमा का) है, जो आपात-SOS के लिए तो सही है, पर यहां नहीं — यहां लोकेशन
          // शिकायत पर स्थायी रूप से दर्ज होती है, इसलिए नीचे वाली सख़्त जांच (2 मिनट/
          // 100 मीटर) ही लगनी चाहिए। इसलिए सिर्फ़ समय-सीमा जोड़ी है, बाक़ी शृंखला वैसी ही।
          const timedOut = Symbol('timeout');
          const fix = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
            new Promise((r) => setTimeout(() => r(timedOut), 15000)),
          ]);
          if (fix === timedOut) throw new Error('timeout');
          pos = fix;
        } catch (e2) {
          // आख़िरी उपाय — पर सिर्फ़ ताज़ा (2 मिनट के अंदर) और ठीक-ठाक सटीक (100 मी) लोकेशन ही स्वीकार करें,
          // वरना घंटों पुरानी, कई किलोमीटर दूर की जगह दर्ज हो जाती थी
          const last = await Location.getLastKnownPositionAsync({
            maxAge: 120000,
            requiredAccuracy: 100,
          });
          if (last) {
            pos = last;
          } else {
            throw new Error('GPS से सटीक स्थान नहीं मिल सका — खुले आसमान के नीचे जाकर दोबारा कोशिश करें।');
          }
        }
      }

      const acc = pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null;
      setAccuracyM(acc);
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      try {
        const places = await Location.reverseGeocodeAsync(pos.coords);
        if (places && places[0]) {
          const p = places[0];
          const readable = [p.name, p.street, p.district, p.subregion, p.city, p.region, p.postalCode]
            .filter(Boolean)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join(', ');
          setLocationName(readable || null);
          // "पूरा पता" अब हमेशा लाइव लोकेशन के नाम से अपने-आप भर जाता है
          if (readable) setFullAddress(readable);
        }
      } catch (e) {
        setLocationName(null);
      }
      if (!silent) {
        Alert.alert(
          tt('✔ लोकेशन मिल गई'),
          acc != null
            ? `${tt('आपकी लाइव लोकेशन जोड़ दी गई है')} (${tt('लगभग')} ±${acc} ${tt('मीटर सटीक')})।`
            : tt('आपकी लाइव लोकेशन जोड़ दी गई है।')
        );
      }
    } catch (e) {
      console.log('Location error:', e.message);
      if (!silent) Alert.alert(tt('त्रुटि'), tt(e.message) || tt('लाइव लोकेशन प्राप्त नहीं हो सकी — GPS ऑन है यह जांचें।'));
    }
    setLocBusy(false);
  };

  const startRecording = async () => {
    if (!audioRecordingEnabled) {
      Alert.alert(tt('आवाज़ रिकॉर्डिंग उपलब्ध नहीं'), tt('यह सुविधा इस APK build में उपलब्ध नहीं है — बाकी फॉर्म सामान्य रूप से भरें।'));
      return;
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(tt('अनुमति चाहिए'), tt('आवाज़ रिकॉर्ड करने के लिए माइक्रोफ़ोन एक्सेस दें।'));
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s + 1 >= MAX_RECORDING_SECONDS) {
            // सुरक्षित सीमा पार होने से ठीक पहले अपने-आप रोक दें
            stopRecording();
            return MAX_RECORDING_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('रिकॉर्डिंग शुरू नहीं हो सकी।'));
    }
  };

  const stopRecording = async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      // 🐛 बग फ़िक्स: रिकॉर्डिंग के दौरान allowsRecordingIOS: true सेट होता है — यह मोड
      // रिकॉर्डिंग रुकने के बाद भी सक्रिय रहता था, जिस वजह से iOS पर आवाज़ बहुत धीमे
      // earpiece (कॉल-स्पीकर) से बजती थी, सामान्य तेज़ स्पीकर से नहीं — सुनने में लगता
      // था जैसे "आवाज़ चल ही नहीं रही"। अब रिकॉर्डिंग रुकते ही playback-मोड पर वापस लाते हैं।
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const uri = recording.getURI();
      setVoiceNoteUri(uri);
      // तुरंत base64 में बदल लेते हैं — सबमिट होने तक फ़ाइल डिलीट भी हो जाए तो कोई फ़र्क़ नहीं पड़ता
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        setVoiceNoteBase64(`data:audio/m4a;base64,${base64}`);
      } catch (convErr) {
        // base64 न बन पाए तो भी local URI से इसी डिवाइस पर सुनना/सबमिट करना जारी रहेगा
      }
    } catch (e) {
      // ignore
    }
    setRecording(null);
    setIsRecording(false);
  };

  const playPauseRecording = async () => {
    try {
      if (isPlayingBack && playbackSound) {
        await playbackSound.pauseAsync();
        setIsPlayingBack(false);
        return;
      }
      if (playbackSound) {
        await playbackSound.playAsync();
        setIsPlayingBack(true);
        return;
      }
      // सुरक्षा — playback से पहले सुनिश्चित करें कि हम recording-mode में न हों (loud speaker से बजे)
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: voiceNoteBase64 || voiceNoteUri });
      setPlaybackSound(sound);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlayingBack(false);
          sound.setPositionAsync(0);
        }
      });
      setIsPlayingBack(true);
      await sound.playAsync();
    } catch (e) {
      Alert.alert(tt('त्रुटि'), tt('रिकॉर्डिंग चलाई नहीं जा सकी।'));
    }
  };

  const deleteRecording = async () => {
    if (playbackSound) {
      await playbackSound.unloadAsync().catch(() => {});
      setPlaybackSound(null);
    }
    setIsPlayingBack(false);
    setVoiceNoteUri(null);
    setVoiceNoteBase64(null);
    setRecordSeconds(0);
  };

  // रिकॉर्डिंग के बीच में ही रद्द/रीसेट — बिना सेव किए, ताकि नागरिक फिर से शुरुआत कर सके
  const cancelRecording = async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    try {
      if (recording) await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    } catch (e) {
      // ignore
    }
    setRecording(null);
    setIsRecording(false);
    setRecordSeconds(0);
    setVoiceNoteUri(null);
    setVoiceNoteBase64(null);
  };

  const submit = async () => {
    // 🐛 बग फ़िक्स: सिर्फ़ बटन पर loading={submitting} काफ़ी नहीं था — React की state
    // update तुरंत (synchronous) नहीं होती, इसलिए बटन दबाने और असल में disable होने के
    // बीच एक बहुत छोटा सा समय-अंतराल होता है। अगर उसी बीच कोई तेज़ी से दोबारा टैप कर दे,
    // submit() दो बार चल जाता और शिकायत दो बार दर्ज हो जाती। अब यहीं function के अंदर,
    // सबसे पहले ही, सीधे जांच होती है — यह React के render-timing पर निर्भर नहीं है,
    // इसलिए हमेशा भरोसेमंद तरीक़े से दूसरी बार चलने से रोकता है, चाहे टैप कितनी भी तेज़ी
    // से क्यों न हो।
    if (submitting) return;

    if (!fullAddress.trim() && !coords) {
      Alert.alert(tt('जानकारी चाहिए'), tt('कृपया पता लिखें या लाइव लोकेशन ऑन करें।'));
      return;
    }
    if (has('description') && !description.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('कृपया शिकायत का विवरण लिखें।'));
      return;
    }
    if (has('voiceRecording') && !voiceNoteUri) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('कृपया 🎤 दबाकर अपनी शिकायत बोलकर रिकॉर्ड करें।'));
      return;
    }
    if (has('vehicle') && !vehicleNumber.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('वाहन नंबर आवश्यक है।'));
      return;
    }
    if (!isSelf && !victimName.trim()) {
      Alert.alert(tt('जानकारी अधूरी है'), tt('पीड़ित/शिकायतकर्ता का नाम आवश्यक है।'));
      return;
    }

    let extraDetails = null;
    if (has('vehicle')) {
      // 🐛 बग फ़िक्स: travelMinutes पहले सिर्फ़ device पर local reminder शेड्यूल करने के
      // लिए इस्तेमाल होता था, बैकएंड को कभी भेजा ही नहीं जाता था — इसलिए सर्वर को कभी
      // पता ही नहीं चलता था "यात्रा कब तक की उम्मीद है"। नतीजा: पूरी सुरक्षा-जांच
      // व्यवस्था 100% नागरिक के अपने फ़ोन के local notification पर निर्भर थी — अगर फ़ोन
      // रीस्टार्ट हो जाए, notification अनुमति बंद हो जाए, या OS उसे रोक दे — किसी को
      // पता ही नहीं चलता। अब यह सर्वर को भी भेजी जाती है ताकि एक बैकअप जांच (नीचे
      // escalation.js में) भी चल सके।
      extraDetails = { vehicleNumber: vehicleNumber.trim(), fromLocation: fromLocation.trim(), toLocation: toLocation.trim(), travelMinutes: Number(travelMinutes) || 45 };
    } else if (has('relationship')) {
      extraDetails = { relationshipToAccused: relationship };
    }

    setSubmitting(true);
    let created;
    let wasOffline = false;
    try {
      created = await addComplaint({
        category,
        description: description.trim() || null,
        district: has('district') ? district : null,
        policeStation: has('policeStation') ? policeStation : null,
        location: fullAddress.trim() || null,
        incidentLocation: incidentLocation.trim() || null,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        voiceNoteUrl: voiceNoteBase64 || voiceNoteUri,
        extraDetails,
        isSelf,
        victimName: victimName.trim(),
        victimFatherName: victimFatherName.trim(),
        victimAddress: fullAddress.trim(),
        victimMobile: victimMobile.trim(),
        isAnonymous: false,
        // 🆕 दोहराए-आरोपी पहचान के लिए — पूरी तरह वैकल्पिक, सिर्फ़ भरा हो तो भेजते हैं
        accusedName: has('relationship') && accusedName.trim() ? accusedName.trim() : undefined,
        accusedMobile: has('relationship') && accusedMobile.trim() ? accusedMobile.trim() : undefined,
      });
    } catch (e) {
      // इंटरनेट न होने पर fetch सामान्यतः यही संदेश देता है — तब शिकायत डिवाइस पर सुरक्षित कर देते हैं
      const looksOffline = /network request failed/i.test(e.message || '');
      if (looksOffline) {
        // 🔒 अब queueOfflineComplaint विफल भी हो सकता है — अगर डिवाइस पर encryption
        // उपलब्ध न हो, तो पीड़िता का विवरण बिना encryption के डिस्क पर नहीं लिखा जाता
        // (देखें utils/secureStorage.js)। ऐसी स्थिति में चुपचाप आगे बढ़ना सबसे बुरा
        // होता — spinner अटका रह जाता और नागरिक समझती कि शिकायत सुरक्षित हो गई है,
        // जबकि वह कहीं सेव ही नहीं हुई। इसलिए यहाँ साफ़ बताया जाता है।
        try {
        created = await queueOfflineComplaint({
          category,
          description: description.trim() || null,
          district: has('district') ? district : null,
          policeStation: has('policeStation') ? policeStation : null,
          location: fullAddress.trim() || null,
          incidentLocation: incidentLocation.trim() || null,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          voiceNoteUrl: voiceNoteBase64 || voiceNoteUri,
          extraDetails,
          isSelf,
          victimName: victimName.trim(),
          victimFatherName: victimFatherName.trim(),
          victimAddress: fullAddress.trim(),
          victimMobile: victimMobile.trim(),
          isAnonymous: false,
          accusedName: has('relationship') && accusedName.trim() ? accusedName.trim() : undefined,
          accusedMobile: has('relationship') && accusedMobile.trim() ? accusedMobile.trim() : undefined,
        });
        wasOffline = true;
        } catch (queueErr) {
          setSubmitting(false);
          Alert.alert(
            tt('शिकायत सुरक्षित नहीं हो सकी'),
            tt('इंटरनेट भी नहीं है और इस डिवाइस पर आपकी जानकारी सुरक्षित तरीक़े से सहेजी नहीं जा सकी। आपका विवरण फ़ॉर्म में जस का तस है — इंटरनेट आते ही दोबारा भेजें। तुरंत मदद चाहिए तो 112 या 1090 पर कॉल करें।')
          );
          return;
        }
      } else {
        setSubmitting(false);
        Alert.alert(tt('त्रुटि'), e.message);
        return;
      }
    }    setSubmitting(false);
    secureRemoveItem(draftKey).catch(() => {});
    deleteDraftRemote(category).catch(() => {});

    if (wasOffline) {
      Alert.alert(
        tt('📴 इंटरनेट नहीं मिला'),
        tt('आपकी शिकायत डिवाइस पर सुरक्षित कर ली गई है — इंटरनेट वापस आते ही यह अपने-आप भेज दी जाएगी। कृपया थोड़ी देर बाद डैशबोर्ड में देखें।'),
        [{ text: tt('ठीक है'), onPress: () => navigation.navigate('CitizenTabs') }]
      );
      return;
    }

    if (category === 'सुरक्षित यात्रा मोड') {
      scheduleCheckinReminder(created.id, Number(travelMinutes) || 45);
      Alert.alert(
        tt('शिकायत दर्ज हुई'),
        `${tt('आपकी शिकायत ID:')} ${created.id}\n\n${tt('यात्रा के दौरान असुरक्षित महसूस हो तो शिकायत विवरण खोलकर SOS बटन दबाएं। कुछ समय बाद हम आपसे पूछेंगे कि आप सुरक्षित पहुँचे या नहीं।')}`,
        [{ text: tt('ठीक है'), onPress: () => navigation.navigate('ComplaintDetail', { id: created.id }) }]
      );
    } else {
      Alert.alert(tt('शिकायत दर्ज हुई'), `${tt('आपकी शिकायत ID:')} ${created.id}`, [
        { text: tt('ठीक है'), onPress: () => navigation.navigate('CitizenTabs') },
      ]);
    }
  };

  return (
    // 🆕 KeyboardAvoidingView — landscape mein keyboard screen की ऊंचाई का बड़ा
    // हिस्सा ले लेता है; इसके बिना जिस फ़ील्ड में टाइप हो रहा हो वह keyboard के
    // पीछे छुप सकती थी (जैसे कट गई/crop हो गई दिखती)। यह सबसे ज़्यादा इस्तेमाल
    // होने वाला फ़ॉर्म है (शिकायत दर्ज करना), इसलिए यहां से शुरुआत की गई है।
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={styles.h2}>{def.label}</Text>
      <Text style={styles.sub}>{def.desc}</Text>

      <View style={styles.toggleRow}>
        <TouchableOpacity style={[styles.toggleBtn, isSelf && styles.toggleBtnActive]} onPress={() => toggleSelf(true)}>
          <Text style={[styles.toggleText, isSelf && styles.toggleTextActive]}>{tt('अपने लिए')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, !isSelf && styles.toggleBtnActive]} onPress={() => toggleSelf(false)}>
          <Text style={[styles.toggleText, !isSelf && styles.toggleTextActive]}>{tt('किसी और के लिए')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('व्यक्तिगत विवरण')}</Text>
        <Field label={tt('नाम')}>
          <TextInput style={styles.input} value={victimName} onChangeText={setVictimName} editable={!isSelf} placeholder={tt('पूरा नाम')} maxLength={80} />
        </Field>
        {has('victim') && (
          <Field label={tt('पिता/पति का नाम (वैकल्पिक)')}>
            <TextInput style={styles.input} value={victimFatherName} onChangeText={setVictimFatherName} editable={!isSelf} placeholder={tt('वैकल्पिक')} maxLength={80} />
          </Field>
        )}
        <Field label={tt('मोबाइल नंबर')}>
          <TextInput style={styles.input} value={victimMobile} onChangeText={setVictimMobile} editable={!isSelf} keyboardType="number-pad" maxLength={10} />
        </Field>

        {(has('district') || has('policeStation')) && (
          <>
            <Text style={styles.instructionLine}>{tt('घटनास्थल का जिला व थाना चयन करें')}</Text>
            <View style={styles.row2}>
              {has('district') && (
                <View style={{ flex: 1 }}>
                  <Field label={tt('ज़िला')}>
                    <View style={styles.pickerWrap}>
                      <SafePicker key={`d-${districtsVersion}`} selectedValue={district} onValueChange={onDistrictChange} items={DISTRICTS} />
                    </View>
                  </Field>
                </View>
              )}
              {has('policeStation') && (
                <View style={{ flex: 1 }}>
                  <Field label={tt('थाना')}>
                    <View style={styles.pickerWrap}>
                      <SafePicker key={`s-${district}-${districtsVersion}`} selectedValue={policeStation} onValueChange={setPoliceStation} items={stationsForDistrict(district)} />
                    </View>
                  </Field>
                </View>
              )}
            </View>
          </>
        )}

        {has('location') && (
          <Field label={tt('पूरा पता (लाइव लोकेशन से अपने-आप भरेगा)')}>
            <TextInput style={styles.input} value={fullAddress} onChangeText={setFullAddress} placeholder="नीचे 'लाइव लोकेशन जोड़ें' दबाएं — पता यहाँ अपने-आप आ जाएगा" multiline maxLength={300} />
          </Field>
        )}
      </View>

      {has('relationship') && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('आरोपी से संबंध')}</Text>
          <Text style={styles.hint}>{tt('आरोपी पीड़िता से क्या संबंध रखता है?')}</Text>
          <View style={[styles.pickerWrap, { marginTop: 8 }]}>
            <SafePicker selectedValue={relationship} onValueChange={setRelationship} items={RELATIONSHIP_OPTIONS} />
          </View>
          {/* 🆕 आरोपी का नाम/मोबाइल — पूरी तरह वैकल्पिक। अगर पता हो तो देना मददगार है:
              इससे पुलिस यह पहचान सकती है कि क्या इसी व्यक्ति के ख़िलाफ़ पहले भी किसी और
              ने शिकायत दर्ज की थी (दोहराए-आरोपी पैटर्न) — छोड़ भी सकते हैं। */}
          <Field label={`${tt('आरोपी का नाम')} (${tt('वैकल्पिक')})`}>
            <TextInput style={styles.input} value={accusedName} onChangeText={setAccusedName} placeholder={tt('अगर पता हो')} />
          </Field>
          <Field label={`${tt('आरोपी का मोबाइल नंबर')} (${tt('वैकल्पिक')})`}>
            <TextInput
              style={styles.input}
              value={accusedMobile}
              onChangeText={(t) => setAccusedMobile(sanitizeMobileInput(t))}
              placeholder={tt('अगर पता हो — 10 अंक')}
              keyboardType="number-pad"
              maxLength={10}
            />
          </Field>
        </View>
      )}

      {has('description') && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('शिकायत का विवरण')}</Text>
          <TextInput
            style={styles.textarea}
            placeholder={tt('घटना का विस्तृत विवरण लिखें…')}
            multiline
            numberOfLines={5}
            value={description}
            onChangeText={setDescription}
            maxLength={1000}
          />
        </View>
      )}

      {has('vehicle') && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('वाहन विवरण')}</Text>
          <Field label={tt('वाहन नंबर')}>
            <TextInput style={styles.input} value={vehicleNumber} onChangeText={setVehicleNumber} placeholder={tt('जैसे — UP32 AB 1234')} autoCapitalize="characters" maxLength={15} />
          </Field>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Field label={tt('कहाँ से (From)')}>
                <TextInput style={styles.input} value={fromLocation} onChangeText={setFromLocation} maxLength={300} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label={tt('कहाँ तक (To)')}>
                <TextInput style={styles.input} value={toLocation} onChangeText={setToLocation} maxLength={300} />
              </Field>
            </View>
          </View>
          {/* 🐛 बग फ़िक्स: पहले "सुरक्षा जांच" रिमाइंडर हमेशा एक जैसे तय समय (~45 मिनट)
              पर आता था, चाहे यात्रा 10 मिनट की हो या 3 घंटे की — क्योंकि यात्रा की
              दूरी/समय कभी लिया ही नहीं जाता था। अब नागरिक खुद अपनी यात्रा का अनुमानित
              समय चुनता है, और रिमाइंडर उसी हिसाब से (+15 मिनट बफ़र के साथ) आता है। */}
          <Field label={tt('अनुमानित यात्रा समय — इसी अनुसार सुरक्षा-जांच रिमाइंडर आएगा')}>
            <View style={styles.pickerWrap}>
              <SafePicker
                selectedValue={travelMinutes}
                onValueChange={setTravelMinutes}
                items={[
                  { label: tt('15 मिनट'), value: '15' },
                  { label: tt('30 मिनट'), value: '30' },
                  { label: tt('45 मिनट'), value: '45' },
                  { label: tt('1 घंटा'), value: '60' },
                  { label: tt('1.5 घंटे'), value: '90' },
                  { label: tt('2 घंटे'), value: '120' },
                  { label: tt('3 घंटे या अधिक'), value: '180' },
                ]}
              />
            </View>
          </Field>
        </View>
      )}

      {has('voiceRecording') && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('अपनी शिकायत बोलकर दर्ज करें')}</Text>
          <Text style={styles.hint}>{tt('🎤 दबाकर बोलना शुरू करें, फिर रोकें — सुनकर पक्का करें, ग़लत हो तो हटाकर दोबारा रिकॉर्ड करें।')}</Text>

          {!voiceNoteUri && (
            <>
              <TouchableOpacity
                style={[styles.bigMicBtn, isRecording && styles.bigMicBtnActive]}
                onPress={isRecording ? stopRecording : startRecording}
              >
                <Ionicons name={isRecording ? 'stop-circle' : 'mic'} size={40} color={colors.white} />
                <Text style={styles.bigMicBtnText}>
                  {isRecording
                    ? `${tt('रोकने के लिए दबाएं')} · ${String(Math.floor(recordSeconds / 60)).padStart(1, '0')}:${String(recordSeconds % 60).padStart(2, '0')} / 1:00`
                    : tt('बोलना शुरू करने के लिए दबाएं')}
                </Text>
              </TouchableOpacity>
              {isRecording && (
                <TouchableOpacity style={styles.cancelRecordBtn} onPress={cancelRecording}>
                  <Ionicons name="close-circle-outline" size={15} color={colors.inkGrey} />
                  <Text style={styles.cancelRecordBtnText}>{tt('रद्द करके रीसेट करें')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {voiceNoteUri && (
            <View style={styles.playbackRow}>
              <TouchableOpacity style={styles.playbackBtn} onPress={playPauseRecording}>
                <Ionicons name={isPlayingBack ? 'pause' : 'play'} size={20} color={colors.white} />
              </TouchableOpacity>
              <Text style={styles.playbackLabel}>{tt('✔ रिकॉर्डिंग तैयार है')}</Text>
              <TouchableOpacity style={styles.resetBtn} onPress={deleteRecording}>
                <Ionicons name="refresh" size={15} color={colors.alert} />
                <Text style={styles.resetBtnText}>{tt('रीसेट')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{tt('लाइव लोकेशन')}</Text>
        <TouchableOpacity style={styles.locBtn} onPress={() => getLiveLocation(false)} disabled={locBusy}>
          <Ionicons name="location-outline" size={16} color={colors.shaktiMaroon} />
          <Text style={styles.locBtnText}>
            {locBusy ? 'लोकेशन प्राप्त हो रही है…' : coords ? 'लाइव लोकेशन जुड़ गई ✓' : 'लाइव लोकेशन जोड़ें'}
          </Text>
        </TouchableOpacity>
        {coords && (
          <View style={styles.locResultBox}>
            {locationName ? (
              <View style={styles.locNameRow}>
                <Ionicons name="navigate-circle" size={15} color={colors.sage} />
                <Text style={styles.locNameText}>{locationName}</Text>
              </View>
            ) : (
              <Text style={styles.locNameMissing}>{tt('जगह का नाम नहीं मिल सका (इंटरनेट जांचें) — coordinates सुरक्षित हैं')}</Text>
            )}
            <Text style={styles.coordsText}>
              अक्षांश {coords.latitude.toFixed(6)} · देशांतर {coords.longitude.toFixed(6)}
            </Text>
            {accuracyM != null && (
              <Text style={accuracyM <= 30 ? styles.accGood : styles.accWeak}>
                {accuracyM <= 30
                  ? `🎯 सटीकता: ±${accuracyM} मीटर`
                  : `⚠ सटीकता कमज़ोर: ±${accuracyM} मीटर — खुली जगह पर जाकर दोबारा दबाएं`}
              </Text>
            )}
          </View>
        )}
        <Text style={styles.hint}>{tt('इससे अधिकारी/एडमिन आपकी सही जगह नक्शे पर देख सकेंगे।')}</Text>
      </View>

      <PrimaryButton title={submitting ? tt('दर्ज हो रही है…') : tt('शिकायत दर्ज करें')} onPress={submit} loading={submitting} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sand },
  h2: { fontSize: 18, fontWeight: '800', color: colors.inkNavy },
  sub: { fontSize: 12.5, color: colors.inkGrey, marginTop: 4, marginBottom: 14, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: 12, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.inkNavy },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.inkGrey },
  toggleTextActive: { color: colors.white },
  anonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  anonTitle: { fontSize: 13.5, fontWeight: '700', color: colors.inkNavy },
  anonSub: { fontSize: 11, color: colors.inkGrey, marginTop: 2, lineHeight: 15 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 14,
    shadowColor: colors.inkNavy,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.inkNavy, marginBottom: 12 },
  instructionLine: { fontSize: 12, color: colors.shaktiMaroon, fontWeight: '700', marginBottom: 10 },
  field: { marginBottom: 14 },
  row2: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 12.5, fontWeight: '600', color: colors.inkGrey, marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14.5,
    color: colors.inkNavy,
  },
  pickerWrap: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  textarea: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 14.5,
    color: colors.inkNavy,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  hint: { fontSize: 11, color: colors.inkLight, marginTop: 8 },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.shaktiMaroon,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
  recordBtnActive: { backgroundColor: colors.alert },
  recordBtnText: { color: colors.white, fontSize: 13.5, fontWeight: '700' },
  recordBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.shaktiMaroon,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginTop: 8,
  },
  recordBtnOutlineText: { color: colors.shaktiMaroon, fontSize: 12.5, fontWeight: '700' },
  bigMicBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.shaktiMaroon,
    paddingVertical: 28,
    borderRadius: radius.lg,
  },
  bigMicBtnActive: { backgroundColor: colors.alert },
  bigMicBtnText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  cancelRecordBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 10, paddingVertical: 8 },
  cancelRecordBtnText: { color: colors.inkGrey, fontSize: 12, fontWeight: '600' },
  playbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.sand,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 4,
  },
  playbackBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.shaktiMaroon, alignItems: 'center', justifyContent: 'center' },
  playbackLabel: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.sage },
  deleteBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.alertWash, alignItems: 'center', justifyContent: 'center' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.alertWash, borderRadius: 17, paddingHorizontal: 12, paddingVertical: 8 },
  resetBtnText: { color: colors.alert, fontSize: 11.5, fontWeight: '700' },
  langToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  langToggleLabel: { fontSize: 12, color: colors.inkGrey, fontWeight: '600' },
  langChip: { backgroundColor: colors.sand, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  langChipActive: { backgroundColor: colors.inkNavy, borderColor: colors.inkNavy },
  langChipText: { fontSize: 11.5, fontWeight: '700', color: colors.inkGrey },
  langChipTextActive: { color: colors.white },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.shaktiMaroonWash,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  locBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.shaktiMaroon },
  coordsText: { fontSize: 11, color: colors.inkLight, marginTop: 6 },
  locResultBox: { marginTop: 10, backgroundColor: '#F4F9F6', borderRadius: radius.md, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.sage },
  locNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  locNameText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.inkNavy, lineHeight: 18 },
  locNameMissing: { fontSize: 11.5, color: colors.inkLight, fontStyle: 'italic' },
  accGood: { fontSize: 11.5, color: colors.sage, fontWeight: '700', marginTop: 4 },
  accWeak: { fontSize: 11.5, color: '#B26A00', fontWeight: '700', marginTop: 4 },
});
