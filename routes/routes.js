const express = require('express');
const router = express.Router();
const razorpayRoute = require('./razorpayRoute');

// Import route modules
const registration = require('./registration');

// Mount registration router at /registration
router.use('/registration', registration);
router.use('/razorpay', razorpayRoute);

module.exports = router;
