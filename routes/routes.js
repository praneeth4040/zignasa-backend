const express = require('express');
const router = express.Router();

// Import route modules
const registration = require('./registration');

// Mount registration router at /registration
router.use('/registration', registration);

module.exports = router;
