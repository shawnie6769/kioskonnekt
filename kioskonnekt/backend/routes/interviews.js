// backend/routes/interviews.js
const express = require('express');
const router = express.Router();
const { dbInsert, dbSelect, dbSelectOne, dbUpdate } = require('../db/supabase');
const { generateNextQuestion, generateFinalSummary } = require('../services/openrouter');

const DEFAULT_FALLBACK_QUESTIONS = [
  {
    label: 'Tell us about yourself',
    text: "Hi, I'm KiosKonnekt, and I'll guide you through your interview today. Let's begin with something simple. Tell me a little about yourself, including your background, your interests, and what makes you unique."
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

// Tagalog translations for fallback questions
const TRANSLATIONS_TL = [
  {
    label: 'Ipakilala ang Iyong Sarili',
    text: "Kumusta, ako si Konnekt at ako ang gagabay sa iyo sa panayam na ito. Magsimula tayo sa isang simpleng tanong: maaari mo bang ipakilala ang iyong sarili? Ikuwento mo nang kaunti ang iyong pinagmulan, mga interes, at kung ano ang natatangi sa iyo."
  },
  {
    label: 'Bakit ang Programang Ito?',
    text: "Salamat. Nais kong mas makilala ang iyong akademikong direksyon. Ano ang nag-udyok sa iyo na piliin ang programang ito sa aming unibersidad? At ano ang mga bagay na sa tingin mo ay akma sa iyo sa larangang ito?"
  },
  {
    label: 'Iyong mga Lakas bilang Mag-aaral',
    text: "Mabuti iyon. Ang bawat mag-aaral ay may kani-kaniyang lakas na naiaambag sa pagkatuto. Ano-ano ang iyong mga katangian, gawi, o kasanayan na nakatutulong sa iyong magtagumpay bilang isang mag-aaral?"
  },
  {
    label: 'Pagharap sa mga Hamon',
    text: "Pag-usapan naman natin kung paano mo hinaharap ang mga pagsubok. Kapag nahihirapan ka sa pag-aaral o may mga bagay na hindi naaayon sa plano, paano mo ito hinaharap at nalalampasan?"
  },
  {
    label: 'Mga Layunin Pagkatapos Magtapos',
    text: "Magaling. Para sa huling tanong: sa pagtingin sa hinaharap, ano ang iyong mga layunin pagkatapos mong makapagtapos? Saan mo nakikita ang iyong sarili sa loob ng lima hanggang sampung taon?"
  }
];

async function getActiveFallbackQuestions() {
  try {
    const { data, error } = await dbSelect('fallback_questions', { is_active: true });
    if (error) return DEFAULT_FALLBACK_QUESTIONS;
    const normalized = (data || [])
      .sort((a, b) => Number(a.question_index || 0) - Number(b.question_index || 0))
      .map((q) => ({ label: q.label, text: q.text }));
    return normalized.length > 0 ? normalized : DEFAULT_FALLBACK_QUESTIONS;
  } catch (err) {
    return DEFAULT_FALLBACK_QUESTIONS;
  }
}

async function getFallbackQuestion(index) {
  const active = await getActiveFallbackQuestions();
  return active[index] || {
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

// ── Helper: get next question from Gemini with fallback ──────────────────────
async function getNextQuestion(questionIndex, totalQuestions, context, locale) {
  const wantFil = locale && (locale.startsWith('fil') || locale.startsWith('tl'));

  // Try Gemini first (only if API key is set)
  if (process.env.GROQ_API_KEY) {
    try {
      const aiQuestion = await generateNextQuestion(
        questionIndex,
        totalQuestions,
        context.applicant,
        context.responses,
        context.documents
      );
      if (aiQuestion) {
        console.log(`✅ Gemini generated Q${questionIndex + 1}:`, aiQuestion.label);
        return { ...aiQuestion, source: "groq" };
      }
    } catch (err) {
      console.error('Gemini question generation failed, using fallback:', err.message);
    }
  }

  // Fallback to hardcoded questions
  const fallback = await getFallbackQuestion(questionIndex);
  if (wantFil && TRANSLATIONS_TL[questionIndex]) {
    return { ...TRANSLATIONS_TL[questionIndex], source: 'fallback' };
  }
  return { ...fallback, source: 'fallback' };
}

// POST /api/interviews — start new interview
router.post('/', async (req, res) => {
  try {
    const { applicant_id, total_questions } = req.body;
    if (!applicant_id) return res.status(400).json({ success: false, error: 'applicant_id required' });

    const activeFallback = await getActiveFallbackQuestions();
    const effectiveTotalQuestions = Number.isInteger(total_questions)
      ? total_questions
      : Math.max(1, activeFallback.length || 5);

    const { data, error } = await dbInsert('interviews', {
      applicant_id,
      total_questions: effectiveTotalQuestions,
      questions_answered: 0,
      status: 'in_progress',
      ai_model: process.env.GROQ_API_KEY ? 'groq' : 'rule-based'
    });
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/interviews/:id/next-question — get next question
router.post('/:id/next-question', async (req, res) => {
  try {
    const { applicant_id, locale } = req.body;
    if (!applicant_id) return res.status(400).json({ success: false, error: 'applicant_id required' });

    const context = await buildInterviewContext(req.params.id, applicant_id);
    if (!context.interview) return res.status(404).json({ success: false, error: 'Interview not found' });

    const questionIndex = context.responses.length;
    const totalQuestions = context.interview.total_questions || 5;

    if (questionIndex >= totalQuestions) {
      return res.json({ success: true, data: { done: true, question_index: questionIndex } });
    }

    const selected = await getNextQuestion(questionIndex, totalQuestions, context, locale || '');

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
    const { applicant_id, question_index, question_label, question_text, answer_text, input_method, locale } = req.body;
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

    // Fetch fresh context and pre-generate next question
    const context = await buildInterviewContext(req.params.id, applicant_id);
    const totalQuestions = context.interview.total_questions || 5;
    const nextQuestionIndex = context.responses.length;

    let nextQuestion = null;
    if (nextQuestionIndex < totalQuestions) {
      nextQuestion = await getNextQuestion(nextQuestionIndex, totalQuestions, context, locale || '');
    }

    res.status(201).json({
      success: true,
      data: {
        response: data,
        nextQuestion: nextQuestion ? {
          done: false,
          question_index: nextQuestionIndex,
          question_label: nextQuestion.label,
          question_text: nextQuestion.text,
          source: nextQuestion.source
        } : { done: true }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/interviews/:id/final-summary — get final summary
router.post('/:id/final-summary', async (req, res) => {
  try {
    const { applicant_id } = req.body;
    if (!applicant_id) return res.status(400).json({ success: false, error: 'applicant_id required' });

    const context = await buildInterviewContext(req.params.id, applicant_id);
    if (!context.interview) return res.status(404).json({ success: false, error: 'Interview not found' });

    const firstName = context.applicant?.full_name?.split(' ')?.[0] || 'there';
    const fallbackSummary = `Excellent work, ${firstName}! You've completed all ${context.interview.total_questions || 5} interview questions. Your responses have been recorded. Please proceed to review your interview summary and submit your application.`;

    let summary = fallbackSummary;
    let source = 'fallback';

    if (process.env.GROQ_API_KEY) {
      try {
        const aiSummary = await generateFinalSummary(
          context.applicant,
          context.responses,
          context.interview.total_questions || 5
        );
        if (aiSummary) {
          summary = aiSummary;
          source = 'gemini';
        }
      } catch (err) {
        console.error('Gemini summary failed, using fallback:', err.message);
      }
    }

    res.json({ success: true, data: { summary, source } });
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
