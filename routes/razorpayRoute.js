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
		console.log('=== Verify Payment Route Called ===');
		console.log('Request Body:', JSON.stringify(req.body, null, 2));
		console.log('Request Headers:', JSON.stringify(req.headers, null, 2));

		const { teamId, razorpayPaymentId, razorpayOrderId, razorpaySignature, members } = req.body;

		console.log('Extracted Data:', {
			teamId,
			razorpayPaymentId,
			razorpayOrderId,
			razorpaySignature: razorpaySignature ? `${razorpaySignature.substring(0, 10)}...` : 'missing',
			membersCount: members?.length,
		});

		// Validate required fields
		if (!teamId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
			console.error('Validation Error: Missing required fields', {
				hasTeamId: !!teamId,
				hasRazorpayPaymentId: !!razorpayPaymentId,
				hasRazorpayOrderId: !!razorpayOrderId,
				hasRazorpaySignature: !!razorpaySignature,
			});
			return res.status(400).json({
				success: false,
				message: 'Missing required payment verification fields',
			});
		}

		if (!Array.isArray(members) || members.length === 0) {
			console.error('Validation Error: Invalid members array', {
				isArray: Array.isArray(members),
				length: members?.length,
				members: members,
			});
			return res.status(400).json({
				success: false,
				message: 'Members array is required',
			});
		}

		// Validate each member has rollNumber (support snake_case)
		for (let i = 0; i < members.length; i++) {
			const m = members[i];
			if (!m.rollNumber && m.roll_number) m.rollNumber = m.roll_number;
			if (!m.rollNumber) {
				console.error('Validation Error: Missing rollNumber for member', { index: i, member: m });
				return res.status(400).json({
					success: false,
					message: `Member ${i + 1} is missing rollNumber`,
				});
			}
		}

		console.log('All validations passed');

		// Verify signature
		const body = razorpayOrderId + '|' + razorpayPaymentId;
		console.log('Signature Verification:', {
			body,
			receivedSignature: razorpaySignature.substring(0, 20) + '...',
		});

		const expectedSignature = crypto
			.createHmac('sha256', process.env.RAZORPAY_SECRET)
			.update(body)
			.digest('hex');

		console.log('Signature Comparison:', {
			expected: expectedSignature.substring(0, 20) + '...',
			received: razorpaySignature.substring(0, 20) + '...',
			match: expectedSignature === razorpaySignature,
		});

		if (expectedSignature !== razorpaySignature) {
			console.error('Signature Mismatch Error:', {
				expectedSignature: expectedSignature.substring(0, 30) + '...',
				receivedSignature: razorpaySignature.substring(0, 30) + '...',
				fullMatch: expectedSignature === razorpaySignature,
			});
			return res.status(400).json({
				success: false,
				message: 'Invalid payment signature. Possible fraud attempt.',
			});
		}

		console.log('Signature verified successfully');

		// Get team data to verify
		console.log('Fetching team data for teamId:', teamId);
		const { data: team, error: teamError } = await supabase
			.from('teams')
			.select('*')
			.eq('id', teamId)
			.single();

		console.log('Team Fetch Result:', {
			teamFound: !!team,
			teamError: teamError ? JSON.stringify(teamError, null, 2) : null,
			teamData: team ? {
				id: team.id,
				payment_status: team.payment_status,
				razorpay_order_id: team.razorpay_order_id,
			} : null,
		});

		if (teamError || !team) {
			console.error('Team Fetch Error:', {
				error: teamError,
				teamExists: !!team,
			});
			return res.status(404).json({
				success: false,
				message: 'Team not found',
			});
		}

		// Verify payment status is 'Initiated' (log only; enforce atomically below)
		console.log('Checking payment status:', {
			currentStatus: team.payment_status,
			expectedStatus: 'Initiated',
			match: team.payment_status === 'Initiated',
		});

		// Verify order IDs match
		console.log('Verifying order IDs:', {
			teamOrderId: team.razorpay_order_id,
			receivedOrderId: razorpayOrderId,
			match: team.razorpay_order_id === razorpayOrderId,
		});

		if (team.razorpay_order_id !== razorpayOrderId) {
			console.error('Order ID Mismatch Error:', {
				teamOrderId: team.razorpay_order_id,
				receivedOrderId: razorpayOrderId,
			});
			return res.status(400).json({
				success: false,
				message: 'Order ID mismatch',
			});
		}

		console.log('All verifications passed, updating team atomically...');

		// Update team with payment completion details
		const updateData = {
			payment_status: 'Completed',
			razorpay_payment_id: razorpayPaymentId,
			payment_verified_at: new Date().toISOString(),
		};

		console.log('Updating team with data:', updateData);

		const { error: updateTeamError, data: updatedTeam } = await supabase
			.from('teams')
			.update(updateData)
			.eq('id', teamId)
			.eq('payment_status', 'Initiated')
			.select();

		console.log('Team Update Result:', {
			updateError: updateTeamError ? JSON.stringify(updateTeamError, null, 2) : null,
			updatedRows: updatedTeam?.length || 0,
		});

		if (updateTeamError) {
			console.error('Team Update Error:', JSON.stringify(updateTeamError, null, 2));
			throw updateTeamError;
		}

		// If no rows were updated, payment was already processed (handles concurrent requests safely)
		if (!updatedTeam || updatedTeam.length === 0) {
			console.warn('No team rows updated; payment likely already completed. Skipping registrations insert.');
			return res.status(409).json({
				success: false,
				message: 'Payment already verified for this team',
			});
		}

		console.log('Team updated successfully');

		// Prepare and insert member data
		const memberData = members.map(member => ({
			team_id: teamId,
			name: member.name,
			email: member.email,
			phone: member.phone,
			college: member.college,
			role: member.role,
			roll_number: member.rollNumber || member.roll_number
		}));

		console.log('Preparing to insert members:', {
			memberCount: memberData.length,
			memberData: memberData,
		});

		const { error: membersInsertError, data: insertedMembers } = await supabase
			.from('registrations')
			.insert(memberData)
			.select();

		console.log('Members Insert Result:', {
			insertError: membersInsertError ? JSON.stringify(membersInsertError, null, 2) : null,
			insertedCount: insertedMembers?.length,
			insertedMembers: insertedMembers,
		});

		if (membersInsertError) {
			console.error('Members Insert Error:', JSON.stringify(membersInsertError, null, 2));
			// Handle unique violations (e.g., duplicate roll_number)
			const errorMessage = (membersInsertError && membersInsertError.message) || '';
			if (errorMessage.includes('duplicate key value') || errorMessage.includes('unique')) {
				return res.status(409).json({
					success: false,
					message: 'Some registrations already exist (unique constraint)',
					details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
				});
			}
			throw membersInsertError;
		}

		console.log('All operations completed successfully');
		console.log('=== Verify Payment Route Success ===');

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
		console.error('=== Payment Verification Error ===');
		console.error('Error Type:', error.constructor.name);
		console.error('Error Message:', error.message);
		console.error('Error Stack:', error.stack);
		console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
		console.error('Request Body at Error:', JSON.stringify(req.body, null, 2));
		console.error('=== End Error Log ===');

		res.status(500).json({
			success: false,
			message: 'An error occurred during payment verification',
			error: process.env.NODE_ENV === 'development' ? error.message : undefined,
		});
	}
});

module.exports = router;