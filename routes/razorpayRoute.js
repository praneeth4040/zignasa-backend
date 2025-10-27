const express = require('express');
const router = express.Router();
const razorpayInstance = require('../config/razorpay');
const { supabase } = require('../services/database');
const crypto = require('crypto');

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

// Verify payment and finalize registration
// POST /razorpay/verify-payment
// Body: { teamId: number, razorpayPaymentId: string, razorpayOrderId: string, razorpaySignature: string, members: [...] }
router.post('/verify-payment', async (req, res) => {
	try {
		const { teamId, razorpayPaymentId, razorpayOrderId, razorpaySignature, members } = req.body;

		// Validate required fields
		if (!teamId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
			return res.status(400).json({
				success: false,
				message: 'Missing required payment verification fields',
			});
		}

		if (!Array.isArray(members) || members.length === 0) {
			return res.status(400).json({
				success: false,
				message: 'Members array is required',
			});
		}

		// Verify signature
		const body = razorpayOrderId + '|' + razorpayPaymentId;
		const expectedSignature = crypto
			.createHmac('sha256', process.env.RAZORPAY_SECRET)
			.update(body)
			.digest('hex');

		if (expectedSignature !== razorpaySignature) {
			return res.status(400).json({
				success: false,
				message: 'Invalid payment signature. Possible fraud attempt.',
			});
		}

		// Get team data to verify
		const { data: team, error: teamError } = await supabase
			.from('teams')
			.select('*')
			.eq('id', teamId)
			.single();

		if (teamError || !team) {
			return res.status(404).json({
				success: false,
				message: 'Team not found',
			});
		}

		// Verify payment status is 'Initiated'
		if (team.payment_status !== 'Initiated') {
			return res.status(400).json({
				success: false,
				message: 'Team payment is not in Initiated state',
			});
		}

		// Verify order IDs match
		if (team.razorpay_order_id !== razorpayOrderId) {
			return res.status(400).json({
				success: false,
				message: 'Order ID mismatch',
			});
		}

		// Update team with payment completion details
		const { error: updateTeamError } = await supabase
			.from('teams')
			.update({
				payment_status: 'Completed',
				razorpay_payment_id: razorpayPaymentId,
				payment_verified_at: new Date().toISOString(),
			})
			.eq('id', teamId);

		if (updateTeamError) throw updateTeamError;

		// Prepare and insert member data
		const memberData = members.map(member => ({
			team_id: teamId,
			name: member.name,
			email: member.email,
			phone: member.phone,
			college: member.college,
			role: member.role,
		}));

		const { error: membersInsertError } = await supabase
			.from('registrations')
			.insert(memberData);

		if (membersInsertError) throw membersInsertError;

		res.status(200).json({
			success: true,
			message: 'Payment verified and team registration completed',
			data: {
				teamId,
				paymentStatus: 'Completed',
				paymentId: razorpayPaymentId,
				orderId: razorpayOrderId,
				memberCount: members.length,
			},
		});
	} catch (error) {
		console.error('Payment verification error:', error);
		res.status(500).json({
			success: false,
			message: 'An error occurred during payment verification',
			error: process.env.NODE_ENV === 'development' ? error.message : undefined,
		});
	}
});

module.exports = router;