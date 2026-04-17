// backend/routes/applicants.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { dbInsert, dbSelect, dbSelectOne, dbUpdate } = require('../db/supabase');

const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN || '';
const DROPBOX_UPLOAD_PATH = process.env.DROPBOX_UPLOAD_PATH || '/KiosKonnekt';

function sanitizeDropboxName(text) {
  return String(text || '').trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function uploadDocumentToDropbox(uploadPath, imageData) {
  const base64 = String(imageData || '').replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  const headers = {
    Authorization: `Bearer ${DROPBOX_TOKEN}`,
    'Content-Type': 'application/octet-stream',
    'Dropbox-API-Arg': JSON.stringify({
      path: uploadPath,
      mode: 'add',
      autorename: true,
      mute: true,
      strict_conflict: false
    })
  };

  const response = await axios.post('https://content.dropboxapi.com/2/files/upload', buffer, { headers, maxBodyLength: Infinity });
  return response.data;
}

async function uploadApplicantDocsToDropbox(applicant, documents) {
  if (!DROPBOX_TOKEN) {
    return { uploaded: 0, skipped: true, warning: 'Dropbox access token is not configured.' };
  }

  const sanitizedApplicant = sanitizeDropboxName(`${applicant.full_name}-${applicant.id}`) || `applicant-${applicant.id}`;
  const uploads = [];

  for (const document of (documents || [])) {
    if (!document.image_data) continue;

    const label = sanitizeDropboxName(document.document_label || document.document_type || 'document');
    const filename = `${label || 'document'}.png`;
    const uploadPath = `${DROPBOX_UPLOAD_PATH}/${sanitizedApplicant}/${filename}`;

    try {
      await uploadDocumentToDropbox(uploadPath, document.image_data);
      uploads.push({ path: uploadPath, document_id: document.id });
    } catch (uploadError) {
      throw new Error(`Dropbox upload failed for ${filename}: ${uploadError.message}`);
    }
  }

  return { uploaded: uploads.length, uploadedFiles: uploads };
}

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
    const { full_name, email, program, senior_high_school, strand, contact_number } = req.body;
    if (!full_name || !email || !program || !senior_high_school || !contact_number) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Basic email format validation to guard invalid input
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(String(email).trim())) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    const normalizedContactNumber = String(contact_number).replace(/\D/g, '');
    if (!/^\d{11}$/.test(normalizedContactNumber)) {
      return res.status(400).json({ success: false, error: 'Contact number must be exactly 11 digits' });
    }

    const { data, error } = await dbInsert('applicants', {
      full_name,
      email,
      program,
      senior_high_school,
      strand: strand || '',
      contact_number: normalizedContactNumber,
      status: 'in_progress'
    });
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/applicants/:id/submit — finalize applicant and upload documents to Dropbox
router.post('/:id/submit', async (req, res) => {
  try {
    const applicantId = req.params.id;
    const { data: applicant, error: applicantError } = await dbSelectOne('applicants', applicantId);
    if (applicantError || !applicant) {
      return res.status(404).json({ success: false, error: 'Applicant not found' });
    }

    const { data: documents, error: documentsError } = await dbSelect('documents', { applicant_id: applicantId });
    if (documentsError) throw documentsError;

    const dropboxResult = await uploadApplicantDocsToDropbox(applicant, documents || []);
    const { data, error } = await dbUpdate('applicants', applicantId, { status: 'completed' });
    if (error) throw error;

    res.json({ success: true, data, dropbox: dropboxResult });
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
// GET /api/applicants/schools/search?q=query
router.get('/schools/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 1) return res.json({ success: true, data: [] });

  try {
    if (require('../db/supabase').isInMemory()) {
      // fallback for in-memory mode
      return res.json({ success: true, data: [] });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = require('../db/supabase').getClient();

    const { data, error } = await supabase
      .from('schools')
      .select('id, name, city, region, type')
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .limit(8);

    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;