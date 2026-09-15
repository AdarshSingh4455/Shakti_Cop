const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { getNearby } = require('../controllers/nearbyController');

const router = express.Router();

router.get('/', asyncHandler(getNearby));

module.exports = router;
