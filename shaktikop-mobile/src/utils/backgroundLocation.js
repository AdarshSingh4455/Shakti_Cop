import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL, getToken, performRefresh } from '../services/api';
import { tt } from '../context/LocaleContext';

// ============================================================
// पृष्ठभूमि (background) लोकेशन — सुरक्षित यात्रा व SOS के लिए।
//
// ⚠️ यही इस पूरे feature की जान है। पहले लोकेशन सिर्फ़ तब भेजी जाती थी जब
// शिकायत की स्क्रीन खुली हो — यानी फ़ोन जेब में रखते ही ट्रैकिंग रुक जाती थी।
// असली यात्रा में तो फ़ोन जेब/पर्स में ही रहता है, इसलिए वह मोड व्यवहार में
// काम ही नहीं करता था। अब स्क्रीन बंद रहने पर भी लोकेशन पुलिस तक पहुँचती है।
//
// expo-task-manager native module है — अगर किसी build में उपलब्ध न हो तो
// यहीं संभाल लिया गया है; ऐप चलता रहेगा, बस background ट्रैकिंग नहीं होगी
// (स्क्रीन खुली रहने पर पुरानी व्यवस्था तब भी काम करती है)।
// ============================================================

export const LOCATION_TASK = 'shaktikop-live-location';
// ⚠️ यहां पहले एक अपना TOKEN_KEY = 'shaktikop:token' रखा था — वही पुराना/बासी key
// इस feature के चुपचाप बंद पड़ जाने की वजह बना (देखें नीचे task में बग-फ़िक्स नोट)।
// अब token हमेशा api.js के साझा getToken() से आता है, इसलिए यहां कोई अलग key नहीं।
const ACTIVE_KEY = 'shaktikop:liveTrackingComplaintId';

let TaskManager = null;
let TASK_AVAILABLE = false;
try {
  // eslint-disable-next-line global-require
  TaskManager = require('expo-task-manager');
  TASK_AVAILABLE = !!(TaskManager && TaskManager.defineTask);
} catch (e) {
  TASK_AVAILABLE = false;
}

export const BACKGROUND_LOCATION_AVAILABLE = TASK_AVAILABLE;

// ---- task की परिभाषा ----
// यह module-स्तर पर, App शुरू होते ही रजिस्टर होनी चाहिए — तभी OS
// ऐप बंद होने के बाद भी इसे बुला पाता है।
if (TASK_AVAILABLE) {
  try {
    TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      try {
        // 🐛 बग फ़िक्स (सुरक्षा-गंभीर — यह पूरा feature चुपचाप बंद पड़ा था):
        // पहले यहां token सीधे AsyncStorage से, एक हार्डकोडेड पुराने key
        // ('shaktikop:token') से पढ़ा जाता था। लेकिन ऐप का token तब से SecureStore
        // में (नए key 'shaktikop_token' के साथ) चला गया है, और api.js का migration
        // पुराने AsyncStorage key को पढ़कर *हटा* देता है। यानी असल में यहां हमेशा
        // null मिलता, और नीचे वाली जांच पर task चुपचाप लौट जाता — पुलिस तक एक भी
        // background लोकेशन कभी पहुँचती ही नहीं थी, जबकि फ़ोन पर "ट्रैकिंग चालू"
        // वाली सूचना दिखती रहती। महिला-सुरक्षा ऐप में यह सबसे भारी चूक थी।
        // अब वही साझा getToken() इस्तेमाल होता है जो बाक़ी पूरा ऐप करता है।
        const [complaintId, token] = await Promise.all([
          AsyncStorage.getItem(ACTIVE_KEY),
          getToken(),
        ]);
        if (!complaintId || !token) return;

        // सबसे नया व सबसे सटीक fix चुनें
        const best = data.locations.reduce((a, b) =>
          (b.coords.accuracy ?? 9999) < (a.coords.accuracy ?? 9999) ? b : a
        );

        const body = JSON.stringify({
          active: true,
          latitude: best.coords.latitude,
          longitude: best.coords.longitude,
          accuracy: best.coords.accuracy ?? null,
        });
        const send = (bearer) =>
          fetch(`${BASE_URL}/complaints/${complaintId}/live-location`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
            body,
          });

        let res = await send(token);
        // 🐛 बग फ़िक्स: पहले जवाब की status कभी जांची ही नहीं जाती थी। access token
        // सिर्फ़ 1 घंटे चलता है — लंबी यात्रा (बस/ट्रेन) में वह बीच रास्ते ख़त्म हो
        // जाता, हर update 401 लौटाती, और वह चुपचाप निगल ली जाती। बाक़ी ऐप में यह
        // refresh-और-दोबारा-कोशिश वाली व्यवस्था पहले से है (api.js), पर यह task उसे
        // बायपास करके सीधा fetch करता था। अब यहां भी वही व्यवस्था लागू है।
        if (res.status === 401) {
          const refreshed = await performRefresh();
          if (refreshed) {
            const newToken = await getToken();
            if (newToken) res = await send(newToken);
          }
        }

        // 🐛 बग फ़िक्स (गंभीर): मामला बंद हो जाने पर backend जान-बूझकर 409 +
        // complaintClosed:true लौटाता है — पर यहां उसे कभी पढ़ा ही नहीं जाता था।
        // नतीजा: केस निस्तारित होने के बाद भी फ़ोन हमेशा के लिए foreground-service
        // चलाता रहता — बैटरी ख़र्च होती रहती, और स्क्रीन पर "आपकी लोकेशन पुलिस तक
        // पहुँच रही है" वाली सूचना दिखती रहती, जबकि सर्वर हर update ठुकरा रहा होता।
        // महिला-सुरक्षा ऐप में यह झूठा भरोसा बैटरी से कहीं ज़्यादा गंभीर है।
        // अब ऐसा जवाब मिलते ही ट्रैकिंग अपने-आप बंद हो जाती है।
        if (res.status === 409) {
          try {
            const payload = await res.json();
            if (payload?.complaintClosed) await stopBackgroundTracking();
          } catch (e) {
            // जवाब पढ़ा न जा सके तो कुछ न करें — अगला update दोबारा कोशिश करेगा
          }
        }
      } catch (e) {
        // नेटवर्क न हो तो चुपचाप छोड़ें — अगला fix दोबारा कोशिश करेगा
      }
    });
  } catch (e) {
    // पहले से परिभाषित हो तो कोई बात नहीं
  }
}

