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
-- FALLBACK QUESTIONS TABLE
-- Admin-managed fallback interview questions
-- ============================================================
CREATE TABLE IF NOT EXISTS fallback_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_index INTEGER NOT NULL,
  label VARCHAR(255) NOT NULL,
  text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_fallback_questions_index UNIQUE (question_index)
);

-- ============================================================
-- SYSTEM FAILURES TABLE
-- Error/failure tracking for maintenance history
-- ============================================================
CREATE TABLE IF NOT EXISTS system_failures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  component VARCHAR(100) NOT NULL,
  category VARCHAR(100) DEFAULT 'runtime',
  severity VARCHAR(20) DEFAULT 'error',
  message TEXT NOT NULL,
  metadata JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- APPLICANT HELP CONTENT TABLE
-- Admin-managed visual guides and instructions per kiosk screen
-- ============================================================
CREATE TABLE IF NOT EXISTS applicant_help_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  screen_key VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  short_intro TEXT,
  steps JSONB DEFAULT '[]'::jsonb,
  visual_guide TEXT,
  tips JSONB DEFAULT '[]'::jsonb,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_fallback_questions_order ON fallback_questions(question_index ASC);
CREATE INDEX IF NOT EXISTS idx_system_failures_created ON system_failures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_failures_component ON system_failures(component);
CREATE INDEX IF NOT EXISTS idx_help_content_screen ON applicant_help_content(screen_key, is_active, display_order);

-- ============================================================
-- SEED: Default admin user (password: kioskonnekt2025)
-- In production, use bcrypt hash — this is a prototype placeholder
-- ============================================================
INSERT INTO admin_users (username, password_hash, full_name, role)
VALUES ('admin', 'kioskonnekt2025', 'System Administrator', 'superadmin')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- SEED: Default fallback interview questions
-- ============================================================
INSERT INTO fallback_questions (question_index, label, text)
VALUES
  (0, 'Tell us about yourself', 'Hi, I''m KiosKonnekt, and I''ll guide you through your interview today. Let''s begin with something simple. Tell me a little about yourself, including your background, your interests, and what makes you unique.'),
  (1, 'Why this program?', 'Thank you. I''d love to hear more about your academic direction. What made you choose this program at our university, and what about this field feels right for you?'),
  (2, 'Your strengths as a student', 'That helps a lot. Every student brings different strengths into the classroom. What qualities, habits, or skills help you do your best as a learner?'),
  (3, 'Handling challenges', 'Let''s talk about resilience for a moment. When school becomes difficult or something does not go as planned, how do you usually respond and move forward?'),
  (4, 'Goals after graduation', 'You''re doing well, and this is the last question. Looking ahead, what kind of future are you working toward after graduation, and where would you like to be in the next five to ten years?')
ON CONFLICT (question_index) DO NOTHING;

-- ============================================================
-- SEED: Applicant-facing help content (REQ-4)
-- ============================================================
INSERT INTO applicant_help_content (screen_key, title, short_intro, steps, visual_guide, tips, display_order, is_active)
VALUES
  (
    'welcome',
    'Welcome to KiosKonnekt',
    'This kiosk will guide you step by step from profile registration to final submission.',
    '["Tap Begin Interview to start.","Fill in your profile details carefully.","Scan your required documents in order.","Answer the interview questions honestly.","Review then submit your application."]'::jsonb,
    'Follow the top progress steps: Profile -> Documents -> Interview -> Summary.',
    '["You can use the Help button on every screen.","Take your time; there is no need to rush."]'::jsonb,
    0,
    TRUE
  ),
  (
    'profile',
    'Profile Information Help',
    'Enter your basic details exactly as they appear on your records.',
    '["Type your full legal name.","Choose your intended program.","Provide your senior high school details.","Add a working contact number and email.","Press Continue to move to documents."]'::jsonb,
    'Check for red error text before continuing. Fields marked required must be filled.',
    '["Double-check spelling of your name and email.","Ask staff for help if you are unsure about school details."]'::jsonb,
    0,
    TRUE
  ),
  (
    'scan',
    'Document Scanning Help',
    'Scan your documents clearly so admissions can review them quickly.',
    '["Select a document from the list.","Place document flat in the camera frame.","Keep lighting bright and avoid glare.","Press Capture and verify the preview.","Repeat until all required documents are marked done."]'::jsonb,
    'Use the checklist order from 1 to 8. Green check status means document captured.',
    '["Hold documents steady for a clearer image.","Retake blurred images before continuing."]'::jsonb,
    0,
    TRUE
  ),
  (
    'interview',
    'AI Interview Help',
    'Answer each question clearly using voice or typing.',
    '["Read or listen to the question.","Answer in complete, honest sentences.","Use voice recording or type your answer.","Submit to move to the next question.","Finish all questions to proceed."]'::jsonb,
    'The assistant orb indicates speaking/listening states. Wait for prompts before responding.',
    '["Speak at a normal pace.","If voice does not work, use typed response."]'::jsonb,
    0,
    TRUE
  ),
  (
    'summary',
    'Application Summary Help',
    'Review all information before final submission.',
    '["Check applicant profile details.","Confirm your documents are listed.","Review interview responses.","Use edit actions if needed.","Submit once all details are correct."]'::jsonb,
    'After submission, edits are restricted. Verify details carefully before final submit.',
    '["Take a moment to review every section.","Contact admin immediately if you submitted incorrect data."]'::jsonb,
    0,
    TRUE
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: Sample applicants for demo
-- ============================================================
INSERT INTO applicants (full_name, email, program, senior_high_school, strand, status)
VALUES
  ('Maria Clara Santos', 'maria.santos@email.com', 'BS Computer Science', 'Pasig City National High School', 'STEM', 'completed'),
  ('Juan Miguel dela Cruz', 'juan.delacruz@email.com', 'BS Nursing', 'Marikina Science High School', 'STEM', 'completed'),
  ('Ana Gabrielle Reyes', 'ana.reyes@email.com', 'BS Business Administration', 'Quezon City Science HS', 'ABM', 'completed')
ON CONFLICT DO NOTHING;

-- View to get full applicant summary
CREATE OR REPLACE VIEW applicant_summary AS
SELECT
  a.id,
  a.full_name,
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
