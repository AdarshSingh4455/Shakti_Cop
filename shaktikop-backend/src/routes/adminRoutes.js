const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole, requireSuperAdmin, blockMonitor, requireDSPOrSuperAdmin, requireSSPOrSuperAdmin } = require('../middleware/auth');
const {
  listAllOfficers,
  createOfficer,
  updateOfficer,
  transferOfficer,
  setOfficerStatus,
  updateOfficerPermissions,
  deleteOfficer,
  getMyAdminProfile,
  updateMyAdminProfile,
  updateMyAdminPhoto,
  changeAdminPassword,
  updateAdminPushToken,
  getCategoryStats,
  listActivityLogs,
  listAdmins,
  createDistrictAdmin,
  deleteAdmin,
  setAdminStatus,
  transferAdmin,
  updateAdminMenuPermissions,
  bulkImportOfficers,
  getOfficerStatusOverview,
  updateOfficerRank,
  createSHOByDSP,
  listDeletionRequests,
  reviewDeletionRequest,
} = require('../controllers/adminController');
const { listAllBanners, createBanner, updateBanner, deleteBanner } = require('../controllers/bannersController');
const { listAllServices, createService, updateService, deleteService } = require('../controllers/policeServicesController');
const { getOverview, getFilterOptions, getOfficerLeaderboard, getHeatmapPoints, getDistrictsSummary, getStationsSummary, getSlaAtRisk, getRepeatOffenders, getOfficerWorkload, getSosResponseAnalytics, getRepeatVictims } = require('../controllers/analyticsController');
const { sendBroadcast, getBroadcastHistory } = require('../controllers/broadcastController');
const { findPossibleDuplicates } = require('../controllers/duplicateController');
const { listRoster, addRosterEntry, deleteRosterEntry } = require('../controllers/rosterController');
const {
  listAdminWelfare,
  createWelfareItem,
  updateWelfareItem,
  deleteWelfareItem,
  listAdminHelplines,
  createHelpline,
  updateHelpline,
  deleteHelpline,
} = require('../controllers/contentController');
const { listSchedules, createSchedule, updateSchedule, deleteSchedule, generateNow } = require('../controllers/reportsController');
const { getOverdueComplaints } = require('../controllers/complaintController');
const { listLocationData, bulkUploadLocationData, addLocationEntry, updateLocationEntry, deleteLocationEntry } = require('../controllers/locationDataController');
const { listSettings, updateSetting } = require('../controllers/appSettingsController');
const { listAllCategories, createCategory, updateCategory, deactivateCategory } = require('../controllers/categoriesController');
const { listAllFaq, createFaq, updateFaq, deleteFaq } = require('../controllers/faqController');
const {
  listLocales,
  createLocale,
  deleteLocale,
  listTranslations,
  bulkUploadTranslations,
} = require('../controllers/localeController');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// ---------- देखना (view) — monitor (DSP/ASP/SSP) सहित सभी admin roles को उपलब्ध ----------
router.get('/officers', asyncHandler(listAllOfficers));
router.get('/officer-status-overview', asyncHandler(getOfficerStatusOverview));
router.get('/me', asyncHandler(getMyAdminProfile));
router.get('/stats/by-category', asyncHandler(getCategoryStats));
// 🐛 बग फ़िक्स: पहले कोई scope-प्रतिबंध नहीं था — activity_logs तालिका में
// district/station जैसा कोई field ही नहीं है, इसलिए किसी भी admin भूमिका
// (DSP/ASP/SSP/district_admin) को पूरे राज्य का संवेदनशील audit-trail दिख
// जाता था — लॉगिन प्रयास, अधिकारी/एडमिन प्रबंधन जैसी हर जगह की गतिविधि।
// अब सिर्फ़ Super Admin तक सीमित (जैसे backup/restore जैसी अन्य संवेदनशील सुविधाएं)।
router.get('/activity-logs', requireSuperAdmin, asyncHandler(listActivityLogs));
// 🆕 DPDP Act — खाता-हटाने के अनुरोधों की समीक्षा (सिर्फ़ Super Admin)
router.get('/deletion-requests', requireSuperAdmin, asyncHandler(listDeletionRequests));
router.patch('/deletion-requests/:id', requireSuperAdmin, asyncHandler(reviewDeletionRequest));
router.get('/overdue-complaints', asyncHandler(getOverdueComplaints));
router.get('/banners', asyncHandler(listAllBanners));
// 🆕 पुलिस सेवाएं — पहले ये ऐप के कोड में लिखी थीं, इसलिए कोई भी बदलाव नई APK मांगता था
router.get('/police-services', asyncHandler(listAllServices));
router.get('/analytics/overview', asyncHandler(getOverview));
router.get('/analytics/filter-options', asyncHandler(getFilterOptions));
router.get('/analytics/officer-leaderboard', asyncHandler(getOfficerLeaderboard));
router.get('/analytics/districts-summary', asyncHandler(getDistrictsSummary));
router.get('/analytics/stations-summary', asyncHandler(getStationsSummary));
router.get('/analytics/sla-at-risk', asyncHandler(getSlaAtRisk));
router.get('/analytics/repeat-offenders', asyncHandler(getRepeatOffenders));
// 🆕 SOS पर प्रतिक्रिया-समय — इस ऐप का सबसे अहम आंकड़ा, अब तक कहीं मापा नहीं जाता था
router.get('/analytics/sos-response', asyncHandler(getSosResponseAnalytics));
// 🆕 बार-बार शिकायत करने वाली पीड़िताएं — बढ़ते ख़तरे का संकेत (पहचान कभी नहीं लौटती)
router.get('/analytics/repeat-victims', asyncHandler(getRepeatVictims));
router.get('/analytics/officer-workload', asyncHandler(getOfficerWorkload));
router.get('/analytics/heatmap', asyncHandler(getHeatmapPoints));
router.get('/broadcast/history', asyncHandler(getBroadcastHistory));
router.get('/duplicates', asyncHandler(findPossibleDuplicates));
router.get('/roster', asyncHandler(listRoster));
router.get('/content/welfare', asyncHandler(listAdminWelfare));
router.get('/content/helplines', asyncHandler(listAdminHelplines));
router.get('/report-schedules', asyncHandler(listSchedules));

