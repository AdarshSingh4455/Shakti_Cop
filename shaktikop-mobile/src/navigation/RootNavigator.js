import React, { useState } from 'react';
import { tt, useLocale } from '../context/LocaleContext';
import { TouchableOpacity, Text, View, Image, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef, flushPendingNavigation } from './navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { CATEGORY_DEFS } from '../data/constants';
import { useApp } from '../context/AppContext';
import NotificationBell from '../components/NotificationBell';
import PoliceLogoIcon from '../components/PoliceLogoIcon';

import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import NearbyHelpScreen from '../screens/NearbyHelpScreen';
import TrackComplaintScreen from '../screens/TrackComplaintScreen';
import AdminBannersScreen from '../screens/AdminBannersScreen';
import PoliceServicesManagementScreen from '../screens/PoliceServicesManagementScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ActiveSessionsScreen from '../screens/ActiveSessionsScreen';
import ManageAdminsScreen from '../screens/ManageAdminsScreen';
import QRScannerScreen from '../screens/QRScannerScreen';
import QRVerifyResultScreen from '../screens/QRVerifyResultScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import OfficerStatusScreen from '../screens/OfficerStatusScreen';
import CreateOfficerScreen from '../screens/CreateOfficerScreen';
import MyStationOfficersScreen from '../screens/MyStationOfficersScreen';
import CreateSHOScreen from '../screens/CreateSHOScreen';
import LocationDataScreen from '../screens/LocationDataScreen';
import BroadcastScreen from '../screens/BroadcastScreen';
import ContentManagementScreen from '../screens/ContentManagementScreen';
import ReportSchedulesScreen from '../screens/ReportSchedulesScreen';
import BulkImportScreen from '../screens/BulkImportScreen';
import CitizenHomeScreen from '../screens/CitizenHomeScreen';
import CategoryComplaintFormScreen from '../screens/CategoryComplaintFormScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ComplaintDetailScreen from '../screens/ComplaintDetailScreen';
import OfficerHomeScreen from '../screens/OfficerHomeScreen';
import CounsellorHomeScreen from '../screens/CounsellorHomeScreen';
import CounsellorProfileScreen from '../screens/CounsellorProfileScreen';
import OfficerProfileScreen from '../screens/OfficerProfileScreen';
import AdminHomeScreen from '../screens/AdminHomeScreen';
import AdminAnalyticsScreen from '../screens/AdminAnalyticsScreen';
import DistrictExplorerScreen from '../screens/DistrictExplorerScreen';
import AdminLeaderboardScreen from '../screens/AdminLeaderboardScreen';
import OfficerPerformanceScreen from '../screens/OfficerPerformanceScreen';
import AllComplaintsScreen from '../screens/AllComplaintsScreen';
import OfficerManagementScreen from '../screens/OfficerManagementScreen';
import OfficerFormScreen from '../screens/OfficerFormScreen';
import AdminSettingsScreen from '../screens/AdminSettingsScreen';
import AppSettingsScreen from '../screens/AppSettingsScreen';
import CategoriesManagementScreen from '../screens/CategoriesManagementScreen';
import ServiceProvidersManagementScreen from '../screens/ServiceProvidersManagementScreen';
import FaqManagementScreen from '../screens/FaqManagementScreen';
import FaqScreen from '../screens/FaqScreen';
import LanguageManagementScreen from '../screens/LanguageManagementScreen';
import AdminProfileScreen from '../screens/AdminProfileScreen';
import AdminActivityLogsScreen from '../screens/AdminActivityLogsScreen';
import SafeTravelScreen from '../screens/SafeTravelScreen';
import SosAlertsScreen from '../screens/SosAlertsScreen';
import PoliceServicesScreen from '../screens/PoliceServicesScreen';
import ServiceRequestFormScreen from '../screens/ServiceRequestFormScreen';
import MyServiceRequestsScreen from '../screens/MyServiceRequestsScreen';
import ServiceRequestsManagementScreen from '../screens/ServiceRequestsManagementScreen';
import AtrScreen from '../screens/AtrScreen';
import BackupRestoreScreen from '../screens/BackupRestoreScreen';
import DeletedComplaintsScreen from '../screens/DeletedComplaintsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AppearanceScreen from '../screens/AppearanceScreen';
import SplashLoader from '../components/SplashLoader';
import { SERVICE_TYPES } from '../data/serviceRequests';
import MessagesInboxScreen from '../screens/MessagesInboxScreen';
import ConversationScreen from '../screens/ConversationScreen';
import ComplaintChatScreen from '../screens/ComplaintChatScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

const roleLabel = { citizen: tt('नागरिक'), officer: tt('अधिकारी'), admin: tt('एडमिन') };

function headerOptions(logout) {
  return {
    headerStyle: { backgroundColor: colors.shaktiMaroon },
    headerTintColor: colors.white,
    headerTitleStyle: { fontSize: 16, fontWeight: '700' },
    // 🐛 बग फ़िक्स (शीर्षक व बटन का ऊपर-नीचे चढ़ना): headerTitle पर पहले से flexShrink
    // लगा था, पर वह काम नहीं कर रहा था — flexShrink तभी असर करता है जब उसका parent
    // container ख़ुद किसी सीमा में बँधा हो। React Navigation का title-container अपनी
    // प्राकृतिक चौड़ाई ले लेता था, इसलिए लंबे शीर्षक ("Analysis (KPIs & Trends)",
    // "Self-defence training") दाईं ओर के बटनों के नीचे चले जाते और भाषा-बटन उनके
    // ऊपर चढ़ा दिखता। अब container को flex: 1 देकर बाँधा गया है (यानी बची हुई जगह
    // ही मिलेगी, उससे ज़्यादा नहीं) — तभी अंदर का flexShrink/ellipsis असर करता है।
    // और headerRight को flexShrink: 0 — ताकि बटन कभी दबकर टूटें नहीं।
    headerTitleContainerStyle: { flex: 1, marginHorizontal: 4 },
    headerRightContainerStyle: { flexShrink: 0, paddingRight: 4 },
    // 🐛 बग फ़िक्स: पहले लंबे screen-title (जैसे "Add new investigating officer")
    // पर कोई चौड़ाई-सीमा/truncation नहीं थी — टाइटल अपनी पूरी प्राकृतिक चौड़ाई ले
    // लेता और headerRight के बटन (भाषा/घंटी/लॉगआउट) से टकरा (overlap हो) जाता।
    // अब title उपलब्ध जगह में सिकुड़ता है, और ज़्यादा लंबा हो तो "..." से छोटा दिखता है।
    headerTitle: ({ children }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        <PoliceLogoIcon size={22} />
        <Text
          style={{ color: colors.white, fontSize: 16, fontWeight: '700', flexShrink: 1 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {children}
        </Text>
      </View>
    ),
    headerRight: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <LanguageToggleButton />
        <NotificationBell />
        <TouchableOpacity onPress={logout} style={{ paddingHorizontal: 4 }}>
          <Text style={{ color: '#DCC7CE', fontSize: 12, fontWeight: '600' }}>{tt('लॉगआउट')}</Text>
        </TouchableOpacity>
      </View>
    ),
  };
}

// ============================================================
// ⚠️ पहले यहाँ नीचे 3-4 tabs (होम, पुलिस सेवा, कल्याण, डैशबोर्ड) की एक पूरी पट्टी थी।
// अब सभी सेवाएं (शिकायत दर्ज करें, सहायता सेवाएं, कल्याणकारी योजनाएं, पुलिस सेवाएं)
// सीधे HomeScreen पर ही श्रेणी में दिखती हैं — इसलिए नीचे की tab-पट्टी हटा दी गई है।
// (Home स्क्रीन के ऊपरी हिस्से में "मेरी शिकायतें" और profile आइकन से बाकी सब मिल जाता है,
// साथ ही लॉगिन के बाद साइड मेनू/Drawer से भी पूरी नेविगेशन उपलब्ध है)
//
// 🐛 बग फ़िक्स: असल registered screen का नाम "CitizenMain"/"Home" है (Drawer/Stack में
// name="..." से), "CitizenTabs"/"GuestTabs" तो सिर्फ़ यहाँ नीचे के component का नाम है।
// पहले कई जगह `navigation.navigate('CitizenTabs')` कॉल की गई थीं यह सोचकर कि component
// का नाम ही route का नाम होगा — यह ग़लत था, React Navigation सिर्फ़ Screen के `name` prop
// से मैच करता है। इसी वजह से "डैशबोर्ड/साइड मेनू क्लिक करने पर कुछ नहीं होता" वाली समस्या आ
// रही थी। अब सभी जगह सही route नाम ("CitizenMain") इस्तेमाल किया गया है।
// ============================================================
function GuestTabs({ navigation, route }) {
  return <HomeScreen navigation={navigation} route={route} />;
}

function CitizenTabs({ navigation, route }) {
  return <HomeScreen navigation={navigation} route={route} />;
}

// साइड मेनू वाले हर डैशबोर्ड (नागरिक/अधिकारी/एडमिन) के header में — कहीं से भी
// एक टैप में भाषा बदली जा सके, Settings में जाने की ज़रूरत नहीं
function LanguageToggleButton() {
  const { locale, toggleLocale } = useLocale();
  return (
    <TouchableOpacity onPress={toggleLocale} style={langToggleStyles.btn}>
      <Ionicons name="language-outline" size={13} color={colors.white} />
      <Text style={langToggleStyles.text}>{locale === 'hi' ? 'EN' : 'हिं'}</Text>
    </TouchableOpacity>
  );
}

const langToggleStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 4,
  },
  text: { color: colors.white, fontSize: 11.5, fontWeight: '700' },
});

