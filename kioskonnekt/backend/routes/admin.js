// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const { dbSelect, dbSelectOne, dbDelete, dbGetStats, getMemStore } = require('../db/supabase');

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'kioskonnekt2025';
  if (username === expectedUser && password === expectedPass) {
    res.json({ success: true, token: 'demo-admin-token', user: { username, role: 'superadmin' } });
  } else {
    // Also check DB
    try {
      const { data } = await dbSelect('admin_users', { username });
      const user = data && data[0];
      if (user && user.password_hash === password) {
        return res.json({ success: true, token: 'demo-admin-token', user: { username, role: user.role } });
      }
    } catch(e) {}
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
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

// GET /api/admin/applicants — full list with counts
router.get('/applicants', async (req, res) => {
  try {
    const { data: applicants, error } = await dbSelect('applicants');
    if (error) throw error;

    // Enrich with counts
    const enriched = await Promise.all((applicants || []).map(async (a) => {
      const { data: docs } = await dbSelect('documents', { applicant_id: a.id });
      const { data: resp } = await dbSelect('responses', { applicant_id: a.id });
      return { ...a, document_count: docs?.length || 0, response_count: resp?.length || 0 };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/applicants/:id — full detail
router.get('/applicants/:id', async (req, res) => {
  try {
    const { data: applicant, error } = await dbSelectOne('applicants', req.params.id);
    if (error || !applicant) return res.status(404).json({ success: false, error: 'Not found' });

    const [{ data: interviews }, { data: responses }, { data: documents }] = await Promise.all([
      dbSelect('interviews', { applicant_id: req.params.id }),
      dbSelect('responses', { applicant_id: req.params.id }),
      dbSelect('documents', { applicant_id: req.params.id })
    ]);

    const sortedResponses = (responses || []).sort((a, b) => a.question_index - b.question_index);

    res.json({
      success: true,
      data: { ...applicant, interviews: interviews || [], responses: sortedResponses, documents: documents || [] }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/applicants/:id/responses — delete all responses for one applicant
router.delete('/applicants/:id/responses', async (req, res) => {
  try {
    const { data: responses, error } = await dbSelect('responses', { applicant_id: req.params.id });
    if (error) throw error;

    const targets = responses || [];
    if (targets.length === 0) {
      return res.json({ success: true, deleted: 0 });
    }

    let deleted = 0;
    for (const row of targets) {
      const { error: delErr } = await dbDelete('responses', row.id);
      if (delErr) throw delErr;
      deleted++;
    }

    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/responses/:id — delete one response
router.delete('/responses/:id', async (req, res) => {
  try {
    const { data, error } = await dbDelete('responses', req.params.id);
    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Response not found' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
