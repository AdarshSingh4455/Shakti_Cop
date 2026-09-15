const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole, requireSHOForCreation } = require('../middleware/auth');
const { listOfficers, getStats } = require('../controllers/officerController');
const {
  getMyOfficerProfile,
  updateMyOfficerPhoto,
  listOfficersForTransfer,
  updatePushToken,
  updateDutyStatus,
  getMyPerformance,
  getStationPerformance,
  updateNotificationPreferences,
  requestBackup,
  createSubordinateOfficer,
  listMyStationOfficers,
  updateMyStationOfficer,
  setMyStationOfficerStatus,
  changeMyPassword,
} = require('../controllers/officerSelfController');

const router = express.Router();

router.get('/officers', requireAuth, requireRole('admin'), asyncHandler(listOfficers));
router.get('/admin/stats', requireAuth, requireRole('admin'), asyncHandler(getStats));

router.get('/officers/me', requireAuth, requireRole('officer'), asyncHandler(getMyOfficerProfile));
router.patch('/officers/me/photo', requireAuth, requireRole('officer'), asyncHandler(updateMyOfficerPhoto));
router.get('/officers/for-transfer', requireAuth, requireRole('officer'), asyncHandler(listOfficersForTransfer));
router.patch('/officers/me/push-token', requireAuth, requireRole('officer'), asyncHandler(updatePushToken));
router.patch('/officers/me/duty-status', requireAuth, requireRole('officer'), asyncHandler(updateDutyStatus));
router.get('/officers/me/performance', requireAuth, requireRole('officer'), asyncHandler(getMyPerformance));
router.get('/officers/me/station-performance', requireAuth, requireRole('officer'), asyncHandler(getStationPerformance));
router.patch('/officers/me/notification-preferences', requireAuth, requireRole('officer'), asyncHandler(updateNotificationPreferences));
router.post('/officers/me/backup-request', requireAuth, requireRole('officer'), asyncHandler(requestBackup));
// 🆕 अधिकारी अपना पासवर्ड ख़ुद बदल सके — पहले इसका कोई रास्ता ही नहीं था
router.patch('/officers/me/password', requireAuth, requireRole('officer'), asyncHandler(changeMyPassword));
router.post('/officers/me/create-officer', requireAuth, requireSHOForCreation, asyncHandler(createSubordinateOfficer));
router.get('/officers/me/station-officers', requireAuth, requireSHOForCreation, asyncHandler(listMyStationOfficers));
router.patch('/officers/me/station-officers/:id', requireAuth, requireSHOForCreation, asyncHandler(updateMyStationOfficer));
router.patch('/officers/me/station-officers/:id/status', requireAuth, requireSHOForCreation, asyncHandler(setMyStationOfficerStatus));
// 🐛 बदलाव (उपयोगकर्ता-अनुरोध): SHO का officer-transfer (अपने ज़िले के अंदर भी) पूरी
// तरह हटा दिया गया — यह अब सिर्फ़ ऊपर से (admin/DSP/ASP) होना चाहिए, SHO खुद-सेवा
// (self-service) के रूप में नहीं। route ही हटाया गया है — transferMyStationOfficer
// controller-function अब कहीं से भी सुलभ (reachable) नहीं है।

module.exports = router;
