// backend/routes/interviews.js
const express = require('express');
const router = express.Router();
const { dbInsert, dbSelect, dbSelectOne, dbUpdate } = require('../db/supabase');
const { callN8nWorkflow, isN8nEnabled } = require('../services/n8n');

const FALLBACK_QUESTIONS = [
  {
    label: 'Tell us about yourself',
    text: "Hi, I'm Konnekt, and I'll guide you through your interview today. Let's begin with something simple. Tell me a little about yourself, including your background, your interests, and what makes you unique."
  },
  {
    label: 'Why this program?',
    text: "Thank you. I'd love to hear more about your academic direction. What made you choose this program at our university, and what about this field feels right for you?"
  },
  {
    label: 'Your strengths as a student',
    text: 'That helps a lot. Every student brings different strengths into the classroom. What qualities, habits, or skills help you do your best as a learner?'
  },
  {
    label: 'Handling challenges',
    text: 'Let\'s talk about resilience for a moment. When school becomes difficult or something does not go as planned, how do you usually respond and move forward?'
  },
  {
    label: 'Goals after graduation',
    text: "You're doing well, and this is the last question. Looking ahead, what kind of future are you working toward after graduation, and where would you like to be in the next five to ten years?"
  }
];

function getFallbackQuestion(index) {
  return FALLBACK_QUESTIONS[index] || {
    label: `Question ${index + 1}`,
    text: 'Please share your thoughts on this part of your interview.'
  };
}

async function buildInterviewContext(interviewId, applicantId) {
  const [{ data: interview }, { data: applicant }, { data: responses }, { data: documents }] = await Promise.all([
    dbSelectOne('interviews', interviewId),
    dbSelectOne('applicants', applicantId),
    dbSelect('responses', { interview_id: interviewId }),
    dbSelect('documents', { applicant_id: applicantId })
  ]);

  const sortedResponses = (responses || []).sort((a, b) => a.question_index - b.question_index);

  return {
    interview: interview || null,
    applicant: applicant || null,
    responses: sortedResponses,
    documents: documents || []
  };
}

// POST /api/interviews — start new interview
router.post('/', async (req, res) => {
  try {
    const { applicant_id, total_questions } = req.body;
    if (!applicant_id) return res.status(400).json({ success: false, error: 'applicant_id required' });
    const { data, error } = await dbInsert('interviews', {
      applicant_id,
      total_questions: total_questions || 5,
      questions_answered: 0,
      status: 'in_progress',
      ai_model: isN8nEnabled() ? 'n8n' : 'rule-based'
    });
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/interviews/:id/next-question — get next question (n8n/fallback)
router.post('/:id/next-question', async (req, res) => {
  try {
    const { applicant_id } = req.body;
    if (!applicant_id) return res.status(400).json({ success: false, error: 'applicant_id required' });

    const context = await buildInterviewContext(req.params.id, applicant_id);
    if (!context.interview) return res.status(404).json({ success: false, error: 'Interview not found' });

    const questionIndex = context.responses.length;
    const totalQuestions = context.interview.total_questions || 5;

    if (questionIndex >= totalQuestions) {
      return res.json({ success: true, data: { done: true, question_index: questionIndex } });
    }

    const fallback = getFallbackQuestion(questionIndex);
    const n8nResult = await callN8nWorkflow('next_question', {
      interview_id: req.params.id,
      question_index: questionIndex,
      total_questions: totalQuestions,
      applicant: context.applicant,
      responses: context.responses,
      documents: context.documents
    });

    const selected = n8nResult.success && n8nResult.question
      ? { ...n8nResult.question, source: 'n8n' }
      : { ...fallback, source: 'fallback' };

    res.json({
      success: true,
      data: {
        done: false,
        question_index: questionIndex,
        question_label: selected.label,
        question_text: selected.text,
        source: selected.source
      }
    });
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

    await dbUpdate('interviews', req.params.id, { questions_answered: (question_index || 0) + 1 });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/interviews/:id/final-summary — get final summary (n8n/fallback)
router.post('/:id/final-summary', async (req, res) => {
  try {
    const { applicant_id } = req.body;
    if (!applicant_id) return res.status(400).json({ success: false, error: 'applicant_id required' });

    const context = await buildInterviewContext(req.params.id, applicant_id);
    if (!context.interview) return res.status(404).json({ success: false, error: 'Interview not found' });

    const firstName = context.applicant?.full_name?.split(' ')?.[0] || 'there';
    const fallbackSummary = `Excellent work, ${firstName}! 🎉 You've completed all ${context.interview.total_questions || 5} interview questions. Your responses have been recorded. Please proceed to review your interview summary and submit your application.`;

    const n8nResult = await callN8nWorkflow('final_summary', {
      interview_id: req.params.id,
      total_questions: context.interview.total_questions || 5,
      applicant: context.applicant,
      responses: context.responses,
      documents: context.documents
    });

    const summary = n8nResult.success && n8nResult.summary ? n8nResult.summary : fallbackSummary;

    res.json({ success: true, data: { summary, source: n8nResult.success && n8nResult.summary ? 'n8n' : 'fallback' } });
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
