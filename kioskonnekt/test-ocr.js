// test-ocr.js — run with: node test-ocr.js
require('dotenv').config();
const fs = require('fs');
const sharp = require('sharp');

const IMAGE_PATH = './test.jpg';

async function testOCR() {
  console.log('🔑 API Key:', process.env.MISTRAL_API_KEY ? 'FOUND ✅' : 'MISSING ❌');

  if (!process.env.MISTRAL_API_KEY) {
    console.error('Add MISTRAL_API_KEY to your .env file and restart.');
    process.exit(1);
  }

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error(`Image not found: ${IMAGE_PATH}`);
    process.exit(1);
  }

  // Resize + compress to keep it under ~500KB
  const compressed = await sharp(IMAGE_PATH)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const base64 = compressed.toString('base64');
  const dataUri = `data:image/jpeg;base64,${base64}`;

  console.log(`📄 Original: ${Math.round(fs.statSync(IMAGE_PATH).size / 1024)} KB`);
  console.log(`📦 Compressed: ${Math.round(compressed.length / 1024)} KB`);
  console.log('📡 Sending to Mistral...\n');

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'pixtral-12b-2409',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUri } },
            { type: 'text', text: 'Extract all text from this document image. Return only the extracted text.' }
          ]
        }
      ]
    })
  });

  const json = await response.json();

  if (!response.ok) {
    console.error('❌ Mistral error:', JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const text = json.choices?.[0]?.message?.content?.trim();
  console.log('✅ Extracted text:\n');
  console.log('─'.repeat(50));
  console.log(text);
  console.log('─'.repeat(50));
}

testOCR().catch(err => {
  console.error('❌ Unexpected error:', err.message);
});
