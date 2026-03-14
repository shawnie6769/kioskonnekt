-- ============================================================
-- KiosKonnekt Database Schema
-- Run this in your Supabase SQL Editor to set up all tables
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- APPLICANTS TABLE
-- Stores all applicant profile information
-- ============================================================
CREATE TABLE IF NOT EXISTS applicants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  application_number VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  program VARCHAR(255) NOT NULL,
  senior_high_school VARCHAR(255) NOT NULL,
  strand VARCHAR(100),
  contact_number VARCHAR(20),
  status VARCHAR(50) DEFAULT 'in_progress',  -- in_progress | completed | submitted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INTERVIEWS TABLE
-- One interview session per applicant
-- ============================================================
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  total_questions INTEGER DEFAULT 5,
  questions_answered INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'in_progress',  -- in_progress | completed
  ai_model VARCHAR(100) DEFAULT 'rule-based',
  session_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RESPONSES TABLE
-- Each question-answer pair for an interview
-- ============================================================
CREATE TABLE IF NOT EXISTS responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question_label VARCHAR(255) NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  input_method VARCHAR(50) DEFAULT 'typed',  -- typed | voice
  word_count INTEGER DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS TABLE
-- Scanned document metadata and base64 image data
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,  -- psa_birth_cert | form_138 | good_moral
  document_label VARCHAR(255) NOT NULL,
  file_path VARCHAR(500),
  image_data TEXT,  -- base64 encoded image for prototype
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  ocr_simulated BOOLEAN DEFAULT TRUE,
  verified BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- ADMIN USERS TABLE
-- Admin portal credentials
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'viewer',  -- viewer | editor | superadmin
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants(status);
CREATE INDEX IF NOT EXISTS idx_applicants_created ON applicants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interviews_applicant ON interviews(applicant_id);
CREATE INDEX IF NOT EXISTS idx_responses_interview ON responses(interview_id);
CREATE INDEX IF NOT EXISTS idx_responses_applicant ON responses(applicant_id);
CREATE INDEX IF NOT EXISTS idx_documents_applicant ON documents(applicant_id);

-- ============================================================
-- SEED: Default admin user (password: kioskonnekt2025)
-- In production, use bcrypt hash — this is a prototype placeholder
-- ============================================================
INSERT INTO admin_users (username, password_hash, full_name, role)
VALUES ('admin', 'kioskonnekt2025', 'System Administrator', 'superadmin')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- SEED: Sample applicants for demo
-- ============================================================
INSERT INTO applicants (full_name, application_number, email, program, senior_high_school, strand, status)
VALUES
  ('Maria Clara Santos', 'APP-2025-0001', 'maria.santos@email.com', 'BS Computer Science', 'Pasig City National High School', 'STEM', 'completed'),
  ('Juan Miguel dela Cruz', 'APP-2025-0002', 'juan.delacruz@email.com', 'BS Nursing', 'Marikina Science High School', 'STEM', 'completed'),
  ('Ana Gabrielle Reyes', 'APP-2025-0003', 'ana.reyes@email.com', 'BS Business Administration', 'Quezon City Science HS', 'ABM', 'completed')
ON CONFLICT (application_number) DO NOTHING;

-- View to get full applicant summary
CREATE OR REPLACE VIEW applicant_summary AS
SELECT
  a.id,
  a.full_name,
  a.application_number,
  a.email,
  a.program,
  a.senior_high_school,
  a.status,
  a.created_at,
  i.id AS interview_id,
  i.status AS interview_status,
  i.completed_at,
  i.questions_answered,
  COUNT(DISTINCT r.id) AS response_count,
  COUNT(DISTINCT d.id) AS document_count
FROM applicants a
LEFT JOIN interviews i ON i.applicant_id = a.id
LEFT JOIN responses r ON r.applicant_id = a.id
LEFT JOIN documents d ON d.applicant_id = a.id
GROUP BY a.id, i.id;