// साइड मेनू के सबसे ऊपर — profile फ़ोटो/initials + नाम (सभी roles के लिए साझा)
function DrawerProfileHeader({ user, role, subtitle, onPress }) {
  const initials = (user?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <TouchableOpacity style={profileHeaderStyles.wrap} onPress={onPress} activeOpacity={0.85}>
      {user?.photoUrl ? (
        <Image source={{ uri: user.photoUrl }} style={profileHeaderStyles.avatarImg} />
      ) : (
        <View style={profileHeaderStyles.avatarFallback}>
          <Text style={profileHeaderStyles.avatarText}>{initials}</Text>
        </View>
      )}
      <Text style={profileHeaderStyles.name} numberOfLines={1}>{user?.name || '—'}</Text>
      {/* 🎨 डिज़ाइन सुधार: पहले सिर्फ़ हल्का ग्रे टेक्स्ट था (जैसे "SI · SK-1234") — अब एक
          साफ़ badge-pill जैसा दिखता है, ताकि रैंक/भूमिका एक नज़र में पहचानी जा सके */}
      {subtitle ? (
        <View style={profileHeaderStyles.badgePill}>
          <Text style={profileHeaderStyles.badgeText} numberOfLines={1}>{subtitle}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const profileHeaderStyles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 16, backgroundColor: colors.shaktiMaroonWash, marginBottom: 6 },
  avatarImg: { width: 64, height: 64, borderRadius: 32, marginBottom: 10, borderWidth: 2, borderColor: colors.white },
  avatarFallback: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.shaktiMaroon, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { color: colors.white, fontSize: 22, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '800', color: colors.inkNavy },
  badgePill: {
    marginTop: 6,
    backgroundColor: colors.shaktiMaroon,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: 220,
  },
  badgeText: { fontSize: 10.5, fontWeight: '700', color: colors.white, letterSpacing: 0.2 },
});

// साइड पैनल में — डैशबोर्ड पर श्रेणी अनुसार फ़िल्टर करने के लिए (पहले dashboard पर chips के रूप में थे)

function CitizenDrawerContent(props) {
  const { user } = useApp();
  // 🐛 बग फ़िक्स (गंभीर): पहले यह सूची module-level (component के बाहर) बनती थी —
  // इसलिए tt() सिर्फ़ एक बार, ऐप शुरू होते ही चलता था, भाषा बदलने पर कभी दोबारा
  // नहीं। साथ ही CATEGORY_DEFS से आने वाले लेबल पर tt() लगाया ही नहीं गया था —
  // इसलिए श्रेणी के नाम (जैसे "घरेलू हिंसा") हमेशा हिंदी में ही दिखते, चाहे भाषा
  // कुछ भी चुनी हो। अब component के अंदर, हर render पर ताज़ा बनता है।
  const drawerCategoryItems = [
    { key: 'सभी', label: tt('डैशबोर्ड (सभी शिकायतें)'), icon: 'grid-outline', color: colors.inkNavy },
    ...CATEGORY_DEFS.map((c) => ({ key: c.key, label: tt(c.label), icon: c.icon, color: c.color })),
  ];

  // ⚠️ बग फ़िक्स: पहले यह सिर्फ़ profile header + श्रेणी-शॉर्टकट + FAQ दिखाता था —
  // असल में register किए गए Drawer.Screen (SOS अलर्ट, मेरी शिकायतें, नज़दीकी थाना,
  // ट्रैक करें, सहायता सेवाएं) कभी दिखते ही नहीं थे, चाहे वे navigator में मौजूद हों।
  // अब Admin Drawer जैसा ही तरीक़ा — असल registered routes से मेनू बनता है,
  // इसलिए "SOS अलर्ट" (और बाक़ी) डैशबोर्ड के ठीक बाद हमेशा दिखेंगे।
  const available = new Map(props.state.routes.map((r, i) => [r.name, { route: r, index: i }]));
  const focusedName = props.state.routes[props.state.index]?.name;

  const renderItem = (name) => {
    const entry = available.get(name);
    if (!entry) return null;
    const options = props.descriptors[entry.route.key].options;
    return (
      <DrawerItem
        key={entry.route.key}
        label={options.drawerLabel ?? entry.route.name}
        icon={
          options.drawerIcon
            ? options.drawerIcon
            : ({ color, size }) =>
                DRAWER_ICONS[name] ? (
                  <Ionicons name={DRAWER_ICONS[name]} size={size} color={focusedName === name ? color : DRAWER_ICON_COLORS[name] || color} />
                ) : null
        }
        focused={focusedName === name}
        activeTintColor={colors.shaktiMaroon}
        activeBackgroundColor={colors.shaktiMaroonWash}
        onPress={() => {
          props.navigation.navigate(name);
          props.navigation.closeDrawer();
        }}
      />
    );
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
      <DrawerProfileHeader
        user={user}
        subtitle={user?.mobile}
        onPress={() => {
          props.navigation.navigate('CitizenProfile');
          props.navigation.closeDrawer();
        }}
      />
      {renderItem('CitizenMain')}
      {renderItem('CitizenSosAlerts')}

      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.inkLight, marginLeft: 16, marginTop: 12, marginBottom: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {tt('शिकायत श्रेणियां')}
      </Text>
      {drawerCategoryItems.map((item) => (
        <DrawerItem
          key={item.key}
          label={item.label}
          icon={({ color, size }) => <Ionicons name={item.icon} size={size} color={item.color || color} />}
          activeTintColor={colors.shaktiMaroon}
          activeBackgroundColor={colors.shaktiMaroonWash}
          onPress={() => {
            // 🐛 बग फ़िक्स (गंभीर): पहले यहां श्रेणी चाहे कोई भी हो (महिला हेल्प डेस्क,
            // एंटी रोमियो, घरेलू हिंसा, आदि), हमेशा सीधे CitizenMain (डैशबोर्ड/होम)
            // पर navigate हो जाता था — item.key (असली चुनी गई श्रेणी) पूरी तरह अनदेखा
            // होता था। नतीजा: किसी भी श्रेणी पर टैप करने पर हमेशा होम-पेज ही खुलता,
            // कभी उस श्रेणी का शिकायत-फ़ॉर्म नहीं खुलता था। अब HomeScreen के अपने
            // श्रेणी-टाइल जैसा ही सही तरीक़ा — "सभी" (डैशबोर्ड) को छोड़कर बाक़ी हर
            // श्रेणी सीधे उसी श्रेणी के ComplaintForm पर ले जाती है।
            if (item.key === 'सभी') {
              props.navigation.navigate('CitizenMain');
            } else {
              props.navigation.navigate('ComplaintForm', { category: item.key });
            }
            props.navigation.closeDrawer();
          }}
        />
      ))}

      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.inkLight, marginLeft: 16, marginTop: 12, marginBottom: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {tt('सहायता सेवाएं')}
      </Text>
      {Object.values(SERVICE_TYPES).map((s) => renderItem(`My_${s.key}`))}
      {renderItem('CitizenProfile')}

      <DrawerItem
        label={tt('मदद और सामान्य प्रश्न')}
        icon={({ color, size }) => <Ionicons name="help-circle-outline" size={size} color={color} />}
        activeTintColor={colors.shaktiMaroon}
        activeBackgroundColor={colors.shaktiMaroonWash}
        onPress={() => {
          props.navigation.navigate('Faq');
          props.navigation.closeDrawer();
        }}
      />

      {/* 🐛 बग फ़िक्स: पहले Logout सिर्फ़ Drawer के डिफ़ॉल्ट header में था — अब Home
          स्क्रीन का अपना header होने से वह header छुपा दिया गया है, इसलिए Logout यहाँ
          मेनू में भी जोड़ा ताकि पहुंच न खोए (बाक़ी screens पर अब भी header से भी उपलब्ध है) */}
      <DrawerItem
        label={tt('लॉगआउट')}
        icon={({ color, size }) => <Ionicons name="log-out-outline" size={size} color={color} />}
        activeTintColor={colors.alert}
        onPress={() => {
          props.navigation.closeDrawer();
          props.logout?.();
        }}
      />
    </DrawerContentScrollView>
  );
}

function CitizenDrawer({ logout }) {
  return (
    <Drawer.Navigator
      id="CitizenDrawerNav"
      screenOptions={{
        headerStyle: { backgroundColor: colors.shaktiMaroon },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: 16, fontWeight: '700' },
    // 🐛 बग फ़िक्स (शीर्षक व बटन का ऊपर-नीचे चढ़ना): headerTitle पर पहले से flexShrink
    // लगा था, पर वह काम नहीं कर रहा था — flexShrink तभी असर करता है जब उसका parent
    // container ख़ुद किसी सीमा में बँधा हो। React Navigation का title-container अपनी
    // प्राकृतिक चौड़ाई ले लेता था, इसलिए लंबे शीर्षक ("Analysis (KPIs & Trends)",
    // "Self-defence training") दाईं ओर के बटनों के नीचे चले जाते और भाषा-बटन उनके
    // ऊपर चढ़ा दिखता। अब container को flex: 1 देकर बाँधा गया है (यानी बची हुई जगह
    // ही मिलेगी, उससे ज़्यादा नहीं) — तभी अंदर का flexShrink/ellipsis असर करता है।
    // और headerRight को flexShrink: 0 — ताकि बटन कभी दबकर टूटें नहीं।
    headerTitleContainerStyle: { flex: 1, marginHorizontal: 4 },
    headerRightContainerStyle: { flexShrink: 0, paddingRight: 4 },
        // 🐛 बग फ़िक्स: यह headerOptions() से अलग, अपनी अलग (डुप्लीकेट) header-title
        // परिभाषा थी — इसमें भी वही overflow-बग था, अलग से ठीक करना ज़रूरी था।
        headerTitle: ({ children }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <PoliceLogoIcon size={22} />
            <Text
              style={{ color: colors.white, fontSize: 16, fontWeight: '700', flexShrink: 1 }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {children}
            </Text>
          </View>
        ),
        drawerActiveTintColor: colors.shaktiMaroon,
        drawerActiveBackgroundColor: colors.shaktiMaroonWash,
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <LanguageToggleButton />
            <NotificationBell />
            <TouchableOpacity onPress={logout} style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: '#DCC7CE', fontSize: 12, fontWeight: '600' }}>{tt('लॉगआउट')}</Text>
            </TouchableOpacity>
          </View>
        ),
      }}
      drawerContent={(props) => <CitizenDrawerContent {...props} logout={logout} />}
    >
      <Drawer.Screen
        name="CitizenMain"
        component={CitizenTabs}
        options={{ title: tt('ShaktiCop · नागरिक'), drawerLabel: tt('डैशबोर्ड'), headerShown: false }}
      />
      <Drawer.Screen
        name="CitizenSosAlerts"
        component={SosAlertsScreen}
        options={{ title: tt('🆘 SOS अलर्ट'), drawerLabel: tt('🆘 SOS अलर्ट') }}
      />
      <Drawer.Screen
        name="CitizenAllComplaints"
        component={CitizenHomeScreen}
        options={{ title: tt('मेरी सभी शिकायतें'), drawerLabel: tt('मेरी सभी शिकायतें') }}
      />
      <Drawer.Screen
        name="CitizenNearby"
        component={NearbyHelpScreen}
        options={{ title: tt('नज़दीकी थाना व अस्पताल'), drawerLabel: tt('नज़दीकी थाना व अस्पताल') }}
      />
      <Drawer.Screen
        name="CitizenTrack"
        component={TrackComplaintScreen}
        options={{ title: tt('शिकायत ट्रैक करें'), drawerLabel: tt('शिकायत ट्रैक करें') }}
      />
      {Object.values(SERVICE_TYPES).map((s) => (
        <Drawer.Screen
          key={`my-${s.key}`}
          name={`My_${s.key}`}
          component={MyServiceRequestsScreen}
          initialParams={{ type: s.key }}
          options={{
            title: `${s.emoji} ${tt(s.label)}`,
            drawerLabel: `${s.emoji} ${tt(s.label)}`,
            drawerIcon: () => null,
          }}
        />
      ))}
      <Drawer.Screen
        name="CitizenProfile"
        component={ProfileScreen}
        options={{ title: tt('मेरी प्रोफ़ाइल'), drawerLabel: tt('प्रोफ़ाइल') }}
      />

    </Drawer.Navigator>
  );
}

