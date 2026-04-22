// backend/db/supabase.js
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

let supabase = null;
let localPool = null;
let useInMemory = false;
let cloudEnabled = false;
let localEnabled = false;

const memStore = {
  applicants: [],
  interviews: [],
  responses: [],
  documents: [],
  schools: [],
  admin_users: [
    { id: '1', username: 'admin', password_hash: 'kioskonnekt2025', full_name: 'System Administrator', role: 'superadmin' }
  ]
};

const SUPPORTED_TABLES = new Set(['applicants', 'admin_users', 'interviews', 'responses', 'documents', 'schools']);

function isValidIdentifier(identifier) {
  return /^[a-z_][a-z0-9_]*$/i.test(identifier);
}

function sanitizeTable(table) {
  if (!SUPPORTED_TABLES.has(table)) {
    throw new Error(`Unsupported table: ${table}`);
  }
  return table;
}

function buildWhereClause(filters = {}, startAt = 1) {
  const entries = Object.entries(filters || {});
  if (entries.length === 0) return { clause: '', values: [] };

  const values = [];
  const parts = entries.map(([key, val], index) => {
    if (!isValidIdentifier(key)) throw new Error(`Invalid column name: ${key}`);
    values.push(val);
    return `${key} = $${startAt + index}`;
  });

  return { clause: ` WHERE ${parts.join(' AND ')}`, values };
}

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  useInMemory = false;

  cloudEnabled = Boolean(url && !url.includes('your-project-id') && key && !key.includes('your-'));
  if (cloudEnabled) {
    try {
      supabase = createClient(url, key);
      console.log('✅ Supabase configured');
    } catch (err) {
      cloudEnabled = false;
      supabase = null;
      console.log('⚠️  Supabase client init failed:', err.message);
    }
  } else {
    console.log('⚠️  Supabase not configured');
  }

  const dbHost = process.env.DB_HOST;
  const dbName = process.env.DB_NAME;
  const dbUser = process.env.DB_USER;

  localEnabled = Boolean(dbHost && dbName && dbUser);
  if (localEnabled) {
    try {
      localPool = new Pool({
        user: dbUser,
        host: dbHost,
        database: dbName,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT || 5432),
        connectionTimeoutMillis: 3000
      });

      localPool.query('SELECT 1')
        .then(() => console.log('✅ Local PostgreSQL connected'))
        .catch((err) => console.log('⚠️  Local PostgreSQL ping failed:', err.message));
    } catch (err) {
      localEnabled = false;
      localPool = null;
      console.log('⚠️  Local PostgreSQL init failed:', err.message);
    }
  } else {
    console.log('⚠️  Local PostgreSQL not configured');
  }

  if (!localEnabled && !cloudEnabled) {
    console.log('⚠️  No database configured — using in-memory storage (prototype mode)');
    useInMemory = true;
  }

  return { supabase, localPool };
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
  const safeTable = sanitizeTable(table);
  const payload = { id: data?.id || uuidv4(), ...data };

  if (localEnabled && localPool) {
    try {
      const keys = Object.keys(payload);
      keys.forEach((key) => {
        if (!isValidIdentifier(key)) throw new Error(`Invalid column name: ${key}`);
      });

      const columns = keys.join(', ');
      const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
      const values = keys.map((key) => payload[key]);

      const result = await localPool.query(
        `INSERT INTO ${safeTable} (${columns}) VALUES (${placeholders}) RETURNING *`,
        values
      );

      if (cloudEnabled && supabase) {
        supabase.from(safeTable).insert(payload)
          .then(({ error }) => {
            if (error) console.error(`cloud mirror insert error [${safeTable}]:`, error.message);
          })
          .catch((err) => console.error(`cloud mirror insert threw [${safeTable}]:`, err.message));
      }

      return { data: result.rows[0], error: null };
    } catch (err) {
      console.error(`local dbInsert error [${safeTable}]:`, err.message);
    }
  }

  if (cloudEnabled && supabase) {
    try {
      const { data: result, error } = await supabase.from(safeTable).insert(payload).select().single();
      if (error) console.error(`dbInsert error [${safeTable}]:`, error.message);
      return { data: result, error };
    } catch (err) {
      console.error(`dbInsert threw [${safeTable}]:`, err.message);
      return { data: null, error: err };
    }
  }

  if (useInMemory) {
    const record = { id: uuidv4(), ...data, created_at: new Date().toISOString() };
    memStore[table].push(record);
    return { data: record, error: null };
  }

  return { data: null, error: new Error('No active database connection') };
}

