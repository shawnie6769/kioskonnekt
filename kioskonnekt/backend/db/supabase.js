// backend/db/supabase.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let supabase = null;
let useInMemory = false;

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

// Each table uses a different timestamp column for ordering.
// Using the wrong column causes Supabase to return empty results silently.
const TABLE_ORDER_COLS = {
  applicants:  'created_at',
  admin_users: 'created_at',
  interviews:  'started_at',
  responses:   'answered_at',
  documents:   'captured_at',
  schools:     'name'
};

async function dbInsert(table, data) {
  if (useInMemory) {
    const { v4: uuidv4 } = require('uuid');
    const record = { id: uuidv4(), ...data, created_at: new Date().toISOString() };
    memStore[table].push(record);
    return { data: record, error: null };
  }
  const { data: result, error } = await supabase.from(table).insert(data).select().single();
  if (error) console.error(`dbInsert error [${table}]:`, error.message);
  return { data: result, error };
}

async function dbSelect(table, filters = {}) {
  if (useInMemory) {
    let results = [...(memStore[table] || [])];
    Object.entries(filters).forEach(([key, val]) => {
      results = results.filter(r => r[key] === val);
    });
    return { data: results, error: null };
  }

  const orderCol = TABLE_ORDER_COLS[table] || 'created_at';
  try {
    let query = supabase.from(table).select('*');
    Object.entries(filters).forEach(([key, val]) => {
      query = query.eq(key, val);
    });
    const { data, error } = await query.order(orderCol, { ascending: false });
    if (error) console.error(`dbSelect error [${table}]:`, error.message);
    return { data: data || [], error };
  } catch (err) {
    console.error(`dbSelect threw [${table}]:`, err.message);
    return { data: [], error: err };
  }
}

async function dbSelectOne(table, id) {
  if (useInMemory) {
    const record = (memStore[table] || []).find(r => r.id === id);
    return { data: record || null, error: record ? null : 'Not found' };
  }
  try {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    if (error) console.error(`dbSelectOne error [${table}]:`, error.message);
    return { data, error };
  } catch (err) {
    console.error(`dbSelectOne threw [${table}]:`, err.message);
    return { data: null, error: err };
  }
}

async function dbUpdate(table, id, updates) {
  if (useInMemory) {
    const idx = (memStore[table] || []).findIndex(r => r.id === id);
    if (idx >= 0) {
      memStore[table][idx] = { ...memStore[table][idx], ...updates, updated_at: new Date().toISOString() };
      return { data: memStore[table][idx], error: null };
    }
    return { data: null, error: 'Not found' };
  }
  try {
    const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single();
    if (error) console.error(`dbUpdate error [${table}]:`, error.message);
    return { data, error };
  } catch (err) {
    console.error(`dbUpdate threw [${table}]:`, err.message);
    return { data: null, error: err };
  }
}

async function dbDelete(table, id) {
  if (useInMemory) {
    const idx = (memStore[table] || []).findIndex(r => r.id === id);
    if (idx >= 0) {
      const [deleted] = memStore[table].splice(idx, 1);
      return { data: deleted, error: null };
    }
    return { data: null, error: 'Not found' };
  }
  try {
    const { data, error } = await supabase.from(table).delete().eq('id', id).select().single();
    if (error) console.error(`dbDelete error [${table}]:`, error.message);
    return { data, error };
  } catch (err) {
    console.error(`dbDelete threw [${table}]:`, err.message);
    return { data: null, error: err };
  }
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
  try {
    const { data: all, error } = await supabase.from('applicants').select('status, created_at, program');
    if (error) throw error;
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: all?.length || 0,
      completed: all?.filter(a => a.status === 'completed').length || 0,
      today: all?.filter(a => a.created_at?.startsWith(today)).length || 0,
      programs: [...new Set(all?.map(a => a.program) || [])].length
    };
  } catch (err) {
    console.error('dbGetStats error:', err.message);
    return { total: 0, completed: 0, today: 0, programs: 0 };
  }
}

function seedDemoData() {
  if (!useInMemory || memStore.applicants.length > 0) return;
  const { v4: uuidv4 } = require('uuid');

  const demos = [
    { id: uuidv4(), full_name: 'Maria Clara Santos', email: 'maria@email.com', program: 'BS Computer Science', senior_high_school: 'Pasig City National HS', strand: 'STEM', status: 'completed', created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: uuidv4(), full_name: 'Juan Miguel dela Cruz', email: 'juan@email.com', program: 'BS Nursing', senior_high_school: 'Marikina Science HS', strand: 'STEM', status: 'completed', created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: uuidv4(), full_name: 'Ana Gabrielle Reyes', email: 'ana@email.com', program: 'BS Business Administration', senior_high_school: 'QC Science HS', strand: 'ABM', status: 'completed', created_at: new Date(Date.now() - 1800000).toISOString() }
  ];

  const sampleAnswers = [
    ["I'm Maria, a passionate tech enthusiast.", "I've always been drawn to how technology transforms communities.", "I'm detail-oriented and a quick learner.", "I break challenges into smaller tasks.", "I plan to join a software company then launch a startup."],
    ["Hi! I'm Juan, passionate about healthcare.", "Nursing lets me make a direct impact every day.", "I'm empathetic and calm under pressure.", "I stay focused and prioritize patient safety.", "I plan to specialize in ICU care."],
    ["I'm Ana, student council president from QC.", "Business Administration aligns with my family business goal.", "I'm a natural leader and strong communicator.", "I create action plans and stay positive.", "I aim to earn an MBA then expand our family business."]
  ];

  const questions = ['Tell us about yourself', 'Why did you choose this program?', 'What are your strengths as a student?', 'How do you handle academic challenges?', 'What are your goals after graduating?'];
  const questionTexts = ["Can you tell us about yourself?", "Why did you choose this program?", "What are your key strengths?", "How do you handle academic challenges?", "What are your long-term goals?"];

  demos.forEach((applicant, ai) => {
    memStore.applicants.push(applicant);
    const interview = { id: uuidv4(), applicant_id: applicant.id, started_at: applicant.created_at, completed_at: new Date(new Date(applicant.created_at).getTime() + 900000).toISOString(), questions_answered: 5, total_questions: 5, status: 'completed', created_at: applicant.created_at };
    memStore.interviews.push(interview);
    questions.forEach((label, qi) => {
      memStore.responses.push({ id: uuidv4(), interview_id: interview.id, applicant_id: applicant.id, question_index: qi, question_label: label, question_text: questionTexts[qi], answer_text: sampleAnswers[ai][qi], input_method: qi % 2 === 0 ? 'typed' : 'voice', word_count: sampleAnswers[ai][qi].split(' ').length, answered_at: new Date(new Date(applicant.created_at).getTime() + qi * 180000).toISOString() });
    });
    ['PSA Birth Certificate', 'Form 138 (Report Card)', 'Good Moral Certificate'].forEach(docName => {
      memStore.documents.push({ id: uuidv4(), applicant_id: applicant.id, document_type: docName.toLowerCase().replace(/\s+/g, '_'), document_label: docName, captured_at: applicant.created_at });
    });
  });
}

function getClient() { return supabase; }

module.exports = {
  initSupabase, dbInsert, dbSelect, dbSelectOne,
  dbUpdate, dbDelete, dbGetStats, seedDemoData,
  getClient, getMemStore: () => memStore, isInMemory: () => useInMemory
};