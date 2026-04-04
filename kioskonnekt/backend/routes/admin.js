// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const { dbSelect, dbSelectOne, dbUpdate, dbDelete, dbGetStats } = require('../db/supabase');

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