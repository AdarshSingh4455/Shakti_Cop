const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { listRecipients, sendMessage, getConversation, listInbox, listSentReceived } = require('../controllers/messagesController');

const router = express.Router();
router.use(requireAuth, requireRole('officer', 'admin'));

router.get('/recipients', asyncHandler(listRecipients));
router.get('/inbox', asyncHandler(listInbox));
router.get('/sent-received', asyncHandler(listSentReceived));
router.get('/conversation', asyncHandler(getConversation));
router.post('/', asyncHandler(sendMessage));

module.exports = router;
