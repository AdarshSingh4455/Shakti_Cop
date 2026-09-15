const express = require('express');
const rateLimit = require('express-rate-limit');
const { normalizeIpForRateLimit } = require('../utils/ipKey');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole, blockMonitor, requireSuperAdmin } = require('../middleware/auth');
const {
  createComplaint,
  listComplaints,
  getComplaint,
  getAccusedHistory,
  assignOfficer,
  updateStatus,
  alertOfficer,
  transferComplaint,
  triggerSos,
  confirmSafeArrival,
  checkinResponse,
  submitFeedback,
  markViewed,
  updatePriority,
  toggleChecklistItem,
  verifyResolution,
  updateLiveLocation,
  getLocationTrail,
  verifyByQr,
  deleteComplaint,
  listDeletedComplaints,
  restoreComplaint,
  listComplaintMessages,
  sendComplaintMessage,
} = require('../controllers/complaintController');
const { listPrivateNotes, addPrivateNote, listFieldVisits, addFieldVisit } = require('../controllers/officerSelfController');
const { markDuplicate, unmarkDuplicate } = require('../controllers/duplicateController');

const router = express.Router();

router.use(requireAuth); // इस राउटर की हर API के लिए लॉगिन आवश्यक है

// 🔒 सुरक्षा सुधार: शिकायत दर्ज करना पहले सिर्फ़ ढीली globalLimiter (300/15मिनट,
// IP-आधारित) के अंदर आता था। हर नई शिकायत असल में एक पूरा सूचना-कैस्केड चलाती
// है — नियुक्त अधिकारी, थाने के सभी SHO, आस-पास के अधिकारी, संबंधित admins — सबको
// push notification। कोई एक (compromised/दुर्भावनापूर्ण) नागरिक-खाता झूठी
// शिकायतें बनाकर दर्जनों अधिकारियों को सूचना-बाढ़ में डाल सकता था।
// जान-बूझकर IP+नागरिक-ID दोनों मिलाकर सीमा लगाई है (सिर्फ़ IP नहीं) — वरना थाने
// की साझा WiFi पर मौजूद बाक़ी नागरिक भी एक ग़लत/दुर्भावनापूर्ण खाते की वजह से
// रुक जाते (ठीक वही समस्या जो login-सीमा में पहले मिली और ठीक की गई थी)।
const complaintCreateLimiter = rateLimit({
  store: require('../utils/rateLimitStore').getRateLimitStore(),
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // 🐛 बग फ़िक्स (सुरक्षा): req.ip सीधे इस्तेमाल करने पर IPv6 उपयोगकर्ता अपने /64
  // ब्लॉक में पता बदल-बदलकर यह सीमा पूरी तरह बायपास कर सकता था। ipKeyGenerator पूरे
  // /64 को एक ही key मानता है। (यह असल में सर्वर चलाने पर ही पकड़ में आई थी।)
  keyGenerator: (req) => `${normalizeIpForRateLimit(req.ip)}:${req.user?.id || ''}`,
  message: { error: 'बहुत ज़्यादा शिकायतें दर्ज की गई हैं — कृपया कुछ देर बाद कोशिश करें।' },
});

// नियुक्ति — Super Admin/District Admin, या SHO रैंक का अधिकारी कर सकता है (monitor और SI नहीं)
function canAssign(req, res, next) {
  if (req.user.role === 'admin') return blockMonitor(req, res, next);
  if (req.user.role === 'officer' && req.user.rank === 'SHO') return next();
  return res.status(403).json({ error: 'सिर्फ़ Admin या थाना प्रभारी (SHO) मामले नियुक्त कर सकते हैं' });
}

router.get('/', asyncHandler(listComplaints));
// ⚠️ '/deleted' को '/:id' से पहले register करना ज़रूरी है — वरना Express इसे
// एक शिकायत ID ("deleted") मानकर getComplaint को भेज देगा
router.get('/deleted', requireRole('admin'), requireSuperAdmin, asyncHandler(listDeletedComplaints));
router.get('/:id/verify', requireRole('officer', 'admin'), asyncHandler(verifyByQr));
router.get('/:id', asyncHandler(getComplaint));
router.get('/:id/accused-history', requireRole('officer', 'admin'), asyncHandler(getAccusedHistory));
router.post('/', requireRole('citizen'), complaintCreateLimiter, asyncHandler(createComplaint));
router.patch('/:id/assign', requireRole('admin', 'officer'), canAssign, asyncHandler(assignOfficer));
router.patch('/:id/status', requireRole('officer', 'admin'), blockMonitor, asyncHandler(updateStatus));
router.patch('/:id/transfer', requireRole('officer'), asyncHandler(transferComplaint));
router.post('/:id/alert', requireRole('admin'), blockMonitor, asyncHandler(alertOfficer));
router.post('/:id/mark-viewed', requireRole('officer'), asyncHandler(markViewed));

router.post('/:id/sos', requireRole('citizen'), asyncHandler(triggerSos));
router.post('/:id/safe-arrival', requireRole('citizen'), asyncHandler(confirmSafeArrival));
router.post('/:id/checkin-response', requireRole('citizen'), asyncHandler(checkinResponse));
router.patch('/:id/feedback', requireRole('citizen'), asyncHandler(submitFeedback));

// 🆕 Complaint Chat — नागरिक और नियुक्त अधिकारी के बीच केस-दायरे में बातचीत
router.get('/:id/messages', requireRole('citizen', 'officer'), asyncHandler(listComplaintMessages));
router.post('/:id/messages', requireRole('citizen', 'officer'), asyncHandler(sendComplaintMessage));

router.get('/:complaintId/private-notes', requireRole('officer', 'admin'), asyncHandler(listPrivateNotes));
router.post('/:complaintId/private-notes', requireRole('officer'), asyncHandler(addPrivateNote));
router.get('/:complaintId/field-visits', requireRole('officer', 'admin'), asyncHandler(listFieldVisits));
router.post('/:complaintId/field-visits', requireRole('officer'), asyncHandler(addFieldVisit));

router.patch('/:id/mark-duplicate', requireRole('admin'), blockMonitor, asyncHandler(markDuplicate));
router.patch('/:id/unmark-duplicate', requireRole('admin'), blockMonitor, asyncHandler(unmarkDuplicate));

router.patch('/:id/priority', requireRole('admin'), blockMonitor, asyncHandler(updatePriority));
router.patch('/:id/checklist', requireRole('officer', 'admin'), blockMonitor, asyncHandler(toggleChecklistItem));
router.post('/:id/verify', requireRole('admin'), blockMonitor, asyncHandler(verifyResolution));
router.patch('/:id/live-location', requireRole('citizen'), asyncHandler(updateLiveLocation));
router.get('/:id/location-trail', asyncHandler(getLocationTrail));

// सिर्फ़ Super Admin — शिकायत को डेटाबेस से स्थायी रूप से हटाना (soft-delete नहीं, असली DELETE)
router.delete('/:id', requireRole('admin'), requireSuperAdmin, asyncHandler(deleteComplaint));
router.post('/:id/restore', requireRole('admin'), requireSuperAdmin, asyncHandler(restoreComplaint));

module.exports = router;
