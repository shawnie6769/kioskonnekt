// backend/services/openrouter.js
// Using Groq API — free tier, 14,400 requests/day, no credit card needed

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TEXT_MODEL = 'llama-3.1-8b-instant'; // fast, free, reliable

async function callGroq(messages, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: TEXT_MODEL,
          messages,
          max_tokens: 512,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq error ${response.status}: ${err}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || '';

    } catch (err) {
      console.warn(`Groq attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 1000));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Scan a document image.
 * Groq doesn't support vision — OCR is handled by Mistral in documents.js
 */
async function scanDocument(base64Image, docType = 'document') {
  const hasImage = base64Image && base64Image.length > 100;
  console.log(`📄 Document scan: ${docType} — ${hasImage ? 'image received, auto-accepted' : 'no image'}`);
  return {
    text: '',
    confidence: hasImage ? 100 : 0,
    readable: false,
    words: [],
    lines: []
  };
}

/**
 * Build a readable document summary from OCR text for Groq's context.
 * Truncates OCR text so we don't blow the token limit.
 */
function buildDocumentSummary(documents) {
  if (!documents || documents.length === 0) return 'No documents submitted.';

  return documents.map(doc => {
    const label = doc.document_label || doc.document_type || 'Document';
    const ocrText = (doc.ocr_text || '').trim();

    if (!ocrText) {
      return `- ${label}: submitted (no text extracted)`;
    }

    // Truncate to 300 chars per doc so we don't eat the token budget
    const preview = ocrText.length > 300
      ? ocrText.slice(0, 300) + '...'
      : ocrText;

    return `- ${label}:\n${preview}`;
  }).join('\n\n');
}

/**
 * Generate the next interview question based on context.
 */
async function generateNextQuestion(questionIndex, totalQuestions, applicant, responses, documents) {
  try {
    const docSummary = buildDocumentSummary(documents);

    const prevAnswers = (responses || []).length > 0
      ? (responses || []).map((r, i) =>
          `Q${i + 1} - ${r.question_label}:\nApplicant said: "${r.answer_text}"`
        ).join('\n\n')
      : null;

    const isLast = questionIndex === totalQuestions - 1;

    const prompt = `You are KiosKonnekt, a friendly AI interview assistant for PLV (Pamantasan ng Lungsod ng Valenzuela) university admissions kiosk in the Philippines.

Applicant name: ${applicant?.full_name || 'Applicant'}
Program applied: ${applicant?.program || 'Not specified'}

Submitted documents and their extracted content:
${docSummary}

${prevAnswers
  ? `The applicant has already answered these questions:\n\n${prevAnswers}\n\nIMPORTANT: Read their answers carefully and ask a follow-up question based on something specific they mentioned.`
  : `This is the very first question. Start with a warm greeting and ask them to introduce themselves.`
}

Generate question number ${questionIndex + 1} of ${totalQuestions}.
${isLast ? 'This is the FINAL question — ask about their future goals or aspirations.' : ''}

Rules:
- Be warm, friendly, and encouraging
- One question only, no sub-questions
- Do NOT repeat a topic already covered
- Keep it relevant to university admissions
- If document content reveals something interesting (school name, awards, grades), you may reference it naturally

Respond with valid JSON only, no markdown, no extra text:
{"label": "Short topic (3-5 words)", "text": "Full conversational question to read aloud"}`;

    const raw = await callGroq([{ role: 'user', content: prompt }]);
    const jsonMatch = raw.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`✅ Groq generated Q${questionIndex + 1}:`, parsed.label);

    return {
      label: parsed.label || `Question ${questionIndex + 1}`,
      text: parsed.text || 'Please share your thoughts on this next question.'
    };
  } catch (err) {
    console.error('Groq generateNextQuestion error:', err.message);
    return null;
  }
}

/**
 * Generate a warm closing summary after all questions are answered.
 */
async function generateFinalSummary(applicant, responses, totalQuestions) {
  try {
    const firstName = applicant?.full_name?.split(' ')?.[0] || 'there';
    const allAnswers = (responses || []).map((r, i) =>
      `Q${i + 1} - ${r.question_label}: "${r.answer_text}"`
    ).join('\n');

    const prompt = `You are KiosKonnekt, a university admissions kiosk AI for PLV (Pamantasan ng Lungsod ng Valenzuela) in the Philippines.

The applicant ${firstName} just finished their ${totalQuestions}-question admissions interview.

Their answers:
${allAnswers}

Write a warm, encouraging closing message (3-4 sentences) that:
1. Congratulates them for completing the interview
2. Mentions one specific positive thing from their answers
3. Tells them their responses have been recorded and the admissions team will review them

Address ${firstName} directly. Be warm but professional. Plain text only, no bullet points, no formatting.`;

    const summary = await callGroq([{ role: 'user', content: prompt }]);
    console.log('✅ Groq generated final summary');
    return summary;
  } catch (err) {
    console.error('Groq generateFinalSummary error:', err.message);
    const firstName = applicant?.full_name?.split(' ')?.[0] || 'there';
    return `Excellent work, ${firstName}! You've successfully completed all ${totalQuestions} interview questions. Your responses have been recorded and our admissions team at PLV will review them shortly. We wish you all the best!`;
  }
}

module.exports = { scanDocument, generateNextQuestion, generateFinalSummary };