// ---------- बदलाव (write) — monitor (DSP/ASP/SSP) को अनुमति नहीं ----------
router.post('/officers', blockMonitor, asyncHandler(createOfficer));
router.post('/officers/create-sho', requireDSPOrSuperAdmin, asyncHandler(createSHOByDSP));
router.post('/officers/bulk-import', blockMonitor, asyncHandler(bulkImportOfficers));
router.patch('/officers/:id', blockMonitor, asyncHandler(updateOfficer));
router.post('/officers/:id/transfer', blockMonitor, asyncHandler(transferOfficer));
router.patch('/officers/:id/status', blockMonitor, asyncHandler(setOfficerStatus));
router.patch('/officers/:id/permissions', blockMonitor, asyncHandler(updateOfficerPermissions));
router.patch('/officers/:id/rank', blockMonitor, asyncHandler(updateOfficerRank));
router.delete('/officers/:id', blockMonitor, asyncHandler(deleteOfficer));

router.patch('/me', asyncHandler(updateMyAdminProfile)); // अपनी प्रोफ़ाइल — monitor भी बदल सकता है
router.patch('/me/photo', asyncHandler(updateMyAdminPhoto)); // वैकल्पिक प्रोफ़ाइल फ़ोटो
router.patch('/me/password', asyncHandler(changeAdminPassword));
router.patch('/me/push-token', asyncHandler(updateAdminPushToken));

router.post('/banners', blockMonitor, asyncHandler(createBanner));
router.patch('/banners/:id', blockMonitor, asyncHandler(updateBanner));
router.delete('/banners/:id', blockMonitor, asyncHandler(deleteBanner));
router.post('/police-services', requireSuperAdmin, asyncHandler(createService));
router.patch('/police-services/:id', requireSuperAdmin, asyncHandler(updateService));
router.delete('/police-services/:id', requireSuperAdmin, asyncHandler(deleteService));

router.post('/broadcast', blockMonitor, asyncHandler(sendBroadcast));

router.post('/roster', blockMonitor, asyncHandler(addRosterEntry));
router.delete('/roster/:id', blockMonitor, asyncHandler(deleteRosterEntry));

