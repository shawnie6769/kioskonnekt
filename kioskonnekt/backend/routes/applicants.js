// backend/routes/applicants.js
const express = require('express');
const router = express.Router();
const { dbInsert, dbSelect, dbSelectOne, dbUpdate } = require('../db/supabase');

// GET /api/applicants — list all
router.get('/', async (req, res) => {
  try {
    const { data, error } = await dbSelect('applicants');
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/applicants/:id — get one with interview data
router.get('/:id', async (req, res) => {
  try {
    const { data: applicant, error } = await dbSelectOne('applicants', req.params.id);
    if (error || !applicant) return res.status(404).json({ success: false, error: 'Applicant not found' });

    const { data: interviews } = await dbSelect('interviews', { applicant_id: req.params.id });
    const { data: responses } = await dbSelect('responses', { applicant_id: req.params.id });
    const { data: documents } = await dbSelect('documents', { applicant_id: req.params.id });

    res.json({ success: true, data: { ...applicant, interviews: interviews || [], responses: responses || [], documents: documents || [] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/applicants — create new applicant
router.post('/', async (req, res) => {
  try {
    const { full_name, application_number, email, program, senior_high_school, strand, contact_number } = req.body;
    if (!full_name || !application_number || !email || !program || !senior_high_school) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const { data, error } = await dbInsert('applicants', {
      full_name, application_number, email, program, senior_high_school, strand: strand || '', contact_number: contact_number || '', status: 'in_progress'
    });
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/applicants/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { data, error } = await dbUpdate('applicants', req.params.id, { status });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
