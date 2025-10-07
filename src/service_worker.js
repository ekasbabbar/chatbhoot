let apiKey = null;
const cache = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'unlock') {
    apiKey = msg.apiKey;
    console.log('API key unlocked.');
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'request_suggestion') {
    if (!apiKey) return sendResponse({ error: 'locked' });
    fetchSuggestion(msg.payload).then(s => sendResponse({ ok: true, suggestion: s }))
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }
});

function getCacheKey(payload) {
  return JSON.stringify({
    p: payload.partial.slice(-40),
    c: payload.contextText.slice(-200),
    t: payload.tone
  });
}

async function fetchSuggestion(payload) {
  const key = getCacheKey(payload);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < 30000) return hit.suggestion;

  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `Predict short, natural message continuations. Tone: ${payload.tone || 'casual'}.` },
      { role: "user", content: `Continue: ${payload.partial}` }
    ],
    max_tokens: 40,
    temperature: 0.6
  };
  
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error('API error ' + res.status);
  const j = await res.json();
  const suggestion = j.choices?.[0]?.message?.content?.trim() || '';
  cache.set(key, { suggestion, ts: Date.now() });
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return suggestion;
}
