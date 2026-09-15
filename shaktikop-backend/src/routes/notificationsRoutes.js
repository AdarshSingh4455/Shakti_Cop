const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { listMyNotifications, unreadCount, markRead, markAllRead } = require('../controllers/notificationsController');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(listMyNotifications));
router.get('/unread-count', asyncHandler(unreadCount));
router.patch('/read-all', asyncHandler(markAllRead));
router.patch('/:id/read', asyncHandler(markRead));

module.exports = router;
