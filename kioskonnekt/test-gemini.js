// test-gemini.js
require('dotenv').config();
const { generateNextQuestion, generateFinalSummary } = require('./backend/services/gemini');

async function test() {
  console.log('Testing Gemini...');
  
  const question = await generateNextQuestion(
    0, 5,
    { full_name: 'Juan dela Cruz', program: 'BSIT' },
    [],
    []
  );
  
  console.log('Generated question:', question);
}

test();