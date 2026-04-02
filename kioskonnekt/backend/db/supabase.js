// backend/db/supabase.js
// Supabase client initialization + fallback in-memory store for prototype demo

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let supabase = null;
let useInMemory = false;

// In-memory store for when Supabase is not configured
const memStore = {
  applicants: [],
  interviews: [],
  responses: [],
  documents: [],
  admin_users: [
    { id: '1', username: 'admin', password_hash: 'kioskonnekt2025', full_name: 'System Administrator', role: 'superadmin' }
  ]
};

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || url.includes('your-project-id') || !key || key.includes('your-')) {
    console.log('⚠️  Supabase not configured — using in-memory storage (prototype mode)');
    useInMemory = true;
    return null;
  }

  try {
    supabase = createClient(url, key);
    console.log('✅ Supabase connected');
    return supabase;
  } catch (err) {
    console.log('⚠️  Supabase connection failed — falling back to in-memory storage');
    useInMemory = true;
    return null;
  }
}

// ─── Generic DB operations that work for both Supabase and in-memory ───

async function dbInsert(table, data) {
  if (useInMemory) {
    const { v4: uuidv4 } = require('uuid');
    const record = { id: uuidv4(), ...data, created_at: new Date().toISOString() };
    memStore[table].push(record);
    return { data: record, error: null };
  }
  const { data: result, error } = await supabase.from(table).insert(data).select().single();
  return { data: result, error };
}

async function dbSelect(table, filters = {}) {
  if (useInMemory) {
    let results = [...memStore[table]];
    Object.entries(filters).forEach(([key, val]) => {
      results = results.filter(r => r[key] === val);
    });
    return { data: results, error: null };
  }
  let query = supabase.from(table).select('*');
  Object.entries(filters).forEach(([key, val]) => {
    query = query.eq(key, val);
  });
  const { data, error } = await query.order('created_at', { ascending: false });
  return { data, error };
}

async function dbSelectOne(table, id) {
  if (useInMemory) {
    const record = memStore[table].find(r => r.id === id);
    return { data: record || null, error: record ? null : 'Not found' };
  }
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  return { data, error };
}

async function dbUpdate(table, id, updates) {
  if (useInMemory) {
    const idx = memStore[table].findIndex(r => r.id === id);
    if (idx >= 0) {
      memStore[table][idx] = { ...memStore[table][idx], ...updates, updated_at: new Date().toISOString() };
      return { data: memStore[table][idx], error: null };
    }
    return { data: null, error: 'Not found' };
  }
  const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single();
  return { data, error };
}

async function dbGetStats() {
  if (useInMemory) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: memStore.applicants.length,
      completed: memStore.applicants.filter(a => a.status === 'completed').length,
      today: memStore.applicants.filter(a => a.created_at && a.created_at.startsWith(today)).length,
      programs: [...new Set(memStore.applicants.map(a => a.program))].length
    };
  }
  const { data: all } = await supabase.from('applicants').select('status, created_at, program');
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: all?.length || 0,
    completed: all?.filter(a => a.status === 'completed').length || 0,
    today: all?.filter(a => a.created_at?.startsWith(today)).length || 0,
    programs: [...new Set(all?.map(a => a.program) || [])].length
  };
}

// Seed demo data for in-memory mode
function seedDemoData() {
  if (!useInMemory || memStore.applicants.length > 0) return;

  const { v4: uuidv4 } = require('uuid');
  const demos = [
    { id: uuidv4(), full_name: 'Maria Clara Santos', email: 'maria@email.com', program: 'BS Computer Science', senior_high_school: 'Pasig City National HS', strand: 'STEM', status: 'completed', created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: uuidv4(), full_name: 'Juan Miguel dela Cruz', email: 'juan@email.com', program: 'BS Nursing', senior_high_school: 'Marikina Science HS', strand: 'STEM', status: 'completed', created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: uuidv4(), full_name: 'Ana Gabrielle Reyes', email: 'ana@email.com', program: 'BS Business Administration', senior_high_school: 'QC Science HS', strand: 'ABM', status: 'completed', created_at: new Date(Date.now() - 1800000).toISOString() }
  ];

  const sampleAnswers = [
    ["I'm Maria, a passionate tech enthusiast. I love building things that solve real problems and I've been coding since I was 13.", "I've always been drawn to how technology can transform communities. CS will give me the tools to create meaningful solutions.", "I'm very detail-oriented, persistent, and quick to learn new skills. I also work well in collaborative environments.", "I break the challenge into smaller tasks, set mini-deadlines, and seek help from peers and teachers when needed.", "I plan to join a software company after graduation, build experience, then launch a tech startup focused on EdTech."],
    ["Hi! I'm Juan and I've always been passionate about healthcare and helping people recover and feel better.", "Nursing lets me make a direct, life-changing impact every single day. I want to be there for patients in critical moments.", "I'm empathetic, calm under pressure, and very dedicated. My clinical exposure in SHS reinforced my commitment.", "I stay focused, rely on my training, consult senior staff, and prioritize patient safety above all else.", "I plan to specialize in ICU care, take my nursing board exam, and eventually work abroad to support my family."],
    ["I'm Ana, student council president from QC. I love leadership, strategy, and building connections with people.", "Business Administration aligns with my goal of running and expanding our family's small business more professionally.", "I'm a natural leader, highly organized, strong communicator, and I thrive when I'm given responsibility.", "I create detailed action plans, delegate effectively, and maintain a positive mindset even under academic pressure.", "I aim to earn an MBA after my bachelor's degree, then return to manage and expand our family business nationally."]
  ];

  const questions = ['Tell us about yourself', 'Why did you choose this program?', "What are your strengths as a student?", "How do you handle academic challenges?", "What are your goals after graduating?"];
  const questionTexts = [
    "Hello! I'm Konnekt, your AI admissions assistant. Let's begin! Can you please tell us a bit about yourself?",
    "Wonderful! Now, why did you choose this specific program for your university studies?",
    "Great insight! What would you say are your key strengths as a student?",
    "Thank you for sharing that! How do you typically handle challenges or difficulties in your academic life?",
    "Last question — what are your long-term goals and aspirations after graduating from university?"
  ];

  demos.forEach((applicant, ai) => {
    memStore.applicants.push(applicant);
    const interview = { id: uuidv4(), applicant_id: applicant.id, started_at: applicant.created_at, completed_at: new Date(new Date(applicant.created_at).getTime() + 900000).toISOString(), questions_answered: 5, total_questions: 5, status: 'completed', ai_model: 'rule-based', created_at: applicant.created_at };
    memStore.interviews.push(interview);
    questions.forEach((label, qi) => {
      memStore.responses.push({ id: uuidv4(), interview_id: interview.id, applicant_id: applicant.id, question_index: qi, question_label: label, question_text: questionTexts[qi], answer_text: sampleAnswers[ai][qi], input_method: qi % 2 === 0 ? 'typed' : 'voice', word_count: sampleAnswers[ai][qi].split(' ').length, answered_at: new Date(new Date(applicant.created_at).getTime() + qi * 180000).toISOString() });
    });
    ['PSA Birth Certificate', 'Form 138 (Report Card)', 'Good Moral Certificate'].forEach(docName => {
      memStore.documents.push({ id: uuidv4(), applicant_id: applicant.id, document_type: docName.toLowerCase().replace(/\s+/g, '_'), document_label: docName, captured_at: applicant.created_at });
    });
  });
}

module.exports = { initSupabase, dbInsert, dbSelect, dbSelectOne, dbUpdate, dbGetStats, seedDemoData, getMemStore: () => memStore, isInMemory: () => useInMemory };