router.post('/content/welfare', blockMonitor, asyncHandler(createWelfareItem));
router.patch('/content/welfare/:id', blockMonitor, asyncHandler(updateWelfareItem));
router.delete('/content/welfare/:id', blockMonitor, asyncHandler(deleteWelfareItem));
router.post('/content/helplines', blockMonitor, asyncHandler(createHelpline));
router.patch('/content/helplines/:id', blockMonitor, asyncHandler(updateHelpline));
router.delete('/content/helplines/:id', blockMonitor, asyncHandler(deleteHelpline));

router.post('/report-schedules', blockMonitor, asyncHandler(createSchedule));
router.patch('/report-schedules/:id', blockMonitor, asyncHandler(updateSchedule));
router.delete('/report-schedules/:id', blockMonitor, asyncHandler(deleteSchedule));
router.post('/report-schedules/:id/generate-now', blockMonitor, asyncHandler(generateNow));

// Granular RBAC — सिर्फ़ super_admin district-admin/monitor खाते बना/हटा सकता है
router.get('/admins', requireSuperAdmin, asyncHandler(listAdmins));
router.post('/admins', requireSSPOrSuperAdmin, asyncHandler(createDistrictAdmin));
router.patch('/admins/:id/status', requireSSPOrSuperAdmin, asyncHandler(setAdminStatus));
router.post('/admins/:id/transfer', requireSSPOrSuperAdmin, asyncHandler(transferAdmin));
router.patch('/admins/:id/menu-permissions', requireSuperAdmin, asyncHandler(updateAdminMenuPermissions));
router.delete('/admins/:id', requireSuperAdmin, asyncHandler(deleteAdmin));

// ज़िला/थाना मास्टर सूची — सिर्फ़ Super Admin अपलोड/प्रबंधित कर सकता है (पूरे app के लिए साझा डेटा)
router.get('/location-data', requireSuperAdmin, asyncHandler(listLocationData));
router.post('/location-data/bulk-upload', requireSuperAdmin, asyncHandler(bulkUploadLocationData));
router.post('/location-data', requireSuperAdmin, asyncHandler(addLocationEntry));
router.patch('/location-data/:id', requireSuperAdmin, asyncHandler(updateLocationEntry));
router.delete('/location-data/:id', requireSuperAdmin, asyncHandler(deleteLocationEntry));

// App Settings (feature flags, maintenance mode, min-version, SLA, theme) — सिर्फ़ Super Admin
router.get('/settings', requireSuperAdmin, asyncHandler(listSettings));
router.put('/settings/:key', requireSuperAdmin, asyncHandler(updateSetting));

// शिकायत श्रेणियां — सिर्फ़ Super Admin प्रबंधित करता है
router.get('/categories', requireSuperAdmin, asyncHandler(listAllCategories));
router.post('/categories', requireSuperAdmin, asyncHandler(createCategory));
router.patch('/categories/:id', requireSuperAdmin, asyncHandler(updateCategory));
router.delete('/categories/:id', requireSuperAdmin, asyncHandler(deactivateCategory));

// FAQ / मदद Content — सिर्फ़ Super Admin
router.get('/faq', requireSuperAdmin, asyncHandler(listAllFaq));
router.post('/faq', requireSuperAdmin, asyncHandler(createFaq));
router.patch('/faq/:id', requireSuperAdmin, asyncHandler(updateFaq));
router.delete('/faq/:id', requireSuperAdmin, asyncHandler(deleteFaq));

// Escalation — Admin खुद तुरंत चेक चलाकर देख सकता है (testing/मैनुअल ट्रिगर के लिए)
router.post('/escalation/run-now', requireSuperAdmin, asyncHandler(async (req, res) => {
  const { runEscalationCheck } = require('../utils/escalation');
  const result = await runEscalationCheck();
  res.json(result);
}));

// भाषाएं और अनुवाद — सिर्फ़ Super Admin
router.get('/locales', requireSuperAdmin, asyncHandler(listLocales));
router.post('/locales', requireSuperAdmin, asyncHandler(createLocale));
router.delete('/locales/:code', requireSuperAdmin, asyncHandler(deleteLocale));
router.get('/translations/:code', requireSuperAdmin, asyncHandler(listTranslations));
router.post('/translations/:code/bulk-upload', requireSuperAdmin, asyncHandler(bulkUploadTranslations));

module.exports = router;
