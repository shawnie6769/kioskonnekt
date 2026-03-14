// backend/server.js — KiosKonnekt Main Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');

const { initSupabase, seedDemoData } = require('./db/supabase');
const applicantsRouter = require('./routes/applicants');
const interviewsRouter = require('./routes/interviews');
const documentsRouter = require('./routes/documents');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Relaxed helmet for prototype (allows inline scripts/styles for Tailwind)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// ── API Routes ───────────────────────────────────────────────
app.use('/api/applicants', applicantsRouter);
app.use('/api/interviews', interviewsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// ── Serve frontend pages ─────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/welcome.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/profile.html')));
app.get('/scan', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/scan.html')));
app.get('/interview', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/interview.html')));
app.get('/summary', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/summary.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/admin.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/admin-login.html')));

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Start ────────────────────────────────────────────────────
initSupabase();
seedDemoData();

app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║   KiosKonnekt Server v2.0             ║`);
  console.log(`║   Running at http://localhost:${PORT}     ║`);
  console.log(`║   Admin: http://localhost:${PORT}/admin   ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
});

module.exports = app;
