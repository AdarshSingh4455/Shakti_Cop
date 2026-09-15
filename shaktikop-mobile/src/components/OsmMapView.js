import React, { useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * OsmMapView — react-native-maps (MapView/Marker/UrlTile/Polyline) का replacement.
 * यह react-native-maps को हटाकर Google Maps API key की ज़रूरत खत्म कर देता है —
 * OpenStreetMap tiles सीधे WebView में Leaflet.js के ज़रिए दिखाता है, बिना किसी key के।
 *
 * Props:
 *  - region: { latitude, longitude, latitudeDelta?, longitudeDelta? }  (शुरुआती केंद्र/ज़ूम)
 *  - markers: [{ id, latitude, longitude, title?, description?, color? }]
 *  - polylines: [{ id, coords: [{latitude, longitude}], color?, width? }]
 *  - circles: [{ id, latitude, longitude, radiusMeters, color? }]  — जैसे GPS सटीकता का घेरा
 *  - style: RN style (height/flex वगैरह देने के लिए ज़रूरी)
 */
export default function OsmMapView({ region, markers = [], polylines = [], circles = [], style }) {
  const webRef = useRef(null);

  // latitudeDelta को zoom level में बदलने का मोटा अंदाज़ा
  const zoom = useMemo(() => {
    const delta = region?.latitudeDelta || 0.03;
    if (delta > 0.5) return 10;
    if (delta > 0.1) return 12;
    if (delta > 0.03) return 14;
    if (delta > 0.01) return 16;
    return 17;
  }, [region?.latitudeDelta]);

  // 🐛 बग फ़िक्स (गंभीर — नक़्शा बार-बार रीलोड होता था): पहले नीचे वाला useMemo सीधे
  // markers/polylines/circles (arrays) पर निर्भर था। हर parent screen ये arrays
  // inline बनाती है (जैसे markers={[...]}), इसलिए हर render पर एक *नया reference*
  // बनता — और React dependencies की तुलना reference से करता है (Object.is), मान से
  // नहीं। नतीजा: डेटा बिल्कुल न बदलने पर भी html दोबारा बनता, WebView का source प्रॉप
  // बदलता, और पूरा नक़्शा फिर से लोड हो जाता — Leaflet दोबारा शुरू, tiles दोबारा
  // डाउनलोड, उपयोगकर्ता का pan/zoom गायब, सैटेलाइट-टॉगल रीसेट, और झिलमिलाहट।
  // ComplaintDetailScreen में 10-सेकंड और 15-सेकंड के polls चलते हैं, इसलिए वहां यह
  // हर 10 सेकंड में हो रहा था। अब पहले JSON बना लेते हैं (सस्ता काम) और उन्हीं
  // strings को dependency बनाते हैं — strings की तुलना मान से होती है, इसलिए नक़्शा
  // सिर्फ़ तभी दोबारा बनता है जब असल में कुछ बदला हो।
  //
  // 🔒 सुरक्षा (defense-in-depth): JSON.stringify फ़ॉरवर्ड-स्लैश को escape नहीं करता,
  // इसलिए किसी title/description में लिखा "</script>" ज्यों-का-त्यों नीचे <script>
  // ब्लॉक में चला जाता — और HTML-parser पहले "</script" पर ही script टैग बंद कर देता
  // है, चाहे वह JS-string के अंदर ही क्यों न हो। यानी बाहर निकलकर मनमाना script
  // चलाया जा सकता था (नीचे escapeHtml सिर्फ़ innerHTML वाले हिस्से को बचाता है, इस
  // breakout को नहीं)। '<' को \u003c में बदलने से JS-string का मतलब वही रहता है, पर
  // HTML-parser को कहीं भी "</script" दिखता ही नहीं।
  const toSafeJson = (value) => JSON.stringify(value || []).replace(/</g, '\\u003c');
  const markersJson = toSafeJson(markers);
  const polylinesJson = toSafeJson(polylines);
  const circlesJson = toSafeJson(circles);

  const html = useMemo(() => {
    const centerLat = region?.latitude || 0;
    const centerLng = region?.longitude || 0;

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    // 🐛 बग फ़िक्स: Leaflet को CDN <script> टैग से WebView में लोड करने पर उसके डिफ़ॉल्ट
    // मार्कर आइकन (marker-icon.png आदि) का path अपने-आप सही तरीक़े से नहीं मिल पाता —
    // इसका अपना known कारण है (Leaflet अपनी "current script" पहचान कर उसी के आस-पास
    // images ढूंढता है, जो हर WebView/bundler setup में भरोसेमंद नहीं होता)। नतीजा:
    // मार्कर जुड़ता तो है पर उसकी image टूटी हुई/अदृश्य रहती है — नक़्शा दिखता है
    // (वह अलग tile-layer से आता है), पर थाना/अस्पताल के pins नहीं दिखते।
    // ठीक करने का मानक तरीक़ा — icon URLs को खुद स्पष्ट रूप से (absolute CDN path) दे देना।
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    var map = L.map('map', { zoomControl: true, attributionControl: false })
      .setView([${centerLat}, ${centerLng}], ${zoom});

    // दो layers — सामान्य नक़्शा (OSM) और सैटेलाइट (Esri की मुफ़्त World Imagery, कोई API key नहीं चाहिए)
    var streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OpenStreetMap' });
    var satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Esri' }
    );
    streetLayer.addTo(map);

    // ऊपर-दाएं कोने में सामान्य ✋ नक़्शा/सैटेलाइट टॉगल बटन (Google Maps जैसा)
    var isSatellite = false;
    var ToggleControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var btn = L.DomUtil.create('div', '');
        btn.innerHTML = 'सैटेलाइट';
        btn.style.cssText = 'background:white;padding:7px 12px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.3);font-family:sans-serif;font-size:12.5px;font-weight:700;color:#0F2A44;cursor:pointer;';
        L.DomEvent.disableClickPropagation(btn);
        btn.onclick = function () {
          isSatellite = !isSatellite;
          if (isSatellite) {
            map.removeLayer(streetLayer);
            satelliteLayer.addTo(map);
            btn.innerHTML = 'सामान्य नक़्शा';
          } else {
            map.removeLayer(satelliteLayer);
            streetLayer.addTo(map);
            btn.innerHTML = 'सैटेलाइट';
          }
        };
        return btn;
      },
    });
    map.addControl(new ToggleControl());

    var markers = ${markersJson};
    var leafletMarkers = [];
    // 🔒 सुरक्षा (defense-in-depth): title/description/color सीधे HTML स्ट्रिंग में
    // जोड़े जाते हैं — अभी तक हमेशा सिस्टम-जनरेट या third-party-geocoded टेक्स्ट ही
    // यहां आता है, पर भविष्य में कोई और caller गलती से उपयोगकर्ता का टाइप किया हुआ
    // टेक्स्ट (जैसे पीड़िता का नाम) यहां भेज दे, तो बिना escape किए HTML/script
    // injection संभव हो सकता था। अब हमेशा escape करते हैं, चाहे स्रोत जो भी हो।
    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    markers.forEach(function (m) {
      if (m.latitude == null || m.longitude == null) return;
      var marker;
      if (m.color) {
        // रंग-आधारित pin — police/hospital/"आप यहाँ" को अलग-अलग पहचानने के लिए
        var icon = L.divIcon({
          className: '',
          html: '<div style="background:' + escapeHtml(m.color) + ';width:16px;height:16px;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        marker = L.marker([m.latitude, m.longitude], { icon: icon }).addTo(map);
      } else {
        marker = L.marker([m.latitude, m.longitude]).addTo(map);
      }
      if (m.title || m.description) {
        var html = '';
        if (m.title) html += '<strong>' + escapeHtml(m.title) + '</strong>';
        if (m.description) html += '<br/>' + escapeHtml(m.description);
        marker.bindPopup(html);
      }
      leafletMarkers.push(marker);
    });

    // 🆕 बग फ़िक्स: पहले नक़्शा हमेशा एक तय (fixed) zoom पर केंद्रित रहता था, चाहे
    // markers कितने भी पास-पास क्यों न हों। शिकायत दर्ज करते समय की GPS-location और
    // नागरिक की live-location अक्सर सिर्फ़ 20-40 मीटर दूर होती हैं — तय zoom पर दोनों
    // pin (और accuracy का घेरा) लगभग बिल्कुल एक-दूसरे के ऊपर आ जाते, जो उलझा हुआ/टूटा
    // हुआ जैसा दिखता। अब 2+ markers होने पर नक़्शा अपने-आप उतना ज़ूम-आउट होता है कि
    // सभी markers साफ़-साफ़, एक-दूसरे से अलग दिखें (कम-से-कम एक जैसे नज़दीक markers के
    // लिए भी थोड़ी जगह छोड़ते हुए) — एक भी marker हो तो पहले जैसा तय zoom बना रहता है।
    if (leafletMarkers.length > 1) {
      var group = L.featureGroup(leafletMarkers);
      map.fitBounds(group.getBounds().pad(0.5), { maxZoom: 17 });
    }

    var polylines = ${polylinesJson};
    polylines.forEach(function (p) {
      if (!p.coords || !p.coords.length) return;
      var latlngs = p.coords.map(function (c) { return [c.latitude, c.longitude]; });
      L.polyline(latlngs, { color: p.color || '#8E2A46', weight: p.width || 4 }).addTo(map);
    });

    // GPS सटीकता का घेरा (accuracy radius) — जितना बड़ा घेरा, उतनी कम सटीक लोकेशन
    var circles = ${circlesJson};
    circles.forEach(function (c) {
      if (c.latitude == null || c.longitude == null || !c.radiusMeters) return;
      L.circle([c.latitude, c.longitude], {
        radius: c.radiusMeters,
        color: c.color || '#2E7D5B',
        weight: 1.5,
        fillColor: c.color || '#2E7D5B',
        fillOpacity: 0.12,
      }).addTo(map);
    });
  </script>
</body>
</html>`;
  }, [region?.latitude, region?.longitude, zoom, markersJson, polylinesJson, circlesJson]);

  return (
    <View style={[styles.wrapper, style]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit
        // 🔒 सुरक्षा: यह WebView सिर्फ़ नक़्शा दिखाने के लिए है — इसे कहीं और जाने की
        // ज़रूरत ही नहीं। पहले originWhitelist ['*'] के साथ यह किसी भी website पर
        // चला जा सकता था: नीचे OpenStreetMap की attribution-कड़ी दबने पर, या CDN कभी
        // हैक हो जाए तो उसकी script से। और यह उसी समय होता जब स्क्रीन पर पीड़िता की
        // लोकेशन खुली हो।
        //
        // ⚠️ जान-बूझकर "सिर्फ़ inline html" तक सीमित नहीं किया: यह handler कुछ
        //    platform/संस्करणों में tile-छवियों व script पर भी चलता है, और तब पूरा
        //    नक़्शा खाली रह जाता — जो जोखिम से ज़्यादा नुक़सानदेह है। इसलिए वही तीन
        //    host खुले हैं जो नक़्शे को असल में चाहिए, बाक़ी सब बंद।
        onShouldStartLoadWithRequest={(req) => {
          const u = req.url || '';
          if (u === '' || u === 'about:blank' || u.startsWith('data:')) return true;
          return (
            u.startsWith('https://tile.openstreetmap.org/') ||
            u.startsWith('https://server.arcgisonline.com/') ||
            u.startsWith('https://unpkg.com/')
          );
        }}
        onError={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
