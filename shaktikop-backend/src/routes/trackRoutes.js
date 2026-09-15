const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { trackComplaint } = require('../controllers/complaintController');

const router = express.Router();

router.get('/:id', asyncHandler(trackComplaint));

module.exports = router;
