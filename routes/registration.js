const express = require('express');
const router = express.Router();
const { supabase } = require('../services/database');

// Registration endpoint (POST /registration)
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

    // Start transaction
    const { data: newTeam, error: insertTeamError } = await supabase
      .from('teams')
      .insert([
        { team_name: teamName, domain: domain }
      ])
      .select()
      .single();

    if (insertTeamError) throw insertTeamError;
    const teamId = newTeam.id;

    // Prepare member data
    const memberData = members.map(member => ({
      team_id: teamId,
      name: member.name,
      email: member.email,
      phone: member.phone,
      college: member.college,
      role: member.role
    }));

    // Insert all members in a single batch
    const { error: membersInsertError } = await supabase
      .from('registrations')
      .insert(memberData);

    if (membersInsertError) throw membersInsertError;

    res.status(201).json({
      success: true,
      message: 'Team registration successful',
      data: {
        teamId,
        teamName,
        domain,
        memberCount: members.length,
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
