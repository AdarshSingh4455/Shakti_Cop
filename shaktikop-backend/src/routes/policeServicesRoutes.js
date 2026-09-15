const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { listActiveServices } = require('../controllers/policeServicesController');

const router = express.Router();

// सार्वजनिक — नागरिक ऐप बिना लॉगिन भी सेवाओं की सूची देख सके
router.get('/', asyncHandler(listActiveServices));

module.exports = router;
