const express = require('express');
const router = express.Router();
const { supabase } = require('../services/database');
const razorpayInstance = require('../config/razorpay');

// Registration endpoint (POST /registration)
/*{
{
  "teamName": "string",
  "domain": "string",
  "members": [
    {
      "name": "string",
      "email": "string",
      "phone": "string",
      "college": "string",
      "role": "Team Lead" | "Member"
    },
    // ... more members (up to team size)
  ]
}
}*/
router.post('/', async (req, res) => {
  const { teamName, domain, members } = req.body;
  
  try {

    // Validate required fields
    if (!teamName || typeof teamName !== 'string' || teamName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid teamName',
      });
    }

    // Validate domain
    const validDomains = ['Web Dev', 'Agentic AI', 'UI/UX'];
    if (!domain || !validDomains.includes(domain)) {
      return res.status(400).json({
        success: false,
        message: `Invalid domain. Must be one of: ${validDomains.join(', ')}`,
      });
    }

    // Validate members array
    if (!Array.isArray(members) || members.length < 1 || members.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Team must have 1 to 5 members',
      });
    }

    // Check for team lead
    const teamLead = members.find(m => m.role === 'Team Lead');
    if (!teamLead) {
      return res.status(400).json({
        success: false,
        message: 'Team must have exactly one Team Lead',
      });
    }

    // Check for multiple team leads
    if (members.filter(m => m.role === 'Team Lead').length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Only one Team Lead is allowed per team',
      });
    }

    // Validate each member
    const emails = new Set();
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      const memberNum = i + 1;

      // Check for duplicate emails in the request
      if (emails.has(member.email)) {
        return res.status(400).json({
          success: false,
          message: `Duplicate email found: ${member.email}`,
        });
      }
      emails.add(member.email);

      // Validate required fields for each member
      const requiredFields = ['name', 'email', 'phone', 'college', 'role'];
      const missingFields = requiredFields.filter(field => !member[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Member ${memberNum} is missing required fields: ${missingFields.join(', ')}`,
        });
      }

      // Validate role
      if (!['Team Lead', 'Member'].includes(member.role)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role for member ${memberNum}. Must be 'Team Lead' or 'Member'`,
        });
      }
    }

    // Check if team name already exists
    const { data: existingTeam, error: teamError } = await supabase
      .from('teams')
      .select('id')
      .eq('team_name', teamName)
      .single();

    if (existingTeam) {
      return res.status(400).json({
        success: false,
        message: 'Team name already exists',
      });
    }

    // Check if any email is already registered
    const { data: existingMembers, error: membersError } = await supabase
      .from('registrations')
      .select('email')
      .in('email', members.map(m => m.email));

    if (existingMembers && existingMembers.length > 0) {
      const existingEmails = existingMembers.map(r => r.email);
      return res.status(400).json({
        success: false,
        message: 'Some emails are already registered',
        existingEmails,
      });
    }

    // Calculate total amount
    const chargePerMember = parseInt(process.env.REGISTRATION_CHARGE_PER_MEMBER || 100);
    const totalAmountInRupees = members.length * chargePerMember;
    const totalAmountInPaise = totalAmountInRupees * 100;

    // Create Razorpay order
    if (!razorpayInstance) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not initialized. Check server configuration.',
      });
    }

    let razorpayOrder;
    try {
      razorpayOrder = await razorpayInstance.orders.create({
        amount: totalAmountInPaise,
        currency: 'INR',
        receipt: `team_${teamName}_${Date.now()}`,
        payment_capture: 1, // auto-capture
      });
    } catch (razorpayError) {
      console.error('Razorpay order creation error:', razorpayError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: process.env.NODE_ENV === 'development' ? razorpayError.message : undefined,
      });
    }

    // Create team with 'Initiated' payment status
    const { data: newTeam, error: insertTeamError } = await supabase
      .from('teams')
      .insert([
        {
          team_name: teamName,
          domain: domain,
          team_size: members.length,
          razorpay_order_id: razorpayOrder.id,
          amount_in_paise: totalAmountInPaise,
          payment_status: 'Initiated',
          payment_initiated_at: new Date().toISOString(),
        }
      ])
      .select()
      .single();

    if (insertTeamError) throw insertTeamError;
    const teamId = newTeam.id;

    // Return payment order details to frontend
    // Frontend will complete payment and then call /razorpay/verify endpoint
    res.status(201).json({
      success: true,
      message: 'Payment order created. Please complete payment to finalize registration.',
      data: {
        teamId,
        teamName,
        domain,
        memberCount: members.length,
        paymentDetails: {
          orderId: razorpayOrder.id,
          amount: totalAmountInRupees,
          amountInPaise: totalAmountInPaise,
          currency: 'INR',
          chargePerMember: chargePerMember,
        },
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
