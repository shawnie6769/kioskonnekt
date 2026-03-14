# KiosKonnekt v2.0
### AI-Powered University Admissions Kiosk System

A full-stack, touchscreen-optimized kiosk application for conducting structured AI-guided admissions interviews for incoming university freshmen.

---

## 🗂 Project Structure

```
kioskonnekt/
├── backend/
│   ├── server.js              # Express main server
│   ├── routes/
│   │   ├── applicants.js      # Applicant CRUD API
│   │   ├── interviews.js      # Interview + responses API
│   │   ├── documents.js       # Document upload API
│   │   └── admin.js           # Admin dashboard API
│   └── db/
│       ├── supabase.js        # DB client + in-memory fallback
│       └── schema.sql         # PostgreSQL schema for Supabase
├── frontend/
│   ├── pages/
│   │   ├── welcome.html       # Step 0: Welcome screen
│   │   ├── profile.html       # Step 1: Applicant profile form
│   │   ├── scan.html          # Step 2: Document scanning
│   │   ├── interview.html     # Step 3: AI chat interview
│   │   ├── summary.html       # Step 4: Review & submit
│   │   ├── admin-login.html   # Admin login
│   │   └── admin.html         # Admin dashboard
│   ├── css/
│   │   └── kiosk.css          # Shared design system
│   └── js/
│       └── app.js             # Shared utilities, API client, TTS/STT
├── public/
│   └── uploads/               # Uploaded document images
├── .env.example               # Environment config template
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
cd kioskonnekt
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — for a quick demo, **no changes needed** (uses in-memory storage automatically).

### 3. Start the server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 4. Open in browser

```
http://localhost:3000          → Kiosk (Welcome screen)
http://localhost:3000/admin    → Admin Dashboard
```

---

## 🗄 Database Setup (Supabase)

To use real PostgreSQL persistence:

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → run the contents of `backend/db/schema.sql`
3. Copy your project URL and keys from **Settings → API**
4. Update `.env`:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-key
   ```
5. Restart the server

> **Without Supabase configured**, the app runs in **in-memory mode** — all data is stored in RAM and resets on server restart. Perfect for demos.

---

## 🔐 Admin Access

| Field    | Value              |
|----------|--------------------|
| URL      | `/admin/login`     |
| Username | `admin`            |
| Password | `kioskonnekt2025`  |

Change credentials in `.env`:
```
ADMIN_USERNAME=your_username
ADMIN_PASSWORD=your_secure_password
```

---

## 🎤 Speech Features

| Feature       | Technology         | Browser Support        |
|---------------|--------------------|------------------------|
| Text-to-Speech| Web Speech API     | Chrome, Edge, Safari   |
| Speech-to-Text| Web Speech API     | Chrome, Edge           |

> For best voice experience, use **Google Chrome** or **Microsoft Edge**.
> Firefox has limited Web Speech API support.

---

## 📷 Camera / Document Scanning

- Uses `navigator.mediaDevices.getUserMedia()` for webcam access
- Falls back to **Demo Mode** (simulated capture) if camera is unavailable
- Captured images saved as base64 in the database
- OCR detection is simulated (shows "Document Detected" overlay)

---

## 🌐 API Endpoints

### Applicants
| Method | Path                      | Description              |
|--------|---------------------------|--------------------------|
| GET    | `/api/applicants`         | List all applicants      |
| POST   | `/api/applicants`         | Create new applicant     |
| GET    | `/api/applicants/:id`     | Get applicant detail     |
| PATCH  | `/api/applicants/:id/status` | Update status         |

### Interviews
| Method | Path                              | Description              |
|--------|-----------------------------------|--------------------------|
| POST   | `/api/interviews`                 | Start interview session  |
| PATCH  | `/api/interviews/:id/complete`    | Mark complete            |
| POST   | `/api/interviews/:id/responses`   | Save a response          |
| GET    | `/api/interviews/:id/responses`   | Get all responses        |

### Documents
| Method | Path                          | Description              |
|--------|-------------------------------|--------------------------|
| POST   | `/api/documents`              | Save document image      |
| GET    | `/api/documents/:applicant_id`| Get applicant documents  |

### Admin
| Method | Path                          | Description              |
|--------|-------------------------------|--------------------------|
| POST   | `/api/admin/login`            | Admin authentication     |
| GET    | `/api/admin/stats`            | Dashboard statistics     |
| GET    | `/api/admin/applicants`       | All applicants (enriched)|
| GET    | `/api/admin/applicants/:id`   | Full applicant detail    |

---

## 📱 Kiosk Workflow

```
Welcome → Profile Form → Document Scan → AI Interview → Summary → Submit
   ↓            ↓               ↓              ↓            ↓
  /           /profile         /scan        /interview    /summary
```

---

## 🤖 AI Interview Questions

The interview module uses 5 structured questions:

1. **Tell us about yourself** — Background, interests, uniqueness
2. **Why this program?** — Academic goals and motivation
3. **Your strengths as a student** — Skills, habits, qualities
4. **Handling challenges** — Strategies for academic difficulty
5. **Goals after graduation** — Long-term vision and aspirations

> To integrate real AI responses, add your `OPENAI_API_KEY` to `.env` and extend `backend/routes/interviews.js` to call the OpenAI Chat API for dynamic follow-up questions.

---

## 🎨 Design System

Built on a custom dark-theme design system with:
- **Font**: Outfit (display) + Space Mono (monospace)
- **Primary**: `#2563EB` (Blue)
- **Accent**: `#0EA5E9` (Teal)  
- **Background**: `#04080F` (Deep navy)
- All components in `frontend/css/kiosk.css`

---

## 📦 Tech Stack

| Layer      | Technology                      |
|------------|---------------------------------|
| Frontend   | HTML5, TailwindCSS, Vanilla JS  |
| Backend    | Node.js + Express               |
| Database   | Supabase (PostgreSQL) / In-memory |
| Speech     | Web Speech API (TTS + STT)      |
| Camera     | MediaDevices API                |
| Fonts      | Google Fonts (Outfit, Space Mono)|

---

## 🔧 Production Notes

- Replace in-memory store with Supabase for persistence
- Add HTTPS / SSL for camera API access in production
- Implement proper password hashing (bcrypt) for admin users
- Add session tokens / JWT for admin authentication
- Consider adding a printer API for interview confirmation slips
- Enable kiosk mode in browser: `--kiosk` flag in Chrome

---

*KiosKonnekt v2.0 — Built for University Admissions Centers*