async function dbSelect(table, filters = {}) {
  const safeTable = sanitizeTable(table);
  const orderCol = TABLE_ORDER_COLS[safeTable] || 'created_at';
  const orderDir = orderCol === 'name' ? 'ASC' : 'DESC';

  if (localEnabled && localPool) {
    try {
      if (!isValidIdentifier(orderCol)) throw new Error(`Invalid order column: ${orderCol}`);
      const { clause, values } = buildWhereClause(filters);
      const result = await localPool.query(
        `SELECT * FROM ${safeTable}${clause} ORDER BY ${orderCol} ${orderDir}`,
        values
      );
      return { data: result.rows || [], error: null };
    } catch (err) {
      console.error(`local dbSelect error [${safeTable}]:`, err.message);
    }
  }

  if (cloudEnabled && supabase) {
    try {
      let query = supabase.from(safeTable).select('*');
      Object.entries(filters).forEach(([key, val]) => {
        query = query.eq(key, val);
      });
      const { data, error } = await query.order(orderCol, { ascending: orderDir === 'ASC' });
      if (error) console.error(`dbSelect error [${safeTable}]:`, error.message);
      return { data: data || [], error };
    } catch (err) {
      console.error(`dbSelect threw [${safeTable}]:`, err.message);
      return { data: [], error: err };
    }
  }

  if (useInMemory) {
    let results = [...(memStore[table] || [])];
    Object.entries(filters).forEach(([key, val]) => {
      results = results.filter(r => r[key] === val);
    });
    return { data: results, error: null };
  }

  return { data: [], error: new Error('No active database connection') };
}

async function dbSelectOne(table, id) {
  const safeTable = sanitizeTable(table);

  if (localEnabled && localPool) {
    try {
      const result = await localPool.query(`SELECT * FROM ${safeTable} WHERE id = $1 LIMIT 1`, [id]);
      return { data: result.rows[0] || null, error: result.rows[0] ? null : 'Not found' };
    } catch (err) {
      console.error(`local dbSelectOne error [${safeTable}]:`, err.message);
    }
  }

  if (cloudEnabled && supabase) {
    try {
      const { data, error } = await supabase.from(safeTable).select('*').eq('id', id).single();
      if (error) console.error(`dbSelectOne error [${safeTable}]:`, error.message);
      return { data, error };
    } catch (err) {
      console.error(`dbSelectOne threw [${safeTable}]:`, err.message);
      return { data: null, error: err };
    }
  }

  if (useInMemory) {
    const record = (memStore[table] || []).find(r => r.id === id);
    return { data: record || null, error: record ? null : 'Not found' };
  }

  return { data: null, error: new Error('No active database connection') };
}

async function dbUpdate(table, id, updates) {
  const safeTable = sanitizeTable(table);

  if (localEnabled && localPool) {
    try {
      const keys = Object.keys(updates || {});
      if (keys.length === 0) return { data: null, error: 'No updates provided' };

      keys.forEach((key) => {
        if (!isValidIdentifier(key)) throw new Error(`Invalid column name: ${key}`);
      });

      const setClause = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
      const values = keys.map((key) => updates[key]);
      values.push(id);

      const result = await localPool.query(
        `UPDATE ${safeTable} SET ${setClause} WHERE id = $${values.length} RETURNING *`,
        values
      );

      if (cloudEnabled && supabase) {
        supabase.from(safeTable).update(updates).eq('id', id)
          .then(({ error }) => {
            if (error) console.error(`cloud mirror update error [${safeTable}]:`, error.message);
          })
          .catch((err) => console.error(`cloud mirror update threw [${safeTable}]:`, err.message));
      }

      return {
        data: result.rows[0] || null,
        error: result.rows[0] ? null : 'Not found'
      };
    } catch (err) {
      console.error(`local dbUpdate error [${safeTable}]:`, err.message);
    }
  }

  if (cloudEnabled && supabase) {
    try {
      const { data, error } = await supabase.from(safeTable).update(updates).eq('id', id).select().single();
      if (error) console.error(`dbUpdate error [${safeTable}]:`, error.message);
      return { data, error };
    } catch (err) {
      console.error(`dbUpdate threw [${safeTable}]:`, err.message);
      return { data: null, error: err };
    }
  }

  if (useInMemory) {
    const idx = (memStore[table] || []).findIndex(r => r.id === id);
    if (idx >= 0) {
      memStore[table][idx] = { ...memStore[table][idx], ...updates, updated_at: new Date().toISOString() };
      return { data: memStore[table][idx], error: null };
    }
    return { data: null, error: 'Not found' };
  }

  return { data: null, error: new Error('No active database connection') };
}

