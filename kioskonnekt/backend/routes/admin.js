// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const { dbInsert, dbSelect, dbSelectOne, dbUpdate, dbDelete, dbGetStats } = require('../db/supabase');
const {
  getStatusSnapshot,
  getRecentFailures,
  resolveFailure,
  reportKioskHeartbeat,
  recordSystemFailure,
  events
} = require('../services/monitor');

function sortFallbackQuestions(items = []) {
  return [...items].sort((a, b) => Number(a.question_index || 0) - Number(b.question_index || 0));
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeHelpRecordInput(payload = {}) {
  const out = {};
  if (typeof payload.screen_key === 'string') out.screen_key = payload.screen_key.trim().toLowerCase();
  if (typeof payload.title === 'string') out.title = payload.title.trim();
  if (typeof payload.short_intro === 'string') out.short_intro = payload.short_intro.trim();
  if (payload.steps !== undefined) out.steps = parseList(payload.steps);
  if (typeof payload.visual_guide === 'string') out.visual_guide = payload.visual_guide.trim();
  if (payload.tips !== undefined) out.tips = parseList(payload.tips);
  if (Number.isInteger(payload.display_order)) out.display_order = payload.display_order;
  if (typeof payload.is_active === 'boolean') out.is_active = payload.is_active;
  return out;
}

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'kioskonnekt2025';
  if (username === expectedUser && password === expectedPass) {
    return res.json({ success: true, token: 'demo-admin-token', user: { username, role: 'superadmin' } });
  }
  try {
    const { data } = await dbSelect('admin_users', { username });
    const user = data && data[0];
    if (user && user.password_hash === password) {
      return res.json({ success: true, token: 'demo-admin-token', user: { username, role: user.role } });
    }
  } catch(e) {}
  res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await dbGetStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/fallback-questions
router.get('/fallback-questions', async (req, res) => {
  try {
    const { data, error } = await dbSelect('fallback_questions');
    if (error) throw error;
    res.json({ success: true, data: sortFallbackQuestions(data || []) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/fallback-questions
router.post('/fallback-questions', async (req, res) => {
  try {
    const { label, text, question_index } = req.body || {};
    if (!label || !text) {
      return res.status(400).json({ success: false, error: 'label and text are required.' });
    }

    const { data: existing } = await dbSelect('fallback_questions');
    const sorted = sortFallbackQuestions(existing || []);
    let index = Number.isInteger(question_index) ? question_index : sorted.length;
    if (index < 0) index = 0;

    const used = new Set(sorted.map((q) => Number(q.question_index)));
    while (used.has(index)) index += 1;

    const now = new Date().toISOString();
    const { data, error } = await dbInsert('fallback_questions', {
      question_index: index,
      label: String(label).trim(),
      text: String(text).trim(),
      is_active: true,
      created_at: now,
      updated_at: now
    });
    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/fallback-questions/:id
router.patch('/fallback-questions/:id', async (req, res) => {
  try {
    const updates = {};
    if (typeof req.body?.label === 'string') updates.label = req.body.label.trim();
    if (typeof req.body?.text === 'string') updates.text = req.body.text.trim();
    if (typeof req.body?.is_active === 'boolean') updates.is_active = req.body.is_active;

    if (Number.isInteger(req.body?.question_index)) {
      const index = req.body.question_index;
      const { data: all } = await dbSelect('fallback_questions');
      const collision = (all || []).find((q) => q.id !== req.params.id && Number(q.question_index) === Number(index));
      if (collision) {
        return res.status(409).json({ success: false, error: `question_index ${index} is already used.` });
      }
      updates.question_index = index;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update.' });
    }

    updates.updated_at = new Date().toISOString();
    const { data, error } = await dbUpdate('fallback_questions', req.params.id, updates);
    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/fallback-questions/:id
router.delete('/fallback-questions/:id', async (req, res) => {
  try {
    const { data, error } = await dbDelete('fallback_questions', req.params.id);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/help-content
router.get('/help-content', async (req, res) => {
  try {
    const { screen_key, active } = req.query || {};
    const filters = {};
    if (screen_key) filters.screen_key = String(screen_key).trim().toLowerCase();
    if (active === '1' || active === 'true') filters.is_active = true;

    const { data, error } = await dbSelect('applicant_help_content', filters);
    if (error) throw error;

    const rows = [...(data || [])].sort((a, b) => {
      const left = Number(a.display_order || 0);
      const right = Number(b.display_order || 0);
      if (left !== right) return left - right;
      return String(a.screen_key || '').localeCompare(String(b.screen_key || ''));
    });

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/help-content
router.post('/help-content', async (req, res) => {
  try {
    const payload = normalizeHelpRecordInput(req.body || {});
    if (!payload.screen_key || !payload.title) {
      return res.status(400).json({ success: false, error: 'screen_key and title are required.' });
    }

    const now = new Date().toISOString();
    const { data, error } = await dbInsert('applicant_help_content', {
      screen_key: payload.screen_key,
      title: payload.title,
      short_intro: payload.short_intro || '',
      steps: payload.steps || [],
      visual_guide: payload.visual_guide || '',
      tips: payload.tips || [],
      display_order: Number(payload.display_order || 0),
      is_active: payload.is_active !== false,
      created_at: now,
      updated_at: now
    });
    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/help-content/:id
router.patch('/help-content/:id', async (req, res) => {
  try {
    const updates = normalizeHelpRecordInput(req.body || {});
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update.' });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await dbUpdate('applicant_help_content', req.params.id, updates);
    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/help-content/:id
router.delete('/help-content/:id', async (req, res) => {
  try {
    const { data, error } = await dbDelete('applicant_help_content', req.params.id);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/monitor/status
router.get('/monitor/status', async (req, res) => {
  try {
    res.json({ success: true, data: getStatusSnapshot() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/monitor/heartbeat
router.post('/monitor/heartbeat', async (req, res) => {
  try {
    const value = reportKioskHeartbeat(req.body || {});
    res.json({ success: true, data: value });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/monitor/client-error
router.post('/monitor/client-error', async (req, res) => {
  try {
    const {
      kiosk_id,
      page,
      category = 'frontend_error',
      severity = 'error',
      message,
      metadata = {}
    } = req.body || {};

    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required.' });
    }

    await recordSystemFailure({
      component: 'kiosk:frontend',
      category,
      severity,
      message,
      metadata: {
        kiosk_id,
        page,
        ...metadata
      }
    });

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/monitor/failures
router.get('/monitor/failures', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const rows = await getRecentFailures(limit);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/monitor/failures/:id/resolve
router.patch('/monitor/failures/:id/resolve', async (req, res) => {
  try {
    const { data, error } = await resolveFailure(req.params.id);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/monitor/failures
router.delete('/monitor/failures', async (req, res) => {
  try {
    const scope = String(req.query.scope || 'all').toLowerCase();
    const { data, error } = await dbSelect('system_failures');
    if (error) throw error;

    const rows = (data || []).filter((row) => {
      if (scope === 'resolved') return Boolean(row.resolved);
      return true;
    });

    let deleted = 0;
    for (const row of rows) {
      const result = await dbDelete('system_failures', row.id);
      if (!result.error) deleted += 1;
    }

    res.json({ success: true, deleted, scope });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/monitor/stream
router.get('/monitor/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (entry) => {
    const payload = JSON.stringify(entry);
    res.write(`event: ${entry.event}\n`);
    res.write(`data: ${payload}\n\n`);
  };

  send({ event: 'connected', timestamp: new Date().toISOString(), payload: { ok: true } });

  const onStatus = (entry) => send(entry);
  const onFailure = (entry) => send(entry);
  events.on('status-update', onStatus);
  events.on('failure', onFailure);

  const keepAlive = setInterval(() => {
    res.write('event: ping\n');
    res.write(`data: ${JSON.stringify({ t: Date.now() })}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    events.off('status-update', onStatus);
    events.off('failure', onFailure);
  });
});

// GET /api/admin/applicants — list with response + document counts
router.get('/applicants', async (req, res) => {
  try {
    const { data: applicants, error } = await dbSelect('applicants');
    if (error) throw error;

    const enriched = await Promise.all((applicants || []).map(async (a) => {
      const { data: docs }  = await dbSelect('documents', { applicant_id: a.id });
      const { data: resps } = await dbSelect('responses', { applicant_id: a.id });
      return {
        ...a,
        document_count: docs?.length  || 0,
        response_count: resps?.length || 0
      };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('GET /admin/applicants error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/applicants/:id — full detail with responses + documents
router.get('/applicants/:id', async (req, res) => {
  try {
    const { data: applicant, error } = await dbSelectOne('applicants', req.params.id);
    if (error || !applicant) return res.status(404).json({ success: false, error: 'Applicant not found' });

    const [
      { data: interviews },
      { data: responses },
      { data: documents }
    ] = await Promise.all([
      dbSelect('interviews', { applicant_id: req.params.id }),
      dbSelect('responses',  { applicant_id: req.params.id }),
      dbSelect('documents',  { applicant_id: req.params.id })
    ]);

    // Sort responses by question order
    const sortedResponses = (responses || []).sort((a, b) => a.question_index - b.question_index);

    res.json({
      success: true,
      data: {
        ...applicant,
        interviews: interviews || [],
        responses:  sortedResponses,
        documents:  documents  || []
      }
    });
  } catch (err) {
    console.error('GET /admin/applicants/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/applicants/:id — delete applicant + all related data
router.delete('/applicants/:id', async (req, res) => {
  try {
    const applicantId = req.params.id;

    // Delete related records first
    for (const table of ['responses', 'documents', 'interviews']) {
      const { data: rows } = await dbSelect(table, { applicant_id: applicantId });
      for (const row of (rows || [])) {
        await dbDelete(table, row.id);
      }
    }

    // Delete applicant
    const { error } = await dbDelete('applicants', applicantId);
    if (error) throw error;

    res.json({ success: true, message: 'Applicant and all related data deleted.' });
  } catch (err) {
    console.error('DELETE /admin/applicants/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/responses/:id — delete one response
router.delete('/responses/:id', async (req, res) => {
  try {
    const { data, error } = await dbDelete('responses', req.params.id);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/responses/:id — edit a response answer
router.patch('/responses/:id', async (req, res) => {
  try {
    const { answer_text } = req.body;
    if (!answer_text || !answer_text.trim()) {
      return res.status(400).json({ success: false, error: 'answer_text is required.' });
    }
    const { data, error } = await dbUpdate('responses', req.params.id, {
      answer_text: answer_text.trim(),
      word_count: answer_text.trim().split(/\s+/).length
    });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/documents/:id — delete one document
router.delete('/documents/:id', async (req, res) => {
  try {
    const { data, error } = await dbDelete('documents', req.params.id);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/documents/:id — edit document label/type
router.patch('/documents/:id', async (req, res) => {
  try {
    const { document_label, document_type } = req.body;
    if (!document_label && !document_type) {
      return res.status(400).json({ success: false, error: 'Nothing to update.' });
    }
    const updates = {};
    if (document_label) updates.document_label = document_label.trim();
    if (document_type)  updates.document_type  = document_type.trim();
    const { data, error } = await dbUpdate('documents', req.params.id, updates);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;