const OFFICER_TAB_ICONS = {
  OfficerHome: 'briefcase-outline',
  AssignCases: 'person-add-outline',
  Messages: 'chatbubbles-outline',
  OfficerProfile: 'person-outline',
};

function OfficerTabs() {
  const { user } = useApp();
  const isSHO = user?.rank === 'SHO';
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.shaktiMaroon,
        tabBarInactiveTintColor: colors.inkLight,
        tabBarIcon: ({ color, size }) => <Ionicons name={OFFICER_TAB_ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="OfficerHome" component={OfficerHomeScreen} options={{ title: tt('मेरे मामले') }} />
      {isSHO && (
        <Tab.Screen name="AssignCases" component={AllComplaintsScreen} options={{ title: tt('नियुक्ति (SHO)') }} initialParams={{ status: 'दर्ज' }} />
      )}
      <Tab.Screen name="Messages" component={MessagesInboxScreen} options={{ title: tt('संदेश') }} />
      <Tab.Screen name="OfficerProfile" component={OfficerProfileScreen} options={{ title: tt('प्रोफ़ाइल') }} />
    </Tab.Navigator>
  );
}

// साइड पैनल — श्रेणी अनुसार अपने मामलों को टेबल में देखने के लिए (पहले dashboard पर chips थे)

function OfficerDrawerContent(props) {
  const { user } = useApp();
  // 🐛 बग फ़िक्स (गंभीर) — Citizen वाली ही समस्या यहां भी थी: module-level सूची
  // होने से भाषा-बदलाव पर दोबारा नहीं बनती थी, और CATEGORY_DEFS के लेबल पर tt()
  // लगा ही नहीं था।
  const drawerCategoryItems = [
    { key: 'सभी', label: tt('सभी शिकायतें'), icon: 'documents-outline', color: colors.inkNavy },
    ...CATEGORY_DEFS.map((c) => ({ key: c.key, label: tt(c.label), icon: c.icon, color: c.color })),
  ];

  // ⚠️ बग फ़िक्स: पहले यह भी (Citizen वाले बग की तरह) एक हार्डकोडेड सूची थी —
  // "SOS अलर्ट" व "सेटिंग्स" जैसी असल में registered screens कभी मेनू में
  // दिखती ही नहीं थीं। अब Admin/Citizen जैसा ही तरीक़ा — registered routes से
  // मेनू अपने-आप बनता है।
  const available = new Map(props.state.routes.map((r, i) => [r.name, { route: r, index: i }]));
  const focusedName = props.state.routes[props.state.index]?.name;

  const renderItem = (name) => {
    const entry = available.get(name);
    if (!entry) return null;
    const options = props.descriptors[entry.route.key].options;
    return (
      <DrawerItem
        key={entry.route.key}
        label={options.drawerLabel ?? entry.route.name}
        icon={({ color, size }) =>
          DRAWER_ICONS[name] ? (
            <Ionicons name={DRAWER_ICONS[name]} size={size} color={focusedName === name ? color : DRAWER_ICON_COLORS[name] || color} />
          ) : null
        }
        focused={focusedName === name}
        activeTintColor={colors.shaktiMaroon}
        activeBackgroundColor={colors.shaktiMaroonWash}
        onPress={() => {
          props.navigation.navigate(name);
          props.navigation.closeDrawer();
        }}
      />
    );
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
      <DrawerProfileHeader
        user={user}
        subtitle={`${user?.badgeId || ''}${user?.rank ? ' · ' + user.rank : ''}`}
        onPress={() => {
          props.navigation.navigate('OfficerTabs', { screen: 'OfficerMain', params: { screen: 'OfficerProfile' } });
          props.navigation.closeDrawer();
        }}
      />
      {renderItem('OfficerMain')}
      {renderItem('OfficerSosAlerts')}

      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.inkLight, marginLeft: 16, marginTop: 12, marginBottom: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {tt('मेरे मामले')}
      </Text>
      <DrawerItem
        label={tt('मेरे मामले (डैशबोर्ड)')}
        icon={({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />}
        activeTintColor={colors.shaktiMaroon}
        activeBackgroundColor={colors.shaktiMaroonWash}
        onPress={() => {
          props.navigation.navigate('OfficerTabs', { screen: 'OfficerMain', params: { screen: 'OfficerHome' } });
          props.navigation.closeDrawer();
        }}
      />
      {drawerCategoryItems.map((item) => (
        <DrawerItem
          key={item.key}
          label={item.label}
          icon={({ color, size }) => <Ionicons name={item.icon} size={size} color={item.color || color} />}
          activeTintColor={colors.shaktiMaroon}
          activeBackgroundColor={colors.shaktiMaroonWash}
          onPress={() => {
            props.navigation.navigate('OfficerTable', { category: item.key === 'सभी' ? undefined : item.key });
            props.navigation.closeDrawer();
          }}
        />
      ))}

      {/* 🆕 SHO के लिए — सहायता सेवाओं (काउंसलिंग/कानूनी सहायता/आदि) की अपॉइंटमेंट
          शेड्यूल करने/काउंसलर तय करने की सुविधा। सिर्फ़ SHO रैंक को दिखती है —
          सामान्य अधिकारी (SI) को नहीं, क्योंकि यह सेवा-प्रबंधन का काम है। */}
      {user?.rank === 'SHO' && (
        <>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.inkLight, marginLeft: 16, marginTop: 12, marginBottom: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {tt('सहायता सेवाएं')}
          </Text>
          {Object.values(SERVICE_TYPES).map((s) => renderItem(`Manage_${s.key}`))}
          {renderItem('ServiceProvidersMenu')}
          {/* 🐛 बग फ़िक्स: पहले ATR (कार्यवाही आख्या) सिर्फ़ Admin/DSP+ के मेनू में थी —
              SHO के पास इसे खोलने का कोई रास्ता ही नहीं था, चाहे backend permission सही
              हो भी। अब SHO अपने थाने की बंद हो चुकी शिकायतों की पूरी कार्यवाही यहीं से
              देख सकता है (backend भी अब सिर्फ़ उनके अपने थाने तक ही scope करता है)। */}
          {renderItem('Atr')}
        </>
      )}

      {renderItem('OfficerSettings')}
    </DrawerContentScrollView>
  );
}

function OfficerDrawer({ logout }) {
  const { user } = useApp();
  return (
    <Drawer.Navigator
      id="OfficerDrawerNav"
      screenOptions={{
        headerStyle: { backgroundColor: colors.shaktiMaroon },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: 16, fontWeight: '700' },
    // 🐛 बग फ़िक्स (शीर्षक व बटन का ऊपर-नीचे चढ़ना): headerTitle पर पहले से flexShrink
    // लगा था, पर वह काम नहीं कर रहा था — flexShrink तभी असर करता है जब उसका parent
    // container ख़ुद किसी सीमा में बँधा हो। React Navigation का title-container अपनी
    // प्राकृतिक चौड़ाई ले लेता था, इसलिए लंबे शीर्षक ("Analysis (KPIs & Trends)",
    // "Self-defence training") दाईं ओर के बटनों के नीचे चले जाते और भाषा-बटन उनके
    // ऊपर चढ़ा दिखता। अब container को flex: 1 देकर बाँधा गया है (यानी बची हुई जगह
    // ही मिलेगी, उससे ज़्यादा नहीं) — तभी अंदर का flexShrink/ellipsis असर करता है।
    // और headerRight को flexShrink: 0 — ताकि बटन कभी दबकर टूटें नहीं।
    headerTitleContainerStyle: { flex: 1, marginHorizontal: 4 },
    headerRightContainerStyle: { flexShrink: 0, paddingRight: 4 },
        headerTitle: ({ children }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <PoliceLogoIcon size={22} />
            <Text
              style={{ color: colors.white, fontSize: 16, fontWeight: '700', flexShrink: 1 }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {children}
            </Text>
          </View>
        ),
        drawerActiveTintColor: colors.shaktiMaroon,
        drawerActiveBackgroundColor: colors.shaktiMaroonWash,
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <LanguageToggleButton />
            <NotificationBell />
            <TouchableOpacity onPress={logout} style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: '#DCC7CE', fontSize: 12, fontWeight: '600' }}>{tt('लॉगआउट')}</Text>
            </TouchableOpacity>
          </View>
        ),
      }}
      drawerContent={(props) => <OfficerDrawerContent {...props} />}
    >
      <Drawer.Screen name="OfficerMain" component={OfficerTabs} options={{ title: `ShaktiCop · ${roleLabel.officer}`, drawerLabel: tt('मेरे मामले') }} />
      <Drawer.Screen
        name="OfficerSosAlerts"
        component={SosAlertsScreen}
        options={{ title: tt('🆘 SOS अलर्ट'), drawerLabel: tt('🆘 SOS अलर्ट') }}
      />
      {/* 🆕 Performance Analytics — यह screen भी पहले किसी route से जुड़ी ही नहीं थी */}
      <Drawer.Screen
        name="OfficerPerformance"
        component={OfficerPerformanceScreen}
        options={{ title: tt('मेरा प्रदर्शन'), drawerLabel: tt('मेरा प्रदर्शन') }}
      />
      {/* 🆕 SHO — सहायता सेवाओं (काउंसलिंग/कानूनी सहायता/आत्मरक्षा/जन शिक्षण) की
          अपॉइंटमेंट यहीं से शेड्यूल कर सकते हैं, कैलेंडर से तिथि/समय चुनकर और
          उस सेवा से जुड़े काउंसलर/प्रशिक्षक को तय करके — सामान्य ऑफ़िस अधिकारी नहीं,
          बल्कि सिर्फ़ उसी सेवा से संबंधित व्यक्ति। DSP/ASP/SSP/Super Admin पहले से ही
          यह कर सकते हैं (AdminDrawer में) — अब SHO भी कर सकते हैं। */}
      {user?.rank === 'SHO' &&
        Object.values(SERVICE_TYPES).map((s) => (
          <Drawer.Screen
            key={`officer-mg-${s.key}`}
            name={`Manage_${s.key}`}
            component={ServiceRequestsManagementScreen}
            initialParams={{ type: s.key }}
            options={{
              title: `${s.emoji} ${tt(s.label)}`,
              drawerLabel: `${s.emoji} ${tt(s.label)}`,
            }}
          />
        ))}
      {user?.rank === 'SHO' && (
        <Drawer.Screen
          name="ServiceProvidersMenu"
          component={ServiceProvidersManagementScreen}
          options={{ title: tt('काउंसलर / प्रशिक्षक सूची'), drawerLabel: tt('काउंसलर सूची') }}
        />
      )}
      {/* 🐛 बग फ़िक्स: यह route पहले सिर्फ़ AdminDrawer में registered था — SHO के लिए
          कोई route ही मौजूद नहीं था, तो drawer में item दिखे भी तो navigate करने पर
          कुछ नहीं होता। अब SHO के लिए भी registered है (backend भी अब उनके अपने
          थाने तक scope करता है)। */}
      {user?.rank === 'SHO' && (
        <Drawer.Screen
          name="Atr"
          component={AtrScreen}
          options={{ title: tt('कार्यवाही आख्या (ATR)'), drawerLabel: tt('कार्यवाही आख्या') }}
        />
      )}
      <Drawer.Screen
        name="OfficerSettings"
        component={SettingsScreen}
        options={{ title: tt('सेटिंग्स'), drawerLabel: tt('सेटिंग्स') }}
      />
    </Drawer.Navigator>
  );
}

