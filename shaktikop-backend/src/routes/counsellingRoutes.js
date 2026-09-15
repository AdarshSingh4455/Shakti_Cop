const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const {
  createRequest,
  listRequests,
  updateRequest,
  requestHistory,
  requestStats,
  listProviders,
  createProvider,
  updateProvider,
  deactivateProvider,
  counsellorLogin,
  getMyProviderProfile,
  updateMyProviderProfile,
  updateMyProviderPhoto,
  updateMyProviderPushToken,
  getMySessions,
  changeMyProviderPassword,
  updateMySession,
} = require('../controllers/counsellingController');

const router = express.Router();

// ⚠️ लॉगिन खुद auth के बिना ही होता है — इसलिए requireAuth से पहले register करना ज़रूरी है
router.post('/providers/login', asyncHandler(counsellorLogin));

router.use(requireAuth);

// काउंसलर की अपनी प्रोफ़ाइल/अपॉइंटमेंट्स — /providers/:id से पहले रखें ताकि 'me' को ID न समझा जाए
router.get('/providers/me', asyncHandler(getMyProviderProfile));
router.patch('/providers/me', asyncHandler(updateMyProviderProfile));
router.patch('/providers/me/photo', asyncHandler(updateMyProviderPhoto));
router.patch('/providers/me/push-token', asyncHandler(updateMyProviderPushToken));
// 🆕 काउंसलर अपना पासवर्ड ख़ुद बदल सके — पहले इसका कोई रास्ता नहीं था
router.patch('/providers/me/password', asyncHandler(changeMyProviderPassword));
router.get('/providers/me/sessions', asyncHandler(getMySessions));
router.patch('/providers/me/sessions/:id', asyncHandler(updateMySession));

// ⚠️ /providers रूट्स को /:id से पहले रखें, वरना 'providers' को शिकायत-ID मान लिया जाएगा
router.get('/providers', asyncHandler(listProviders));
router.post('/providers', asyncHandler(createProvider));
router.patch('/providers/:id', asyncHandler(updateProvider));
router.delete('/providers/:id', asyncHandler(deactivateProvider));

router.get('/', asyncHandler(listRequests));
router.get('/stats', asyncHandler(requestStats));
router.get('/:id/history', asyncHandler(requestHistory));
router.post('/', asyncHandler(createRequest));
router.patch('/:id', asyncHandler(updateRequest));

module.exports = router;