async function dbDelete(table, id) {
  const safeTable = sanitizeTable(table);

  if (localEnabled && localPool) {
    try {
      const result = await localPool.query(`DELETE FROM ${safeTable} WHERE id = $1 RETURNING *`, [id]);

      if (cloudEnabled && supabase) {
        supabase.from(safeTable).delete().eq('id', id)
          .then(({ error }) => {
            if (error) console.error(`cloud mirror delete error [${safeTable}]:`, error.message);
          })
          .catch((err) => console.error(`cloud mirror delete threw [${safeTable}]:`, err.message));
      }

      return {
        data: result.rows[0] || null,
        error: result.rows[0] ? null : 'Not found'
      };
    } catch (err) {
      console.error(`local dbDelete error [${safeTable}]:`, err.message);
    }
  }

  if (cloudEnabled && supabase) {
    try {
      const { data, error } = await supabase.from(safeTable).delete().eq('id', id).select().single();
      if (error) console.error(`dbDelete error [${safeTable}]:`, error.message);
      return { data, error };
    } catch (err) {
      console.error(`dbDelete threw [${safeTable}]:`, err.message);
      return { data: null, error: err };
    }
  }

  if (useInMemory) {
    const idx = (memStore[table] || []).findIndex(r => r.id === id);
    if (idx >= 0) {
      const [deleted] = memStore[table].splice(idx, 1);
      return { data: deleted, error: null };
    }
    return { data: null, error: 'Not found' };
  }

  return { data: null, error: new Error('No active database connection') };
}

async function dbGetStats() {
  if (localEnabled && localPool) {
    try {
      const result = await localPool.query('SELECT status, created_at, program FROM applicants');
      const all = result.rows || [];
      const today = new Date().toISOString().slice(0, 10);
      return {
        total: all.length,
        completed: all.filter(a => a.status === 'completed').length,
        today: all.filter(a => a.created_at && String(a.created_at).startsWith(today)).length,
        programs: [...new Set(all.map(a => a.program).filter(Boolean))].length
      };
    } catch (err) {
      console.error('local dbGetStats error:', err.message);
    }
  }

  if (cloudEnabled && supabase) {
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

  if (useInMemory) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: memStore.applicants.length,
      completed: memStore.applicants.filter(a => a.status === 'completed').length,
      today: memStore.applicants.filter(a => a.created_at && a.created_at.startsWith(today)).length,
      programs: [...new Set(memStore.applicants.map(a => a.program))].length
    };
  }
  return { total: 0, completed: 0, today: 0, programs: 0 };
}

async function dbSearchSchools(query, limit = 8) {
  const q = String(query || '').trim();
  if (!q) return { data: [], error: null };

  if (localEnabled && localPool) {
    try {
      const result = await localPool.query(
        'SELECT id, name, city, region, type FROM schools WHERE name ILIKE $1 ORDER BY name ASC LIMIT $2',
        [`%${q}%`, limit]
      );
      return { data: result.rows || [], error: null };
    } catch (err) {
      if (!/relation .*schools.* does not exist/i.test(err.message)) {
        console.error('local dbSearchSchools error:', err.message);
      }
    }
  }

  if (cloudEnabled && supabase) {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name, city, region, type')
        .ilike('name', `%${q}%`)
        .order('name', { ascending: true })
        .limit(limit);

      if (error) return { data: [], error };
      return { data: data || [], error: null };
    } catch (err) {
      return { data: [], error: err };
    }
  }

  return { data: [], error: null };
}

function seedDemoData() {
  if (!useInMemory || memStore.applicants.length > 0) return;

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
function getLocalClient() { return localPool; }

module.exports = {
  initSupabase, dbInsert, dbSelect, dbSelectOne,
  dbUpdate, dbDelete, dbGetStats, seedDemoData,
  dbSearchSchools, getClient, getLocalClient,
  getMemStore: () => memStore,
  isInMemory: () => useInMemory,
  isLocalEnabled: () => localEnabled
};