// frontend/js/app.js — Shared utilities, API client, session management

// ── Session storage keys ──────────────────────────────────────
const SESSION = {
  APPLICANT: 'kk_applicant',
  INTERVIEW: 'kk_interview',
  RESPONSES: 'kk_responses',
  DOCUMENTS: 'kk_documents',
  STEP: 'kk_step',
  VOICE_LANGUAGE: 'kk_voice_language',
  VOICE_NAME: 'kk_voice_name'
};

// ── API client ────────────────────────────────────────────────
const API = {
  BASE: window.location.origin + '/api',

  async post(path, body) {
    const r = await fetch(this.BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return r.json();
  },

  async get(path) {
    const r = await fetch(this.BASE + path);
    return r.json();
  },

  async patch(path, body) {
    const r = await fetch(this.BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return r.json();
  }
};

// ── Session helpers ───────────────────────────────────────────
const Session = {
  set(key, value) { sessionStorage.setItem(key, JSON.stringify(value)); },
  get(key) {
    try { return JSON.parse(sessionStorage.getItem(key)); }
    catch { return null; }
  },
  clear() { Object.values(SESSION).forEach(k => sessionStorage.removeItem(k)); }
};

// ── Navigation ────────────────────────────────────────────────
function navigateTo(path) {
  window.location.href = path;
}

function confirmCancel() {
  document.getElementById('modal-cancel')?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

async function cancelSession() {
  Session.clear();
  navigateTo('/');
}

// ── Time + clock ──────────────────────────────────────────────
function startClock(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const update = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      + ' · ' + now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };
  update();
  setInterval(update, 1000);
}

// ── Theme Management ──────────────────────────────────────────
const ThemeManager = {
  STORAGE_KEY: 'kk_theme',
  DEFAULT_THEME: 'dark',

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY) || this.DEFAULT_THEME;
    this.setTheme(saved);
  },

  setTheme(theme) {
    const validTheme = ['light', 'dark'].includes(theme) ? theme : this.DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', validTheme);
    localStorage.setItem(this.STORAGE_KEY, validTheme);
    this.updateToggleButton(validTheme);
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme') || this.DEFAULT_THEME;
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  },

  updateToggleButton(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }
};

function toggleTheme() {
  ThemeManager.toggle();
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
});

// ── TTS ───────────────────────────────────────────────────────
// Only expose English and Filipino (Tagalog)
const VOICE_LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English' },
  { value: 'fil-PH', label: 'Filipino (Tagalog)' }
];

