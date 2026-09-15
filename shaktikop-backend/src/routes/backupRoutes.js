const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { backupStats, createBackup, restoreBackup } = require('../controllers/backupController');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats', asyncHandler(backupStats));
router.post('/create', asyncHandler(createBackup));

// ⚠️ इस route की बड़ी body-सीमा (100MB) app.js में लगाई गई है — वहां सामान्य 5MB
// parser से *पहले*, क्योंकि जो parser पहले चलता है वही तय करता है (देखें app.js की टिप्पणी)।
router.post('/restore', asyncHandler(restoreBackup));

module.exports = router;
