const DEFAULT_TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS || 15000);

function isN8nEnabled() {
    return Boolean(process.env.N8N_WEBHOOK_URL);
}

function extractQuestion(payload) {
    if (!payload || typeof payload !== 'object') return null;

    // Log what we're trying to extract from
    console.log('🔍 extractQuestion attempting to parse payload:', JSON.stringify(payload, null, 2));

    // Prioritize 'text' since that's what n8n workflow outputs
    const text = payload.text || payload.question_text || payload.question || payload.next_question || payload.nextQuestion;
    if (!text) {
        console.warn('⚠️  No question text found in n8n payload. Available keys:', Object.keys(payload));
        return null;
    }

    const result = {
        label: payload.question_label || payload.label || 'Interview Question',
        text
    };

    console.log('✅ Successfully extracted question:', result);
    return result;
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
        console.log(`📤 Calling n8n webhook for event: ${eventType}`);
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

        console.log(`📥 n8n webhook response (${response.status}):`, JSON.stringify(data, null, 2));

        if (!response.ok) {
            console.error(`❌ n8n webhook error ${response.status}:`, data?.error || 'Unknown error');
            return {
                success: false,
                status: response.status,
                error: data?.error || `n8n webhook returned ${response.status}`,
                data
            };
        }

        const question = extractQuestion(data);
        const summary = extractSummary(data);

        console.log('🎯 Final result - question:', question, 'summary:', summary);

        return {
            success: true,
            status: response.status,
            data,
            question,
            summary
        };
    } catch (error) {
        console.error('💥 n8n call failed:', error.message);
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