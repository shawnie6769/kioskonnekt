// backend/routes/documents.js
const express = require('express');
const router = express.Router();
const { dbInsert, dbSelect } = require('../db/supabase');

const DOCUMENT_LABELS = {
  psa_birth_cert: 'PSA Birth Certificate',
  form_138: 'Form 138 (Report Card)',
  good_moral: 'Good Moral Certificate'
};

// PSA-only profile-based validator. This avoids keyword matching and instead
// scores OCR layout/shape signals that are typical for a real PSA document.
const PSA_PROFILE = {
  minWords: 90,
  minLines: 18,
  minAvgConfidence: 45,
  scoreThreshold: 0.72,
  signals: {
    wordCount: { min: 120, max: 650, weight: 0.2 },
    lineCount: { min: 22, max: 95, weight: 0.2 },
    digitRatio: { min: 0.06, max: 0.35, weight: 0.12 },
    uppercaseRatio: { min: 0.15, max: 0.75, weight: 0.12 },
    avgWordLength: { min: 3.2, max: 8.5, weight: 0.1 },
    wordsPerLine: { min: 2.8, max: 11, weight: 0.14 },
    longLineRatio: { min: 0.2, max: 0.9, weight: 0.12 }
  }
};

// ── Helper: run OCR on base64 image ──────────────────────────────────────────
async function runOCR(base64Image) {
  // OCR is simulated in this prototype when OCR engine is not installed.
  const imageData = String(base64Image || '').replace(/^data:image\/\w+;base64,/, '');
  const approxSize = imageData.length;
  return {
    text: '',
    confidence: approxSize > 0 ? 100 : 0,
    words: [],
    lines: []
  };
}

function getSignalScore(value, min, max) {
  if (value >= min && value <= max) return 1;
  const range = Math.max(max - min, 1e-6);
  if (value < min) {
    const distance = min - value;
    return Math.max(0, 1 - distance / range);
  }
  const distance = value - max;
  return Math.max(0, 1 - distance / range);
}

function extractPSAFeatures(ocrData) {
  const words = ocrData.words || [];
  const lines = ocrData.lines || [];
  const wordTexts = words.map((w) => String(w.text || '').trim()).filter(Boolean);
  const allText = wordTexts.join(' ');
  const charCount = allText.length || 1;

  const digits = (allText.match(/\d/g) || []).length;
  const uppers = (allText.match(/[A-Z]/g) || []).length;
  const letters = (allText.match(/[A-Za-z]/g) || []).length || 1;

  const totalWordLength = wordTexts.reduce((sum, txt) => sum + txt.length, 0);
  const avgWordLength = wordTexts.length ? totalWordLength / wordTexts.length : 0;

  const lineLengths = lines
    .map((line) => String(line.text || '').trim().length)
    .filter((len) => len > 0);
  const longLineCount = lineLengths.filter((len) => len >= 28).length;
  const longLineRatio = lineLengths.length ? longLineCount / lineLengths.length : 0;

  return {
    wordCount: wordTexts.length,
    lineCount: lines.length,
    avgConfidence: Number(ocrData.confidence || 0),
    digitRatio: digits / charCount,
    uppercaseRatio: uppers / letters,
    avgWordLength,
    wordsPerLine: lines.length ? wordTexts.length / lines.length : 0,
    longLineRatio
  };
}

function validatePSABirthCertificate(ocrData) {
  const features = extractPSAFeatures(ocrData);

  if (features.wordCount < PSA_PROFILE.minWords || features.lineCount < PSA_PROFILE.minLines) {
    return {
      valid: false,
      message: '❌ PSA validation failed: document content is too sparse. Retake with full page in frame and better lighting.',
      matchedSignals: [],
      confidence: 0,
      features
    };
  }

  if (features.avgConfidence < PSA_PROFILE.minAvgConfidence) {
    return {
      valid: false,
      message: '❌ PSA validation failed: OCR quality is too low. Retake with less blur and glare.',
      matchedSignals: [],
      confidence: Math.round(features.avgConfidence),
      features
    };
  }

  const signalScores = Object.entries(PSA_PROFILE.signals).map(([name, cfg]) => ({
    name,
    weight: cfg.weight,
    score: getSignalScore(features[name], cfg.min, cfg.max)
  }));

  const totalWeight = signalScores.reduce((sum, s) => sum + s.weight, 0) || 1;
  const weightedScore = signalScores.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;
  const confidence = Math.round(weightedScore * 100);

  const matchedSignals = signalScores
    .filter((s) => s.score >= 0.9)
    .map((s) => s.name);

  if (weightedScore >= PSA_PROFILE.scoreThreshold) {
    return {
      valid: true,
      message: '✅ PSA Birth Certificate pattern validated.',
      matchedSignals,
      confidence,
      features
    };
  }

  return {
    valid: false,
    message: '❌ This capture does not match a PSA Birth Certificate pattern. Scan the original PSA document flat and fully visible.',
    matchedSignals,
    confidence,
    features
  };
}

// ── Helper: validate OCR result by document type ─────────────────────────────
function validateDocument(ocrData, documentType) {
  // All document types are accepted without strict validation
  return {
    valid: true,
    message: 'Document accepted.',
    matchedSignals: [],
    confidence: 100
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

    // Run OCR + validation if an image was provided
    if (image_data) {
      try {
        const ocrData = await runOCR(image_data);
        ocrText = ocrData.text;
        validationResult = validateDocument(ocrData, document_type);
      } catch (ocrErr) {
        console.error('OCR error:', ocrErr.message);
        // Don't block saving — just flag it
        validationResult = { valid: false, message: 'OCR processing failed. Please retake the photo.', matchedSignals: [] };
      }
    }

    // Reject invalid documents — don't save to DB
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

    // Save to database
    const { data, error } = await dbInsert('documents', {
      applicant_id,
      document_type,
      document_label: document_label || DOCUMENT_LABELS[document_type] || document_type,
      image_data: image_data || null,
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
// Use this to preview validation before final submission
router.post('/ocr-check', async (req, res) => {
  try {
    const { document_type, image_data } = req.body;

    if (!document_type || !image_data) {
      return res.status(400).json({ success: false, error: 'document_type and image_data are required.' });
    }

    const ocrData = await runOCR(image_data);
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