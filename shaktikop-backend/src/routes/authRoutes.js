const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const {
  signupRequestOtp,
  signupVerify,
  citizenLogin,
  forgotPasswordRequestOtp,
  forgotPasswordVerifyOtp,
  forgotPasswordReset,
  officerRequestOtp,
  officerVerifyOtp,
  staffRequestOtp,
  staffVerifyOtp,
  officerLogin,
  adminLogin,
  staffLogin,
  refreshAccessToken,
  logout,
  logoutAll,
  listSessions,
  revokeSession,
} = require('../controllers/authController');

const router = express.Router();

router.post('/citizen/signup/request-otp', asyncHandler(signupRequestOtp));
router.post('/citizen/signup/verify', asyncHandler(signupVerify));
router.post('/citizen/login', asyncHandler(citizenLogin));
router.post('/citizen/forgot-password/request-otp', asyncHandler(forgotPasswordRequestOtp));
router.post('/citizen/forgot-password/verify-otp', asyncHandler(forgotPasswordVerifyOtp));
router.post('/citizen/forgot-password/reset', asyncHandler(forgotPasswordReset));

// 🔒 Unified Password Reset routes (नागरिक, अधिकारी, एडमिन, काउंसलर सभी के लिए)
router.post('/forgot-password/request-otp', asyncHandler(forgotPasswordRequestOtp));
router.post('/forgot-password/verify-otp', asyncHandler(forgotPasswordVerifyOtp));
router.post('/forgot-password/reset', asyncHandler(forgotPasswordReset));

// 🔒 Unified Staff Login & OTP routes (अधिकारी + एडमिन)
router.post('/staff/login', asyncHandler(staffLogin));
router.post('/staff/request-otp', asyncHandler(staffRequestOtp));
router.post('/staff/verify-otp', asyncHandler(staffVerifyOtp));

router.post('/officer/request-otp', asyncHandler(officerRequestOtp));
router.post('/officer/verify-otp', asyncHandler(officerVerifyOtp));
router.post('/officer/login', asyncHandler(officerLogin));
router.post('/admin/login', asyncHandler(adminLogin));
router.post('/refresh', asyncHandler(refreshAccessToken));
router.post('/logout', asyncHandler(logout));
// 🆕 सभी डिवाइस से लॉगआउट — यहां requireAuth ज़रूरी है (सिर्फ़ इसी route पर, बाकी
// यह पूरी router जान-बूझकर public है) ताकि पक्के तौर पर पता चले कि असल में कौन
// कॉल कर रहा है, न कि client जो भी userId भेज दे उस पर भरोसा करना पड़े
router.post('/logout-all', requireAuth, asyncHandler(logoutAll));
router.get('/sessions', requireAuth, asyncHandler(listSessions));
router.delete('/sessions/:id', requireAuth, asyncHandler(revokeSession));

module.exports = router;
