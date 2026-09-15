const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { getAtr, listAtrSummary } = require('../controllers/atrController');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(listAtrSummary));
router.get('/:id', asyncHandler(getAtr));

module.exports = router;