const DRAWER_ICONS = {
  AdminDashboard: 'grid-outline',
  CitizenMain: 'grid-outline',
  Manage_counselling: 'chatbubbles-outline',
  Manage_legal_aid: 'scale-outline',
  Manage_self_defence: 'body-outline',
  Manage_empowerment: 'school-outline',
  // 🐛 बग फ़िक्स: नागरिक के अपने "मेरे अनुरोध" मेनू आइटम (My_counselling आदि) के लिए
  // कोई icon ही परिभाषित नहीं था — वही सेवा के अधिकारी/एडमिन वाले "Manage_*" संस्करण में
  // तो icon दिखता था, पर नागरिक के अपने वाले में सिर्फ़ खाली जगह दिखती थी।
  My_counselling: 'chatbubbles-outline',
  My_legal_aid: 'scale-outline',
  My_self_defence: 'body-outline',
  My_empowerment: 'school-outline',
  CatMahilaHelp: 'woman-outline',
  CatAntiRomeo: 'shield-outline',
  CatDomesticViolence: 'home-outline',
  CatVoiceComplaint: 'mic-outline',
  QRScannerMenu: 'qr-code-outline',
  AllComplaints: 'documents-outline',
  SafeTravel: 'car-outline',
  CitizenSosAlerts: 'alert-circle-outline',
  CitizenAllComplaints: 'documents-outline',
  CitizenNearby: 'location-outline',
  CitizenTrack: 'search-outline',
  CitizenProfile: 'person-outline',
  Atr: 'document-text-outline',
  BackupRestore: 'cloud-download-outline',
  DeletedComplaints: 'trash-outline',
  Appearance: 'color-palette-outline',
  OfficerSettings: 'settings-outline',
  ServiceProvidersMenu: 'people-outline',
  OfficerMain: 'grid-outline',
  GeneralSettings: 'settings-outline',
  OfficerSosAlerts: 'alert-circle-outline',
  AdminSosAlerts: 'alert-circle-outline',
  OfficerManagement: 'people-outline',
  Broadcast: 'megaphone-outline',
  ActivityLogs: 'shield-checkmark-outline',
  HomeBanners: 'images-outline',
  ContentManagement: 'create-outline',
  ReportSchedules: 'mail-outline',
  ManageAdmins: 'key-outline',
  CreateSHOMenu: 'person-add-outline',
  LocationDataMenu: 'map-outline',
  AdminSettings: 'settings-outline',
  AppSettingsMenu: 'toggle-outline',
  CategoriesMenu: 'pricetags-outline',
  FaqManagementMenu: 'help-circle-outline',
  LanguageManagementMenu: 'language-outline',
  AdminAnalytics: 'stats-chart-outline',
  AdminLeaderboard: 'trophy-outline',
  OfficerPerformance: 'stats-chart-outline',
};