const SpeechSettings = {
  defaultLocale: 'en-US',

  normalizeLocale(locale) {
    return String(locale || this.defaultLocale).replace('_', '-');
  },

  getLocale() {
    return this.normalizeLocale(Session.get(SESSION.VOICE_LANGUAGE) || this.defaultLocale);
  },

  setLocale(locale) {
    const normalized = this.normalizeLocale(locale);
    Session.set(SESSION.VOICE_LANGUAGE, normalized);
    Session.set(SESSION.VOICE_NAME, 'auto');
    window.dispatchEvent(new CustomEvent('kk:voice-language-change', {
      detail: {
        locale: normalized,
        label: this.getLabel(normalized)
      }
    }));
    return normalized;
  },

  getLabel(locale = this.getLocale()) {
    const normalized = this.normalizeLocale(locale);
    return VOICE_LANGUAGE_OPTIONS.find(option => option.value.toLowerCase() === normalized.toLowerCase())?.label || normalized;
  },

  getOptions() {
    // Only return configured language options (English + Filipino)
    return VOICE_LANGUAGE_OPTIONS.slice();
  },

  getVoiceName() {
    return Session.get(SESSION.VOICE_NAME) || 'auto';
  },

  setVoiceName(name) {
    const nextName = name || 'auto';
    Session.set(SESSION.VOICE_NAME, nextName);
    window.dispatchEvent(new CustomEvent('kk:voice-name-change', {
      detail: {
        name: nextName,
        label: this.getVoiceLabel(nextName)
      }
    }));
    return nextName;
  },

  scoreVoice(voice, locale = this.getLocale()) {
    const normalizedLocale = this.normalizeLocale(locale).toLowerCase();
    const voiceLocale = this.normalizeLocale(voice.lang).toLowerCase();
    const primaryLanguage = normalizedLocale.split('-')[0];
    const descriptor = `${voice.name} ${voice.voiceURI || ''}`.toLowerCase();
    let score = 0;

    if (voiceLocale === normalizedLocale) score += 120;
    else if (voiceLocale.startsWith(`${primaryLanguage}-`)) score += 70;

    if (/natural|online|neural|premium|enhanced|studio/i.test(descriptor)) score += 80;
    if (/female|woman|girl|aria|jenny|samantha|zira|ava|allison|sonia|victoria|moira|tessa|hazel/i.test(descriptor)) score += 24;
    if (voice.default) score += 10;
    if (/compact|classic|legacy|desktop/i.test(descriptor)) score -= 12;

    return score;
  },

  getVoicesForLocale(locale = this.getLocale()) {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return [...voices]
      .filter(voice => {
        // Exclude voices with undesirable names (e.g., Wilson)
        if (/wilson/i.test(voice.name || '')) return false;
        const voiceLocale = this.normalizeLocale(voice.lang).toLowerCase();
        const normalizedLocale = this.normalizeLocale(locale).toLowerCase();
        const primaryLanguage = normalizedLocale.split('-')[0];
        return voiceLocale === normalizedLocale || voiceLocale.startsWith(`${primaryLanguage}-`);
      })
      .sort((left, right) => this.scoreVoice(right, locale) - this.scoreVoice(left, locale));
  },

  getVoiceOptions(locale = this.getLocale()) {
    const voices = this.getVoicesForLocale(locale);
    const filteredVoices = voices.filter(voice => {
      if (locale === 'en-US') {
        return /andrewmultilingual|microsoft andrew/i.test(voice.name);
      }
      if (locale === 'fil-PH') {
        return /angelo/i.test(voice.name);
      }
      // For other languages, keep all voices
      return true;
    });
    return [
      { value: 'auto', label: 'Auto Select', quality: 'Best match' },
      ...filteredVoices.map(voice => ({
        value: voice.name,
        label: voice.name,
        quality: /natural|online|neural|premium|enhanced|studio/i.test(`${voice.name} ${voice.voiceURI || ''}`) ? 'Natural' : 'Standard'
      }))
    ];
  },

  getVoiceLabel(name = this.getVoiceName()) {
    if (!name || name === 'auto') return 'Auto Select';
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return voices.find(voice => voice.name === name)?.name || name;
  }
};

