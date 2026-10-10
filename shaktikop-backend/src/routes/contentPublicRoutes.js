const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { listPublicWelfare, listPublicHelplines, getPublicStats } = require('../controllers/contentController');
const { getLocationData } = require('../controllers/locationDataController');
const { getPublicSettings } = require('../controllers/appSettingsController');
const { getPublicCategories } = require('../controllers/categoriesController');
const { getPublicFaq } = require('../controllers/faqController');
const { getPublicLocales, getPublicTranslations } = require('../controllers/localeController');

const router = express.Router();

router.get('/welfare-items', asyncHandler(listPublicWelfare));
router.get('/helpline-items', asyncHandler(listPublicHelplines));
router.get('/public-stats', asyncHandler(getPublicStats));
router.get('/location-data', asyncHandler(getLocationData));
router.get('/content/location-data', asyncHandler(getLocationData));
router.get('/app-settings', asyncHandler(getPublicSettings));
router.get('/categories', asyncHandler(getPublicCategories));
router.get('/faq', asyncHandler(getPublicFaq));
router.get('/locales', asyncHandler(getPublicLocales));
router.get('/translations/:code', asyncHandler(getPublicTranslations));

module.exports = router;