// ---- शुरू करें ----
// लौटाता है: { ok: true } या { ok: false, reason }
export async function startBackgroundTracking(complaintId) {
  if (!TASK_AVAILABLE) return { ok: false, reason: 'unavailable' };
  try {
    // "हमेशा अनुमति" अलग से माँगनी पड़ती है — Android 10+ में यह ज़रूरी है
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return { ok: false, reason: 'foreground-denied' };
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) return { ok: false, reason: 'background-denied' };

    await AsyncStorage.setItem(ACTIVE_KEY, String(complaintId));

    const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (already) return { ok: true };

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Highest,
      timeInterval: 15000, // हर 15 सेकंड — पहले 30 था, अब ज़्यादा बार-बार ताज़ा होगा
      distanceInterval: 20, // या 20 मीटर चलने पर — जो पहले हो (पहले 50 मीटर था)
      pausesUpdatesAutomatically: false,
      // Android में लगातार लोकेशन के लिए यह सूचना अनिवार्य है।
      // यह पीड़िता को भी भरोसा देती है कि ट्रैकिंग चालू है।
      // 🐛 बग फ़िक्स: यह टेक्स्ट हार्डकोडेड हिंदी था — अंग्रेज़ी मोड में भी हिंदी ही
      // दिखता। (यहां tt() सही है क्योंकि यह कहीं सेव नहीं होता — हर बार ट्रैकिंग
      // शुरू होते समय ताज़ा बनता है, इसलिए मौजूदा भाषा ही सही भाषा है।)
      foregroundService: {
        notificationTitle: tt('ShaktiCop — सुरक्षा ट्रैकिंग चालू'),
        notificationBody: tt('आपकी लोकेशन पुलिस तक पहुँच रही है। सुरक्षित पहुँचने पर बंद करें।'),
        notificationColor: '#7A1836',
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ---- बंद करें ----
export async function stopBackgroundTracking() {
  try {
    await AsyncStorage.removeItem(ACTIVE_KEY);
    if (!TASK_AVAILABLE) return;
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch (e) {
    // ignore
  }
}

// ---- चल रही है या नहीं ----
export async function isBackgroundTrackingActive() {
  if (!TASK_AVAILABLE) return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch (e) {
    return false;
  }
}

// ---- किस शिकायत की ट्रैकिंग चल रही है ----
export async function activeTrackingComplaintId() {
  try {
    return await AsyncStorage.getItem(ACTIVE_KEY);
  } catch (e) {
    return null;
  }
}