// 🎨 डिज़ाइन सुधार: पहले हर icon एक ही ग्रे रंग में था (सिर्फ़ active item माroon होता
// था) — अब हर आइटम को अर्थपूर्ण रंग मिला है (SOS/अलर्ट = लाल, शिकायत श्रेणियां = गुलाबी,
// सेवाएं = अलग-अलग रंग, सेटिंग्स/प्रबंधन = तटस्थ नेवी/ग्रे) — मेनू को एक नज़र में स्कैन
// करना आसान हो जाता है। active item अब भी हमेशा maroon ही रहता है (पहचान साफ़ रहे)।
const DRAWER_ICON_COLORS = {
  AdminDashboard: colors.inkNavy,
  CitizenMain: colors.inkNavy,
  OfficerMain: colors.inkNavy,
  Manage_counselling: colors.shaktiMaroonLight,
  Manage_legal_aid: colors.inkNavyLight,
  Manage_self_defence: colors.sage,
  Manage_empowerment: colors.marigold,
  // 🐛 बग फ़िक्स: My_* (नागरिक के अपने अनुरोध) के लिए color भी गायब था — icon भूरे
  // (default) रंग में दिखता, बाकी colorful मेनू से मेल न खाता
  My_counselling: colors.shaktiMaroonLight,
  My_legal_aid: colors.inkNavyLight,
  My_self_defence: colors.sage,
  My_empowerment: colors.marigold,
  CatMahilaHelp: colors.shaktiMaroon,
  CatAntiRomeo: colors.inkNavyLight,
  CatDomesticViolence: colors.shaktiMaroon,
  CatVoiceComplaint: colors.marigold,
  SafeTravel: colors.sage,
  QRScannerMenu: colors.marigold,
  AllComplaints: colors.shaktiMaroon,
  CitizenSosAlerts: colors.alert,
  OfficerSosAlerts: colors.alert,
  AdminSosAlerts: colors.alert,
  CitizenAllComplaints: colors.shaktiMaroon,
  CitizenNearby: colors.sage,
  CitizenTrack: colors.inkNavyLight,
  CitizenProfile: colors.shaktiMaroon,
  Atr: colors.inkNavyLight,
  BackupRestore: colors.inkGrey,
  Appearance: colors.shaktiMaroonLight,
  OfficerSettings: colors.inkGrey,
  ServiceProvidersMenu: colors.sage,
  GeneralSettings: colors.inkGrey,
  OfficerManagement: colors.inkNavyLight,
  Broadcast: colors.marigold,
  ActivityLogs: colors.inkGrey,
  HomeBanners: colors.shaktiMaroonLight,
  ContentManagement: colors.marigold,
  ReportSchedules: colors.inkNavyLight,
  ManageAdmins: colors.inkGrey,
  CreateSHOMenu: colors.sage,
  LocationDataMenu: colors.sage,
  AdminSettings: colors.inkGrey,
  AppSettingsMenu: colors.inkGrey,
  CategoriesMenu: colors.marigold,
  FaqManagementMenu: colors.inkNavyLight,
  LanguageManagementMenu: colors.shaktiMaroonLight,
};

// ============================================================
// एडमिन का side menu — तय क्रम में, और लंबी सूचियों के लिए समूह (collapsible)।
//
// 27 menus एक सीधी सूची में बहुत लंबे लगते थे और ज़रूरी चीज़ें नीचे दब जाती थीं।
// अब रोज़ काम आने वाले menus ऊपर सीधे दिखते हैं, और "प्रबंधन" व "सेटिंग्स"
// जैसी कम इस्तेमाल होने वाली चीज़ें समूह में बंद रहती हैं — दबाने पर खुलती हैं।
// ============================================================

// ऊपर सीधे दिखने वाले menus — इसी क्रम में
const ADMIN_MENU_ORDER = [
  'AdminDashboard',
  'AdminAnalytics',
  'AdminLeaderboard',
  'AdminSosAlerts',
  'AllComplaints',
  'SafeTravel',
  'CatMahilaHelp',
  'CatAntiRomeo',
  'CatDomesticViolence',
  'CatVoiceComplaint',
  'Manage_counselling',
  'Manage_legal_aid',
  'Manage_self_defence',
  'Manage_empowerment',
];

// समूह — कोष्ठक वाली चीज़ें
const ADMIN_MENU_GROUPS = [
  {
    key: 'management',
    label: 'प्रबंधन',
    icon: 'people-circle-outline',
    items: ['OfficerManagement', 'ManageAdmins', 'CreateSHOMenu', 'HomeBanners', 'ContentManagement'],
  },
];

// समूहों के बाद फिर सीधे दिखने वाले menus
const ADMIN_MENU_AFTER = [
  'Atr',
  'QRScannerMenu',
  'Broadcast',
  'ActivityLogs',
  'ReportSchedules',
  'LocationDataMenu',
];

const ADMIN_SETTINGS_GROUP = {
  key: 'settings',
  label: 'सेटिंग्स',
  icon: 'settings-outline',
  items: [
    'GeneralSettings',
    'Appearance',
    'AdminSettings',
    'AppSettingsMenu',
    'CategoriesMenu',
    'FaqManagementMenu',
    'LanguageManagementMenu',
    'BackupRestore',
    'DeletedComplaints',
  ],
};

