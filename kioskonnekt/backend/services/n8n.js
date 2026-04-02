const DEFAULT_TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS || 15000);

function isN8nEnabled() {
  return Boolean(process.env.N8N_WEBHOOK_URL);
}

function extractQuestion(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const text = payload.question_text || payload.question || payload.next_question || payload.nextQuestion || payload.text;
  if (!text) return null;
  return {
    label: payload.question_label || payload.label || 'Interview Question',
    text
  };
}

function extractSummary(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.final_summary || payload.finalSummary || payload.summary || payload.result || null;
}

async function callN8nWorkflow(eventType, payload) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    return { success: false, disabled: true, error: 'N8N_WEBHOOK_URL is not configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, ...payload }),
      signal: controller.signal
    });

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText };
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: data?.error || `n8n webhook returned ${response.status}`,
        data
      };
    }

    return {
      success: true,
      status: response.status,
      data,
      question: extractQuestion(data),
      summary: extractSummary(data)
    };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  isN8nEnabled,
  callN8nWorkflow,
  extractQuestion,
  extractSummary
};