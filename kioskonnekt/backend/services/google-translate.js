const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_API_KEY || '';

async function translateText(text, targetLang, sourceLang) {
  if (!text) return text;
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_TRANSLATE_API_KEY not configured');

  // Normalize target language (map common 'fil' to 'tl')
  let target = String(targetLang || '').toLowerCase();
  if (!target) throw new Error('target language required');
  if (target === 'fil') target = 'tl';

  const url = 'https://translation.googleapis.com/language/translate/v2';

  const params = {
    key: GOOGLE_API_KEY,
    q: text,
    target
  };
  if (sourceLang) params.source = sourceLang;

  const resp = await axios.post(url, null, { params });
  if (resp?.data?.data?.translations && resp.data.data.translations[0]) {
    return resp.data.data.translations[0].translatedText;
  }
  throw new Error('Unexpected response from Google Translate');
}

module.exports = { translateText };