function AdminDrawerContent(props) {
  const { user } = useApp();
  const [openGroups, setOpenGroups] = useState({});
  const roleLabel2 =
    user?.adminRole === 'super_admin'
      ? 'Super Admin'
      : user?.adminRole === 'monitor'
      ? `Monitor · ${user?.rank || ''}`
      : `District Admin${user?.district ? ' · ' + user.district : ''}`;

  // कौन से menus असल में मौजूद हैं (भूमिका के अनुसार कुछ नहीं होते)
  const available = new Map(props.state.routes.map((r, i) => [r.name, { route: r, index: i }]));
  const focusedName = props.state.routes[props.state.index]?.name;

  const renderItem = (name, indent = false) => {
    const entry = available.get(name);
    if (!entry) return null; // इस भूमिका को यह menu नहीं मिला
    const options = props.descriptors[entry.route.key].options;
    return (
      <DrawerItem
        key={entry.route.key}
        label={options.drawerLabel ?? entry.route.name}
        icon={({ color, size }) =>
          DRAWER_ICONS[name] ? (
            <Ionicons name={DRAWER_ICONS[name]} size={size} color={focusedName === name ? color : DRAWER_ICON_COLORS[name] || color} />
          ) : null
        }
        focused={focusedName === name}
        activeTintColor={colors.shaktiMaroon}
        activeBackgroundColor={colors.shaktiMaroonWash}
        style={indent ? { marginLeft: 16 } : undefined}
        onPress={() => props.navigation.navigate(name)}
      />
    );
  };

  const renderGroup = (g) => {
    const items = g.items.filter((n) => available.has(n));
    if (items.length === 0) return null;
    const open = !!openGroups[g.key];
    // समूह के अंदर कोई menu खुला हो तो समूह भी उभरा दिखे
    const hasFocus = items.includes(focusedName);
    return (
      <View key={g.key}>
        <TouchableOpacity
          style={[styles.groupRow, hasFocus && styles.groupRowActive]}
          onPress={() => setOpenGroups({ ...openGroups, [g.key]: !open })}
          activeOpacity={0.7}
        >
          <Ionicons name={g.icon} size={22} color={hasFocus ? colors.shaktiMaroon : colors.inkGrey} />
          <Text style={[styles.groupLabel, hasFocus && { color: colors.shaktiMaroon }]}>
            {tt(g.label)}
          </Text>
          <View style={styles.groupCount}>
            <Text style={styles.groupCountText}>{items.length}</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.inkLight} />
        </TouchableOpacity>
        {open && items.map((n) => renderItem(n, true))}
      </View>
    );
  };

  // सूची में जो नाम कहीं नहीं आए — छूटे नहीं, आख़िर में दिखा देते हैं
  const listed = new Set([
    ...ADMIN_MENU_ORDER,
    ...ADMIN_MENU_GROUPS.flatMap((g) => g.items),
    ...ADMIN_MENU_AFTER,
    ...ADMIN_SETTINGS_GROUP.items,
  ]);
  const leftover = props.state.routes.map((r) => r.name).filter((n) => !listed.has(n));

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
      <DrawerProfileHeader
        user={user}
        subtitle={roleLabel2}
        onPress={() => {
          props.navigation.navigate('GeneralSettings');
          props.navigation.closeDrawer();
        }}
      />

      {ADMIN_MENU_ORDER.map((n) => renderItem(n))}
      {ADMIN_MENU_GROUPS.map(renderGroup)}
      {ADMIN_MENU_AFTER.map((n) => renderItem(n))}
      {renderGroup(ADMIN_SETTINGS_GROUP)}
      {leftover.map((n) => renderItem(n))}
    </DrawerContentScrollView>
  );
}

