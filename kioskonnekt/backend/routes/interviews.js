// backend/routes/interviews.js
const express = require('express');
const router = express.Router();
const { dbInsert, dbSelect, dbSelectOne, dbUpdate } = require('../db/supabase');

// POST /api/interviews — start new interview
router.post('/', async (req, res) => {
  try {
    const { applicant_id, total_questions } = req.body;
    if (!applicant_id) return res.status(400).json({ success: false, error: 'applicant_id required' });
    const { data, error } = await dbInsert('interviews', {
      applicant_id, total_questions: total_questions || 5, questions_answered: 0, status: 'in_progress', ai_model: 'rule-based'
    });
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/interviews/:id/complete — mark as complete
router.patch('/:id/complete', async (req, res) => {
  try {
    const { questions_answered, duration_seconds } = req.body;
    const { data, error } = await dbUpdate('interviews', req.params.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      questions_answered: questions_answered || 5,
      duration_seconds: duration_seconds || 0
    });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/interviews/:id/responses — save a response
router.post('/:id/responses', async (req, res) => {
  try {
    const { applicant_id, question_index, question_label, question_text, answer_text, input_method } = req.body;
    if (!applicant_id || answer_text === undefined) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }
    const word_count = answer_text.trim().split(/\s+/).filter(Boolean).length;
    const { data, error } = await dbInsert('responses', {
      interview_id: req.params.id,
      applicant_id,
      question_index: question_index || 0,
      question_label: question_label || '',
      question_text: question_text || '',
      answer_text,
      input_method: input_method || 'typed',
      word_count
    });
    if (error) throw error;

    // Update interview progress
    await dbUpdate('interviews', req.params.id, { questions_answered: (question_index || 0) + 1 });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/interviews/:id/responses
router.get('/:id/responses', async (req, res) => {
  try {
    const { data, error } = await dbSelect('responses', { interview_id: req.params.id });
    if (error) throw error;
    res.json({ success: true, data: (data || []).sort((a, b) => a.question_index - b.question_index) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