const TTS = {
  synth: window.speechSynthesis,
  speaking: false,
  lastText: '',

  emitState(detail) {
    window.dispatchEvent(new CustomEvent('kk:tts-state', { detail }));
  },

  getPreferredVoice(locale = SpeechSettings.getLocale()) {
    const selectedVoiceName = SpeechSettings.getVoiceName();
    const voices = SpeechSettings.getVoicesForLocale(locale);
    if (selectedVoiceName && selectedVoiceName !== 'auto') {
      const explicit = voices.find(voice => voice.name === selectedVoiceName)
        || (this.synth?.getVoices?.() || []).find(voice => voice.name === selectedVoiceName);
      if (explicit) return explicit;
    }

    if (locale === 'en-US') {
      const andrew = voices.find(voice => /andrewmultilingual|microsoft andrew/i.test(voice.name))
        || (this.synth?.getVoices?.() || []).find(voice => /andrewmultilingual|microsoft andrew/i.test(voice.name));
      if (andrew) return andrew;
    }

    if (locale === 'fil-PH') {
      const angelo = voices.find(voice => /angelo/i.test(voice.name))
        || (this.synth?.getVoices?.() || []).find(voice => /angelo/i.test(voice.name));
      if (angelo) return angelo;
    }

    return voices[0] || (this.synth?.getVoices?.() || [])[0] || null;
  },

  speak(text, onEndOrOptions) {
    if (!this.synth || !text) return;
    const options = typeof onEndOrOptions === 'function'
      ? { onEnd: onEndOrOptions }
      : (onEndOrOptions || {});

    this.stop();

    const utt = new SpeechSynthesisUtterance(text);
    const selectedLocale = SpeechSettings.getLocale();
    utt.rate = 0.94;
    utt.pitch = 1.16;
    utt.volume = 0.98;
    utt.lang = selectedLocale;
    this.lastText = text;

    const preferred = this.getPreferredVoice(selectedLocale);
    if (preferred) utt.voice = preferred;

    utt.onstart = () => {
      this.speaking = true;
      this.emitState({ speaking: true, text, voice: preferred?.name || null, locale: selectedLocale });
      options.onStart?.();
    };

    const finish = () => {
      const wasSpeaking = this.speaking;
      this.speaking = false;
      if (wasSpeaking) this.emitState({ speaking: false, text, voice: preferred?.name || null, locale: selectedLocale });
      options.onEnd?.();
    };

    utt.onend = finish;
    utt.onerror = finish;
    this.synth.speak(utt);
  },
  stop() {
    if (this.synth) this.synth.cancel();
    if (this.speaking) {
      this.speaking = false;
      this.emitState({ speaking: false, cancelled: true });
    }
  }
};

// Load voices
window.speechSynthesis?.addEventListener('voiceschanged', () => {});

function getAssistantOrbMarkup(extraClass = '') {
  const cls = ['ai-orb', extraClass].filter(Boolean).join(' ');
  return `
    <div class="${cls}" aria-hidden="true">
      <span class="ai-orb-core"></span>
      <span class="ai-orb-halo"></span>
      <span class="ai-orb-ring ai-orb-ring-a"></span>
      <span class="ai-orb-ring ai-orb-ring-b"></span>
    </div>
  `;
}

// ── STT ───────────────────────────────────────────────────────
const STT = {
  recognition: null,
  isRecording: false,

  start(onResult, onEnd) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = SpeechSettings.getLocale();
    this.recognition.onresult = (e) => {
      let final = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      onResult(final, interim);
    };
    this.recognition.onend = () => { this.isRecording = false; onEnd?.(); };
    this.recognition.onerror = () => { this.isRecording = false; onEnd?.(); };
    this.recognition.start();
    this.isRecording = true;
    return true;
  },

  stop() {
    this.recognition?.stop();
    this.isRecording = false;
  }
};

// ── Format helpers ────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}m ${s}s`;
}

function initSteps(currentStep) {
  const labels = ['Profile', 'Documents', 'Interview', 'Summary'];
  const steps = document.querySelectorAll('.step');
  const lines = document.querySelectorAll('.step-line');
  steps.forEach((s, i) => {
    s.classList.remove('active', 'done', 'pending');
    const num = s.querySelector('.step-num');
    if (i + 1 < currentStep) {
      s.classList.add('done');
      if (num) num.textContent = '✓';
    } else if (i + 1 === currentStep) {
      s.classList.add('active');
      if (num) num.textContent = i + 1;
    } else {
      s.classList.add('pending');
      if (num) num.textContent = i + 1;
    }
  });
  lines.forEach((l, i) => {
    l.classList.toggle('done', i + 1 < currentStep);
  });
}

// Guard: redirect to start if no session
function requireSession() {
  const applicant = Session.get(SESSION.APPLICANT);
  if (!applicant?.id) { navigateTo('/'); return false; }
  return true;
}