function AdminDrawer({ logout }) {
  const { user } = useApp();
  // काउंसलिंग सत्र सिर्फ़ DSP, ASP, SSP और Super Admin तय कर सकते हैं
  // (backend में भी यही नियम लागू है — दोनों तरफ़ से सुरक्षित)
  const canManageCounselling =
    user?.adminRole === 'super_admin' ||
    (user?.adminRole === 'monitor' && ['DSP', 'ASP', 'SSP'].includes(user?.rank));
  // बैकअप/पुनर्स्थापन सिर्फ़ Super Admin — इसमें पूरे नागरिकों का डेटा होता है
  const isSuperAdmin = user?.adminRole === 'super_admin';
  const isMonitor = user?.adminRole === 'monitor'; // DSP/ASP/SSP

  // ============================================================
  // साइड मेनू permission gate — सिर्फ़ DSP/ASP/SSP (monitor) खातों पर लागू।
  // super_admin व district_admin को हमेशा पूरा मेनू दिखता है (पहले जैसा)।
  // जो key नीचे true नहीं है (Super Admin ने permission नहीं दी), वह मेनू
  // आइटम DSP/ASP/SSP को दिखेगा ही नहीं — permission मिलते ही (अगले लॉगिन पर)
  // वह आइटम अपने-आप दिखने लगेगा।
  // ============================================================
  const menuPerms = user?.menuPermissions || {};
  const canSee = (key) => !isMonitor || !!menuPerms[key];

  return (
    <Drawer.Navigator
      drawerContent={(props) => <AdminDrawerContent {...props} />}
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.shaktiMaroon },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: 16, fontWeight: '700' },
    // 🐛 बग फ़िक्स (शीर्षक व बटन का ऊपर-नीचे चढ़ना): headerTitle पर पहले से flexShrink
    // लगा था, पर वह काम नहीं कर रहा था — flexShrink तभी असर करता है जब उसका parent
    // container ख़ुद किसी सीमा में बँधा हो। React Navigation का title-container अपनी
    // प्राकृतिक चौड़ाई ले लेता था, इसलिए लंबे शीर्षक ("Analysis (KPIs & Trends)",
    // "Self-defence training") दाईं ओर के बटनों के नीचे चले जाते और भाषा-बटन उनके
    // ऊपर चढ़ा दिखता। अब container को flex: 1 देकर बाँधा गया है (यानी बची हुई जगह
    // ही मिलेगी, उससे ज़्यादा नहीं) — तभी अंदर का flexShrink/ellipsis असर करता है।
    // और headerRight को flexShrink: 0 — ताकि बटन कभी दबकर टूटें नहीं।
    headerTitleContainerStyle: { flex: 1, marginHorizontal: 4 },
    headerRightContainerStyle: { flexShrink: 0, paddingRight: 4 },
        headerTitle: ({ children }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <PoliceLogoIcon size={22} />
            <Text
              style={{ color: colors.white, fontSize: 16, fontWeight: '700', flexShrink: 1 }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {children}
            </Text>
          </View>
        ),
        drawerActiveTintColor: colors.shaktiMaroon,
        drawerActiveBackgroundColor: colors.shaktiMaroonWash,
        drawerIcon: ({ color, size }) => <Ionicons name={DRAWER_ICONS[route.name]} size={size} color={color} />,
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <LanguageToggleButton />
            <NotificationBell />
            <TouchableOpacity onPress={logout} style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: '#DCC7CE', fontSize: 12, fontWeight: '600' }}>{tt('लॉगआउट')}</Text>
            </TouchableOpacity>
          </View>
        ),
      })}
    >
      <Drawer.Screen name="AdminDashboard" component={AdminHomeScreen} options={{ title: tt('डैशबोर्ड'), drawerLabel: tt('डैशबोर्ड') }} />
      {/* 🆕 KPIs, Trends व Performance Analytics — पहले यह screen कोड में मौजूद थी
          पर कहीं भी navigator में register नहीं थी (कोई route ही नहीं था), इसलिए
          कोई भी इसे खोल नहीं पाता था। अब डैशबोर्ड के ठीक बाद उपलब्ध है। */}
      {canSee('analytics') && (
        <Drawer.Screen
          name="AdminAnalytics"
          component={AdminAnalyticsScreen}
          options={{ title: tt('विश्लेषण (KPIs व Trends)'), drawerLabel: tt('विश्लेषण डैशबोर्ड') }}
        />
      )}
      {/* 🆕 District → Station Explorer — हर ज़िले/थाने का तुलनात्मक Analytics+Performance */}
      {canSee('analytics') && (
        <Drawer.Screen
          name="DistrictExplorer"
          component={DistrictExplorerScreen}
          options={{ title: tt('ज़िला व थाना Explorer'), drawerLabel: tt('ज़िला व थाना Explorer') }}
        />
      )}
      {canSee('leaderboard') && (
        <Drawer.Screen
          name="AdminLeaderboard"
          component={AdminLeaderboardScreen}
          options={{ title: tt('अधिकारी Leaderboard'), drawerLabel: tt('परफ़ॉर्मेंस Leaderboard') }}
        />
      )}
      <Drawer.Screen
        name="AdminSosAlerts"
        component={SosAlertsScreen}
        options={{ title: tt('🆘 SOS अलर्ट'), drawerLabel: tt('🆘 SOS अलर्ट') }}
      />
      {isSuperAdmin && (
        <Drawer.Screen
          name="Appearance"
          component={AppearanceScreen}
          options={{ title: tt('रूप-रंग व लेआउट'), drawerLabel: tt('रूप-रंग व लेआउट') }}
        />
      )}
      {isSuperAdmin && (
        <Drawer.Screen
          name="BackupRestore"
          component={BackupRestoreScreen}
          options={{ title: tt('बैकअप व पुनर्स्थापन'), drawerLabel: tt('बैकअप व पुनर्स्थापन') }}
        />
      )}
      {/* 🆕 Soft Delete की "वापसी" — पहले हटाई गई शिकायत हमेशा के लिए खो जाती थी,
          अब यहां से Super Admin एक टैप में वापस ला सकते हैं */}
      {isSuperAdmin && (
        <Drawer.Screen
          name="DeletedComplaints"
          component={DeletedComplaintsScreen}
          options={{ title: tt('हटाई गई शिकायतें'), drawerLabel: tt('हटाई गई शिकायतें') }}
        />
      )}
      {/* ⚠️ Super Admin के मेनू से 'कार्यवाही आख्या (ATR)' हटा दिया गया — सिर्फ़ DSP/ASP/SSP को
          permission मिलने पर ही यह दिखेगा (Super Admin को अब यह मेनू आइटम बिल्कुल नहीं दिखेगा) */}
      {isMonitor && ['DSP', 'ASP', 'SSP'].includes(user?.rank) && canSee('atr') && (
        <Drawer.Screen
          name="Atr"
          component={AtrScreen}
          options={{ title: tt('कार्यवाही आख्या (ATR)'), drawerLabel: tt('कार्यवाही आख्या (ATR)') }}
        />
      )}
      {canManageCounselling &&
        canSee('serviceRequests') &&
        Object.values(SERVICE_TYPES).map((s) => (
          <Drawer.Screen
            key={`mg-${s.key}`}
            name={`Manage_${s.key}`}
            component={ServiceRequestsManagementScreen}
            initialParams={{ type: s.key }}
            options={{
              title: `${s.emoji} ${tt(s.label)}`,
              drawerLabel: `${s.emoji} ${tt(s.label)}`,
              drawerIcon: () => null,
            }}
          />
        ))}

      {isSuperAdmin && (
        <Drawer.Screen
          name="ServiceProvidersMenu"
          component={ServiceProvidersManagementScreen}
          options={{ title: tt('काउंसलर / प्रशिक्षक सूची'), drawerLabel: tt('काउंसलर सूची') }}
        />
      )}

      {canSee('allComplaints') && (
        <Drawer.Screen name="AllComplaints" component={AllComplaintsScreen} options={{ title: tt('सभी शिकायतें'), drawerLabel: tt('सभी शिकायत') }} initialParams={{}} />
      )}
      {canSee('safeTravel') && (
        <Drawer.Screen name="SafeTravel" component={SafeTravelScreen} options={{ title: tt('सुरक्षित यात्रा (SOS)'), drawerLabel: tt('सुरक्षित यात्रा') }} />
      )}
      {canSee('allComplaints') && (
        <>
          <Drawer.Screen name="CatMahilaHelp" component={AllComplaintsScreen} options={{ title: tt('महिला हेल्प डेस्क'), drawerLabel: tt('महिला हेल्प डेस्क') }} initialParams={{ category: 'महिला हेल्प डेस्क' }} />
          <Drawer.Screen name="CatAntiRomeo" component={AllComplaintsScreen} options={{ title: tt('एंटी रोमियो स्क्वॉड'), drawerLabel: tt('एंटी रोमियो') }} initialParams={{ category: 'एंटी रोमियो स्क्वॉड' }} />
          <Drawer.Screen name="CatDomesticViolence" component={AllComplaintsScreen} options={{ title: tt('घरेलू हिंसा'), drawerLabel: tt('घरेलू हिंसा') }} initialParams={{ category: 'घरेलू हिंसा' }} />
          <Drawer.Screen name="CatVoiceComplaint" component={AllComplaintsScreen} options={{ title: tt('वॉइस शिकायत'), drawerLabel: tt('वॉयस कंप्लेंट') }} initialParams={{ category: 'वॉइस शिकायत' }} />
        </>
      )}

      {(isSuperAdmin || !isMonitor) && (
        <Drawer.Screen name="OfficerManagement" component={OfficerManagementScreen} options={{ title: tt('अधिकारी प्रबंधन'), drawerLabel: tt('अधिकारी मैनेजमेंट') }} />
      )}
      {(isSuperAdmin || (isMonitor && user?.rank === 'SSP')) && (
        <Drawer.Screen name="ManageAdmins" component={ManageAdminsScreen} options={{ title: tt('District-Admin प्रबंधन'), drawerLabel: tt('डिस्ट्रिक एडमिन मैनेजमेंट') }} />
      )}
      {canSee('homeBanners') && (
        <Drawer.Screen name="HomeBanners" component={AdminBannersScreen} options={{ title: tt('Home बैनर प्रबंधन'), drawerLabel: tt('होम बैनर') }} />
      )}
      {/* 🆕 पुलिस सेवाएं — पहले ये ऐप के कोड में थीं, इसलिए कोई भी बदलाव नई APK मांगता था।
          ⚠️ सिर्फ़ Super Admin — backend पर भी यही शर्त है (requireSuperAdmin)। दोनों का
          मेल ज़रूरी है, वरना मेन्यू तो दिखता पर हर कार्रवाई 401 देती। */}
      {isSuperAdmin && (
        <Drawer.Screen name="PoliceServicesManagement" component={PoliceServicesManagementScreen} options={{ title: tt('पुलिस सेवाएं प्रबंधन'), drawerLabel: tt('पुलिस सेवाएं') }} />
      )}
      {canSee('contentManagement') && (
        <Drawer.Screen name="ContentManagement" component={ContentManagementScreen} options={{ title: tt('योजना/हेल्पलाइन प्रबंधन'), drawerLabel: tt('योजना, हेल्पलाइन') }} />
      )}
      {canSee('qrScanner') && (
        <Drawer.Screen name="QRScannerMenu" component={QRScannerScreen} options={{ title: tt('QR स्कैन करें'), drawerLabel: 'QR' }} />
      )}

      {canSee('broadcast') && (
        <Drawer.Screen name="Broadcast" component={BroadcastScreen} options={{ title: 'Broadcast', drawerLabel: 'Broadcast' }} />
      )}
      {isSuperAdmin && canSee('activityLogs') && (
        <Drawer.Screen name="ActivityLogs" component={AdminActivityLogsScreen} options={{ title: tt('गतिविधि लॉग'), drawerLabel: tt('गतिविधि लॉग') }} />
      )}
      {canSee('reportSchedules') && (
        <Drawer.Screen name="ReportSchedules" component={ReportSchedulesScreen} options={{ title: 'Scheduled Reports', drawerLabel: 'Scheduled Reports' }} />
      )}
      {(isSuperAdmin || (isMonitor && user?.rank === 'DSP')) && (
        <Drawer.Screen name="CreateSHOMenu" component={CreateSHOScreen} options={{ title: tt('नया SHO जोड़ें'), drawerLabel: tt('नया SHO जोड़ें') }} />
      )}
      {canSee('locationData') && (
        <Drawer.Screen name="LocationDataMenu" component={LocationDataScreen} options={{ title: tt('ज़िला/थाना सूची'), drawerLabel: tt('ज़िला/थाना सूची') }} />
      )}
      <Drawer.Screen
        name="GeneralSettings"
        component={SettingsScreen}
        options={{ title: tt('सेटिंग्स'), drawerLabel: tt('सेटिंग्स') }}
      />
      {isSuperAdmin && (
        <Drawer.Screen name="AdminSettings" component={AdminSettingsScreen} options={{ title: tt('उन्नत एडमिन सेटिंग्स'), drawerLabel: tt('उन्नत एडमिन सेटिंग्स') }} />
      )}
      {isSuperAdmin && (
        <Drawer.Screen name="AppSettingsMenu" component={AppSettingsScreen} options={{ title: tt('ऐप सेटिंग्स'), drawerLabel: tt('ऐप सेटिंग्स (Super Admin)') }} />
      )}
      {canSee('categoriesManagement') && (
        <Drawer.Screen name="CategoriesMenu" component={CategoriesManagementScreen} options={{ title: tt('शिकायत श्रेणियां'), drawerLabel: tt('शिकायत श्रेणियां') }} />
      )}
      {canSee('faqManagement') && (
        <Drawer.Screen name="FaqManagementMenu" component={FaqManagementScreen} options={{ title: tt('FAQ / मदद प्रबंधन'), drawerLabel: tt('FAQ / मदद प्रबंधन') }} />
      )}
      {isSuperAdmin && (
        <Drawer.Screen name="LanguageManagementMenu" component={LanguageManagementScreen} options={{ title: tt('भाषा प्रबंधन'), drawerLabel: tt('भाषा प्रबंधन') }} />
      )}
    </Drawer.Navigator>
  );
}

