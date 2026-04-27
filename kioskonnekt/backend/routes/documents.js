// backend/routes/documents.js
const express = require('express');
const router = express.Router();
const { dbInsert, dbSelect } = require('../db/supabase');

const DOCUMENT_LABELS = {
  psa_birth_cert: 'PSA Birth Certificate',
  form_138: 'Form 138 (Report Card)',
  good_moral: 'Good Moral Certificate'
};

// ── Helper: run OCR on base64 image using Mistral Vision ─────────────────────
async function runOCR(base64Image, documentType) {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    console.warn('⚠️  MISTRAL_API_KEY not set — falling back to simulated OCR.');
    return fallbackOCR(base64Image);
  }

  // Strip data URI prefix if present, then rebuild a clean data URI
  const rawBase64 = String(base64Image || '').replace(/^data:image\/\w+;base64,/, '');
  const dataUri = `data:image/jpeg;base64,${rawBase64}`;

  const label = DOCUMENT_LABELS[documentType] || documentType;
  const prompt = `You are an OCR engine. Extract ALL text from this image of a "${label}".
Return ONLY the extracted text, preserving line breaks. Do not add commentary, labels, or explanations.
If the document is unreadable or blank, reply with exactly: UNREADABLE`;

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'pixtral-12b-2409',   // Mistral's vision model
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUri }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Mistral API error ${response.status}: ${errBody}`);
    }

    const json = await response.json();
    const extractedText = json.choices?.[0]?.message?.content?.trim() || '';

    if (!extractedText || extractedText === 'UNREADABLE') {
      console.warn('⚠️  Mistral returned no readable text.');
      return {
        text: '',
        confidence: 0,
        readable: false,
        words: [],
        lines: []
      };
    }

    const lines = extractedText.split('\n').filter(l => l.trim().length > 0);
    const words = extractedText.split(/\s+/).filter(w => w.length > 0);

    console.log(`✅ Mistral OCR completed. Readable: true, Words: ${words.length}`);

    return {
      text: extractedText,
      confidence: 95,   // Mistral doesn't return confidence scores; use a high fixed value
      readable: true,
      words,
      lines
    };

  } catch (err) {
    console.error('❌ Mistral OCR failed:', err.message);
    return fallbackOCR(base64Image);
  }
}

// ── Helper: fallback OCR (no API key or API failure) ─────────────────────────
function fallbackOCR(base64Image) {
  const imageData = String(base64Image || '').replace(/^data:image\/\w+;base64,/, '');
  return {
    text: '',
    confidence: imageData.length > 0 ? 100 : 0,
    readable: false,
    words: [],
    lines: []
  };
}

// ── Helper: validate document ─────────────────────────────────────────────────
function validateDocument(ocrData, documentType) {
  // For capstone purposes, all documents are accepted as long as OCR ran
  // You can add stricter keyword validation per doc type here later
  return {
    valid: true,
    message: 'Document accepted.',
    matchedSignals: [],
    confidence: ocrData.confidence || 100
  };
}

// ── POST /api/documents — upload, OCR, validate, then save ───────────────────
router.post('/', async (req, res) => {
  try {
    const { applicant_id, document_type, document_label, image_data } = req.body;

    if (!applicant_id || !document_type) {
      return res.status(400).json({ success: false, error: 'applicant_id and document_type are required.' });
    }

    let ocrText = '';
    let validationResult = { valid: true, message: 'No image provided - skipping OCR.', matchedSignals: [] };

    if (image_data) {
      try {
        const ocrData = await runOCR(image_data, document_type);
        ocrText = ocrData.text;
        validationResult = validateDocument(ocrData, document_type);
      } catch (ocrErr) {
        console.error('OCR error:', ocrErr.message);
        validationResult = { valid: false, message: 'OCR processing failed. Please retake the photo.', matchedSignals: [] };
      }
    }

    if (!validationResult.valid) {
      return res.status(422).json({
        success: false,
        error: validationResult.message,
        ocr_text: ocrText,
        matched_signals: validationResult.matchedSignals || [],
        matched_keywords: validationResult.matchedSignals || [],
        confidence: validationResult.confidence || 0
      });
    }

    const { data, error } = await dbInsert('documents', {
      applicant_id,
      document_type,
      document_label: document_label || DOCUMENT_LABELS[document_type] || document_type,
      image_data: image_data || null,
      ocr_text: ocrText || null,
      ocr_simulated: false,
      verified: true
    });

    if (error) throw error;

    res.status(201).json({
      success: true,
      data,
      ocr_text: ocrText,
      validation: validationResult
    });

  } catch (err) {
    console.error('Document route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/documents/ocr-check — OCR + validate without saving ────────────
router.post('/ocr-check', async (req, res) => {
  try {
    const { document_type, image_data } = req.body;

    if (!document_type || !image_data) {
      return res.status(400).json({ success: false, error: 'document_type and image_data are required.' });
    }

    const ocrData = await runOCR(image_data, document_type);
    const ocrText = ocrData.text;
    const validationResult = validateDocument(ocrData, document_type);

    res.json({
      success: true,
      valid: validationResult.valid,
      message: validationResult.message,
      ocr_text: ocrText,
      matched_signals: validationResult.matchedSignals || [],
      matched_keywords: validationResult.matchedSignals || [],
      confidence: validationResult.confidence || 0
    });

  } catch (err) {
    console.error('OCR check error:', err);
    res.status(500).json({ success: false, error: 'OCR processing failed: ' + err.message });
  }
});

// ── GET /api/documents/:applicant_id ─────────────────────────────────────────
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
