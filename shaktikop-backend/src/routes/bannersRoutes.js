const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { listActiveBanners } = require('../controllers/bannersController');

const router = express.Router();

router.get('/', asyncHandler(listActiveBanners));

module.exports = router;