export default function RootNavigator() {
  const { ready, role, logout } = useApp();

  if (!ready) {
    // यही वह खाली गुलाबी स्क्रीन थी जो पहले दिखती थी — अब branded loader
    return <SplashLoader message="आपका खाता जाँचा जा रहा है…" />;
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>
      <Stack.Navigator screenOptions={{ animation: 'slide_from_right', gestureEnabled: true }}>
        {!role ? (
          <>
            <Stack.Screen name="Home" component={GuestTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="NearbyHelp"
              component={NearbyHelpScreen}
              options={{ title: tt('नज़दीकी सहायता'), headerStyle: { backgroundColor: colors.shaktiMaroon }, headerTintColor: colors.white }}
            />
            <Stack.Screen
              name="PoliceServices"
              component={PoliceServicesScreen}
              options={{ title: tt('पुलिस सेवाएं'), headerStyle: { backgroundColor: colors.shaktiMaroon }, headerTintColor: colors.white }}
            />
            <Stack.Screen
              name="ServiceRequestForm"
              component={ServiceRequestFormScreen}
              options={({ route }) => ({
                title: tt(SERVICE_TYPES[route.params?.type]?.label || 'सेवा अनुरोध'),
                ...headerOptions(logout),
              })}
            />
            <Stack.Screen
              name="TrackComplaint"
              component={TrackComplaintScreen}
              options={{ title: tt('शिकायत ट्रैक करें'), headerStyle: { backgroundColor: colors.shaktiMaroon }, headerTintColor: colors.white }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ title: tt('गोपनीयता नीति'), headerStyle: { backgroundColor: colors.shaktiMaroon }, headerTintColor: colors.white }}
            />
          </>
        ) : role === 'citizen' ? (
          <>
            {/* 🐛 असली बग यहीं था: "Home" पहले plain HomeScreen (बिना Drawer/साइड-मेनू के)
                दिखाता था, और Stack में यही पहला (= login के बाद डिफ़ॉल्ट) route था।
                इसलिए नागरिक login के बाद जिस स्क्रीन पर पहुंचता था उसमें साइड-मेनू ही नहीं
                होता था, और HomeScreen के अंदर के "मेरी शिकायतें"/"प्रोफ़ाइल" बटन जो
                navigate('CitizenAllComplaints')/navigate('CitizenProfile') करते हैं — वो
                routes सिर्फ़ Drawer के अंदर मौजूद हैं, इसलिए टैप करने पर कुछ नहीं होता था
                ("डैशबोर्ड खुल ही नहीं रहा" जैसा महसूस होता था)। अब "Home" भी वही
                Drawer-wrapped अनुभव (CitizenDrawer → CitizenMain → HomeScreen) दिखाता है
                जो "CitizenTabs" दिखाता है — दोनों नाम अब एक ही, सही जगह पर ले जाते हैं। */}
            <Stack.Screen name="Home" options={{ headerShown: false }}>
              {() => <CitizenDrawer logout={logout} />}
            </Stack.Screen>
            <Stack.Screen name="CitizenTabs" options={{ headerShown: false }}>
              {() => <CitizenDrawer logout={logout} />}
            </Stack.Screen>
            {/* 🐛 यह स्क्रीन पहले सिर्फ़ बिना-लॉगिन वाले stack में थी — इसलिए लॉगिन
                किए नागरिक के "अनुरोध भेजें" दबाने पर कुछ नहीं होता था */}
            <Stack.Screen
              name="ServiceRequestForm"
              component={ServiceRequestFormScreen}
              options={({ route }) => ({
                title: tt(SERVICE_TYPES[route.params?.type]?.label || 'सेवा अनुरोध'),
                ...headerOptions(logout),
              })}
            />
            <Stack.Screen
              name="Faq"
              component={FaqScreen}
              options={{ title: tt('मदद और सामान्य प्रश्न'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="ComplaintForm"
              component={CategoryComplaintFormScreen}
              options={{ title: tt('नई शिकायत'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="ComplaintDetail"
              component={ComplaintDetailScreen}
              options={{ title: tt('शिकायत ट्रैक करें'), ...headerOptions(logout) }}
            />
            {/* 🆕 Complaint Chat — नागरिक अपनी शिकायत पर नियुक्त अधिकारी से बात कर सकता है */}
            <Stack.Screen
              name="ComplaintChat"
              component={ComplaintChatScreen}
              options={{ title: tt('बातचीत'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="NearbyHelp"
              component={NearbyHelpScreen}
              options={{ title: tt('नज़दीकी सहायता'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="PoliceServices"
              component={PoliceServicesScreen}
              options={{ title: tt('पुलिस सेवाएं'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="TrackComplaint"
              component={TrackComplaintScreen}
              options={{ title: tt('शिकायत ट्रैक करें (नंबर से)'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ title: tt('सूचनाएं'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="ActiveSessions"
              component={ActiveSessionsScreen}
              options={{ title: tt('मेरे लॉगिन डिवाइस'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ title: tt('गोपनीयता नीति'), ...headerOptions(logout) }}
            />
          </>
        ) : role === 'officer' ? (
          <>
            <Stack.Screen name="OfficerTabs" options={{ headerShown: false }}>
              {() => <OfficerDrawer logout={logout} />}
            </Stack.Screen>
            <Stack.Screen
              name="OfficerTable"
              component={AllComplaintsScreen}
              options={{ title: tt('शिकायतें'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="ComplaintDetail"
              component={ComplaintDetailScreen}
              options={{ title: tt('शिकायत विवरण'), ...headerOptions(logout) }}
            />
            {/* 🆕 Complaint Chat — नियुक्त अधिकारी/SHO अपने केस के नागरिक से बात कर सकते हैं */}
            <Stack.Screen
              name="ComplaintChat"
              component={ComplaintChatScreen}
              options={{ title: tt('बातचीत'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="Conversation"
              component={ConversationScreen}
              options={{ title: tt('बातचीत'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ title: tt('सूचनाएं'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="ActiveSessions"
              component={ActiveSessionsScreen}
              options={{ title: tt('मेरे लॉगिन डिवाइस'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="QRScanner"
              component={QRScannerScreen}
              options={{ title: tt('QR स्कैन करें'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="QRVerifyResult"
              component={QRVerifyResultScreen}
              options={{ title: tt('QR सत्यापन'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ title: tt('गोपनीयता नीति'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="CreateOfficer"
              component={CreateOfficerScreen}
              options={{ title: tt('नया जांचकर्ता जोड़ें'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="MyStationOfficers"
              component={MyStationOfficersScreen}
              options={{ title: tt('मेरे थाने के अधिकारी'), ...headerOptions(logout) }}
            />
          </>
        ) : role === 'counsellor' ? (
          <>
            {/* 🆕 काउंसलर/प्रशिक्षक — अपनी अपॉइंटमेंट्स + प्रोफ़ाइल तक ही सीमित,
                किसी शिकायत/नागरिक डेटा तक पहुंच नहीं (उनका काम भूमिका सीमित है) */}
            <Stack.Screen
              name="CounsellorHome"
              component={CounsellorHomeScreen}
              options={{ title: tt('मेरी अपॉइंटमेंट्स'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="CounsellorProfile"
              component={CounsellorProfileScreen}
              options={{ title: tt('मेरी प्रोफ़ाइल'), ...headerOptions(logout) }}
            />
            {/* 🆕 पहले काउंसलर के पास सूचनाएं देखने की कोई स्क्रीन ही नहीं थी — भले ही
                push notification आ जाए, ऐप के अंदर उसे दोबारा देखने का कोई रास्ता नहीं था */}
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ title: tt('सूचनाएं'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="ActiveSessions"
              component={ActiveSessionsScreen}
              options={{ title: tt('मेरे लॉगिन डिवाइस'), ...headerOptions(logout) }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="AdminDrawer" options={{ headerShown: false }}>
              {() => <AdminDrawer logout={logout} />}
            </Stack.Screen>
            <Stack.Screen
              name="ComplaintDetail"
              component={ComplaintDetailScreen}
              options={{ title: tt('शिकायत विवरण'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="QRVerifyResult"
              component={QRVerifyResultScreen}
              options={{ title: tt('QR सत्यापन'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
              options={{ title: tt('गोपनीयता नीति'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="OfficerForm"
              component={OfficerFormScreen}
              options={{ title: tt('अधिकारी'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="AdminProfile"
              component={AdminProfileScreen}
              options={{ title: tt('प्रोफ़ाइल'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="Conversation"
              component={ConversationScreen}
              options={{ title: tt('बातचीत'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ title: tt('सूचनाएं'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="ActiveSessions"
              component={ActiveSessionsScreen}
              options={{ title: tt('मेरे लॉगिन डिवाइस'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="QRScanner"
              component={QRScannerScreen}
              options={{ title: tt('QR स्कैन करें'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="CreateSHO"
              component={CreateSHOScreen}
              options={{ title: tt('नया SHO जोड़ें'), ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="BulkImport"
              component={BulkImportScreen}
              options={{ title: 'Bulk Officer Import', ...headerOptions(logout) }}
            />
            <Stack.Screen
              name="OfficerStatus"
              component={OfficerStatusScreen}
              options={{ title: tt('अधिकारी स्थिति (Live)'), ...headerOptions(logout) }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// side menu के समूहों की शैली
const styles = StyleSheet.create({
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginHorizontal: 10,
    borderRadius: 8,
  },
  groupRowActive: { backgroundColor: colors.shaktiMaroonWash },
  groupLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.inkGrey },
  groupCount: { backgroundColor: colors.border, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1 },
  groupCountText: { fontSize: 10.5, fontWeight: '800', color: colors.inkGrey },
});
