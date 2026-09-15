const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getMyProfile, updateMyProfile, updateMyPhoto, updateEmergencyContacts, updatePushToken, exportMyData, requestAccountDeletion, getMyDeletionRequest } = require('../controllers/citizenController');
const { getDraft, saveDraft, deleteDraft } = require('../controllers/draftsController');

const router = express.Router();

router.get('/me', requireAuth, requireRole('citizen'), asyncHandler(getMyProfile));
router.patch('/me', requireAuth, requireRole('citizen'), asyncHandler(updateMyProfile));
router.patch('/me/photo', requireAuth, requireRole('citizen'), asyncHandler(updateMyPhoto));
router.patch('/me/emergency-contacts', requireAuth, requireRole('citizen'), asyncHandler(updateEmergencyContacts));
router.patch('/me/push-token', requireAuth, requireRole('citizen'), asyncHandler(updatePushToken));

// 🆕 DPDP Act — डेटा तक पहुंच व मिटाने का अधिकार
router.get('/me/export', requireAuth, requireRole('citizen'), asyncHandler(exportMyData));
router.post('/me/deletion-request', requireAuth, requireRole('citizen'), asyncHandler(requestAccountDeletion));
router.get('/me/deletion-request', requireAuth, requireRole('citizen'), asyncHandler(getMyDeletionRequest));

router.get('/me/drafts/:category', requireAuth, requireRole('citizen'), asyncHandler(getDraft));
router.put('/me/drafts/:category', requireAuth, requireRole('citizen'), asyncHandler(saveDraft));
router.delete('/me/drafts/:category', requireAuth, requireRole('citizen'), asyncHandler(deleteDraft));

module.exports = router;
