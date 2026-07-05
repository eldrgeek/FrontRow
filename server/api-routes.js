/**
 * FrontRow REST API Routes (SOMA Upgrade)
 *
 * All endpoints support delegation:
 * - User makes request with Authorization header (JWT from Supabase auth)
 * - Optional query param: ?on_behalf_of=<user_id> for agent delegation
 * - Server checks: is requester the user OR is requester delegated by user?
 * - If yes, execute. If no, 403 Forbidden.
 * - All actions logged with actor ID for audit trail.
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Supabase client (service role — used server-side)
const supabaseUrl = 'https://omfwcodoimjmbrhssvfl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// AUTH MIDDLEWARE — Extract user + check delegation
// ============================================================================

async function extractUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.currentUser = data.user;
  next();
}

async function checkDelegation(req, res, next) {
  // If ?on_behalf_of is provided, verify delegation
  const onBehalfOf = req.query.on_behalf_of;

  if (onBehalfOf) {
    // Verify requester is delegated by the target user
    const { data: delegation, error } = await supabase
      .from('delegations')
      .select('id')
      .eq('user_id', onBehalfOf)
      .eq('agent_id', req.currentUser.id)
      .is('revoked_at', null)
      .single();

    if (error || !delegation) {
      return res.status(403).json({ error: 'Not authorized to act on behalf of this user' });
    }

    req.actingUserId = onBehalfOf;
    req.isDelegate = true;
  } else {
    req.actingUserId = req.currentUser.id;
    req.isDelegate = false;
  }

  next();
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

async function logAction(action, userId, details = {}) {
  try {
    console.log(`[AUDIT] ${action} by user ${userId}:`, JSON.stringify(details));
    // TODO: store in audit_log table
  } catch (err) {
    console.error('Audit logging error:', err);
  }
}

// ============================================================================
// VENUES
// ============================================================================

router.get('/venues', extractUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/venues', extractUser, checkDelegation, async (req, res) => {
  try {
    // Only super admins can create venues
    const { data: adminCheck } = await supabase
      .from('frontrow_admins')
      .select('id')
      .eq('user_id', req.currentUser.id)
      .single();

    if (!adminCheck) {
      return res.status(403).json({ error: 'Only super admins can create venues' });
    }

    const { name, room_template_id, theater_manager_id } = req.body;

    const { data, error } = await supabase
      .from('venues')
      .insert({
        name,
        room_template_id,
        theater_manager_id,
        created_by: req.currentUser.id,
      })
      .select();

    if (error) throw error;

    await logAction('CREATE_VENUE', req.currentUser.id, {
      venue_id: data[0]?.id,
      name,
      acting_for: req.actingUserId,
      is_delegate: req.isDelegate,
    });

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SESSIONS
// ============================================================================

router.get('/sessions', extractUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, venue:venues(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sessions', extractUser, checkDelegation, async (req, res) => {
  try {
    const { venue_id, title } = req.body;

    // Verify user can create sessions in this venue
    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('theater_manager_id')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    // Check permission: is requester the theater manager or super admin?
    const { data: adminCheck } = await supabase
      .from('frontrow_admins')
      .select('id')
      .eq('user_id', req.currentUser.id)
      .single();

    const isAdmin = !!adminCheck;
    const isTheaterManager = venue.theater_manager_id === req.currentUser.id;

    if (!isAdmin && !isTheaterManager) {
      return res.status(403).json({ error: 'Not authorized to create sessions in this venue' });
    }

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        venue_id,
        title,
        started_by: req.actingUserId,
      })
      .select();

    if (error) throw error;

    await logAction('CREATE_SESSION', req.currentUser.id, {
      session_id: data[0]?.id,
      venue_id,
      title,
      acting_for: req.actingUserId,
      is_delegate: req.isDelegate,
    });

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PERFORMERS
// ============================================================================

router.post('/sessions/:session_id/invite-performer', extractUser, checkDelegation, async (req, res) => {
  try {
    const { session_id } = req.params;
    const { performer_id } = req.body;

    // Get session + venue to verify permissions
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, venue:venues(theater_manager_id)')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check permission: theater manager or performance manager of this session
    const { data: adminCheck } = await supabase
      .from('frontrow_admins')
      .select('id')
      .eq('user_id', req.currentUser.id)
      .single();

    const isAdmin = !!adminCheck;
    const isTheaterManager = session.venue.theater_manager_id === req.currentUser.id;

    if (!isAdmin && !isTheaterManager) {
      return res.status(403).json({ error: 'Not authorized to invite performers to this session' });
    }

    // Add performer to session
    const updatedPerformerIds = [...(session.performer_ids || []), performer_id];
    const { data, error } = await supabase
      .from('sessions')
      .update({ performer_ids: updatedPerformerIds })
      .eq('id', session_id)
      .select();

    if (error) throw error;

    await logAction('INVITE_PERFORMER', req.currentUser.id, {
      session_id,
      performer_id,
      acting_for: req.actingUserId,
      is_delegate: req.isDelegate,
    });

    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// FEEDBACK
// ============================================================================

router.post('/feedback/show', extractUser, checkDelegation, async (req, res) => {
  try {
    const { session_id, rating, text, author_name } = req.body;

    const { data, error } = await supabase
      .from('show_feedback')
      .insert({
        session_id,
        user_id: req.actingUserId,
        rating,
        text,
        author_name,
        viewed_how: 'attended', // TODO: determine from session attendance
      })
      .select();

    if (error) throw error;

    await logAction('SUBMIT_FEEDBACK', req.currentUser.id, {
      feedback_id: data[0]?.id,
      session_id,
      acting_for: req.actingUserId,
      is_delegate: req.isDelegate,
    });

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/feedback/design', extractUser, checkDelegation, async (req, res) => {
  try {
    const { type, description } = req.body;

    if (!['bug', 'feature'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "bug" or "feature"' });
    }

    const { data, error } = await supabase
      .from('frontrow_feedback')
      .insert({
        type,
        description,
        submitter_id: req.actingUserId,
      })
      .select();

    if (error) throw error;

    await logAction('SUBMIT_DESIGN_FEEDBACK', req.currentUser.id, {
      feedback_id: data[0]?.id,
      type,
      acting_for: req.actingUserId,
      is_delegate: req.isDelegate,
    });

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// DELEGATION MANAGEMENT
// ============================================================================

router.get('/delegations/agents', extractUser, async (req, res) => {
  try {
    // Get my agents (who I've delegated to)
    const { data, error } = await supabase
      .from('delegations')
      .select('agent:agent_id(id, email, is_ai)')
      .eq('user_id', req.currentUser.id)
      .is('revoked_at', null);

    if (error) throw error;
    res.json(data.map(d => d.agent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/delegations/agent-for', extractUser, async (req, res) => {
  try {
    // Get who I'm agent for
    const { data, error } = await supabase
      .from('delegations')
      .select('user:user_id(id, email, is_ai)')
      .eq('agent_id', req.currentUser.id)
      .is('revoked_at', null);

    if (error) throw error;
    res.json(data.map(d => d.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/delegations', extractUser, async (req, res) => {
  try {
    const { agent_id } = req.body;

    const { data, error } = await supabase
      .from('delegations')
      .insert({ user_id: req.currentUser.id, agent_id })
      .select();

    if (error) throw error;

    await logAction('CREATE_DELEGATION', req.currentUser.id, {
      agent_id,
    });

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/delegations/:agent_id', extractUser, async (req, res) => {
  try {
    const { agent_id } = req.params;

    const { data, error } = await supabase
      .from('delegations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', req.currentUser.id)
      .eq('agent_id', agent_id)
      .select();

    if (error) throw error;

    await logAction('REVOKE_DELEGATION', req.currentUser.id, {
      agent_id,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

module.exports = { router, extractUser, checkDelegation };