// Translations for fallback questions (Tagalog / Filipino)
const TRANSLATIONS = {
  'tl': [
    {
      label: 'Ipakilala ang iyong sarili',
      text: "Kumusta, ako si Konnekt, at gagabayan kita sa iyong panayam ngayon. Magsimula tayo sa isang simpleng tanong. Sabihin mo sa akin nang kaunti ang tungkol sa iyong sarili, kabilang ang iyong pinagmulan, mga interes, at kung ano ang nagpapakilala sa iyo."
    },
    {
      label: 'Bakit ang programang ito?',
      text: "Salamat. Gusto kong malaman pa ang tungkol sa iyong akademikong direksyon. Ano ang dahilan mong piliin ang programang ito sa aming unibersidad, at ano ang nararamdaman mong tumutugma sa iyo sa larangang ito?"
    },
    {
      label: 'Ang iyong mga lakas bilang mag-aaral',
      text: "Malaking tulong iyan. Ang bawat estudyante ay nagdadala ng iba't ibang lakas sa silid-aralan. Anong mga katangian, gawi, o kasanayan ang tumutulong sa iyo upang magtagumpay bilang isang mag-aaral?"
    },
    {
      label: 'Pagharap sa mga hamon',
      text: "Pag-usapan natin ang katatagan. Kapag naging mahirap ang pag-aaral o hindi ayon sa plano ang isang bagay, paano ka karaniwang humaharap at nagpapatuloy?"
    },
    {
      label: 'Mga layunin pagkatapos magtapos',
      text: "Magaling, at ito ang huling tanong. Sa pagtingin sa hinaharap, anong uri ng kinabukasan ang iyong nilalayon pagkatapos ng pagtatapos, at saan mo gustong makita ang iyong sarili sa susunod na lima hanggang sampung taon?"
    }
  ]
};

function getFallbackQuestion(idx) {
  const locale = (SpeechSettings.getLocale() || '').toLowerCase();
  const wantFil = locale.startsWith('fil') || locale.startsWith('tl');
  if (wantFil && TRANSLATIONS['tl'] && TRANSLATIONS['tl'][idx]) return TRANSLATIONS['tl'][idx];
  // FALLBACK_QUESTIONS is defined in the interview page; if available, use it
  try {
    if (typeof FALLBACK_QUESTIONS !== 'undefined' && FALLBACK_QUESTIONS[idx]) return FALLBACK_QUESTIONS[idx];
  } catch (e) {}
  return { label: `Question ${idx + 1}`, text: 'Please share your answer for this part of the interview.' };
}

// Translate currently-rendered questions (text-only) and update cached askedQuestions
function translateAllQuestions(langCode) {
  try {
    const wantFil = String(langCode || '').toLowerCase().startsWith('t');
    // Update any already-rendered AI bubbles
    const bubbles = document.querySelectorAll('#chat-messages .chat-row.ai');
    bubbles.forEach((row, i) => {
      const qIdx = i; // bubbles are appended in question order
      const trans = wantFil ? (TRANSLATIONS['tl'] || [])[qIdx] : null;
      if (trans) {
        const chip = row.querySelector('.q-chip');
        const bubble = row.querySelector('.bubble-ai');
        if (chip) chip.textContent = `Q${qIdx + 1} · ${trans.label}`;
        if (bubble) bubble.textContent = trans.text;
      } else {
        // revert to original fallback if available
        try {
          if (typeof FALLBACK_QUESTIONS !== 'undefined' && FALLBACK_QUESTIONS[qIdx]) {
            const orig = FALLBACK_QUESTIONS[qIdx];
            const chip = row.querySelector('.q-chip');
            const bubble = row.querySelector('.bubble-ai');
            if (chip) chip.textContent = `Q${qIdx + 1} · ${orig.label}`;
            if (bubble) bubble.textContent = orig.text;
          }
        } catch (e) {}
      }
    });

    // Also update any cached askedQuestions so future navigation shows translated labels
    if (state && state.askedQuestions && state.askedQuestions.length) {
      state.askedQuestions = state.askedQuestions.map((q, idx) => {
        const trans = wantFil ? (TRANSLATIONS['tl'] || [])[idx] : null;
        if (trans) return { label: trans.label, text: trans.text };
        return q; // leave dynamic server-provided text intact if not translating
      });
    }
  } catch (e) { console.error('translateAllQuestions error', e); }
}
