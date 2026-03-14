// backend/routes/documents.js
const express = require('express');
const router = express.Router();
const { dbInsert, dbSelect } = require('../db/supabase');

// POST /api/documents — save captured document (base64)
router.post('/', async (req, res) => {
  try {
    const { applicant_id, document_type, document_label, image_data } = req.body;
    if (!applicant_id || !document_type) {
      return res.status(400).json({ success: false, error: 'applicant_id and document_type required' });
    }
    const { data, error } = await dbInsert('documents', {
      applicant_id,
      document_type,
      document_label: document_label || document_type,
      image_data: image_data || null,
      ocr_simulated: true,
      verified: false
    });
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/documents/:applicant_id
router.get('/:applicant_id', async (req, res) => {
  try {
    const { data, error } = await dbSelect('documents', { applicant_id: req.params.applicant_id });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
