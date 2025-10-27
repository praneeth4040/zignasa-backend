const express = require('express');
const router = express.Router();
const razorpayInstance = require('../config/razorpay');

// Example route to create a Razorpay order
// POST /razorpay/create-order
// Body: { amount: number, currency?: string, receipt?: string }
// amount is expected in rupees (e.g. 100 for ₹100). We'll convert to paise for Razorpay.
router.post('/create-order', async (req, res) => {
	if (!razorpayInstance) {
		return res.status(500).json({ error: 'Razorpay not initialized. Check server environment variables.' });
	}

	try {
		const { amount, currency = 'INR', receipt } = req.body || {};

		if (amount === undefined || amount === null) {
			return res.status(400).json({ error: 'amount is required in request body (in rupees).' });
		}

		// Accept amounts provided as either integer (rupees) or decimal (rupees). Convert to paise.
		const amountNum = Number(amount);
		if (!isFinite(amountNum) || amountNum <= 0) {
			return res.status(400).json({ error: 'amount must be a positive number.' });
		}

		const amountInPaise = Math.round(amountNum * 100);

		const options = {
			amount: amountInPaise,
			currency,
			receipt: receipt || `rcpt_${Date.now()}`,
			payment_capture: 1, // auto-capture
		};

		const order = await razorpayInstance.orders.create(options);
		return res.status(201).json(order);
	} catch (err) {
		console.error('Error creating Razorpay order:', err);
		return res.status(500).json({ error: 'failed to create order', details: err.message });
	}
});

module.exports = router;

  