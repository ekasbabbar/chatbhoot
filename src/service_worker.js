let sessionPassphrase = null; // deprecated: we will rely on session storage for the decrypted key
const cache = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'unlock') {
    // Decrypt API key once and keep it in session storage (memory-only)
    const passphrase = msg.passphrase || null;
    if (!passphrase) { sendResponse({ ok: false, error: 'Missing passphrase' }); return; }
    decryptAndStoreSessionKey(passphrase)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Unlock failed' }));
    return;
  }

  if (msg.action === 'lock') {
    sessionPassphrase = null;
    chrome.storage.session.remove(['openai_key', 'openai_key_present']);
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'request_suggestion') {
    getSessionApiKey()
      .then((key) => fetchSuggestion(msg.payload, key))
      .then(s => sendResponse({ ok: true, suggestion: s }))
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.action === 'validate_key') {
    // Validate a provided key with a lightweight request
    const keyToValidate = msg.apiKey;
    validateApiKey(keyToValidate)
      .then(valid => sendResponse({ ok: true, valid }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
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

async function fetchSuggestion(payload, apiKey) {
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

// --- Key management helpers ---
async function getSessionApiKey() {
  const { openai_key } = await chrome.storage.session.get('openai_key');
  if (!openai_key) throw new Error('locked');
  return openai_key;
}

async function decryptAndStoreSessionKey(passphrase) {
  const { openai_encrypted } = await chrome.storage.local.get('openai_encrypted');
  if (!openai_encrypted) throw new Error('No saved key');
  let key;
  try {
    key = await decryptText(openai_encrypted, passphrase);
  } catch (e) {
    throw new Error('Incorrect passphrase');
  }
  await chrome.storage.session.set({ openai_key: key, openai_key_present: true });
}

async function validateApiKey(candidateKey) {
  const res = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${candidateKey}` }
  });
  if (res.status === 401) return false;
  if (!res.ok) throw new Error('API error ' + res.status);
  return true;
}

// --- Minimal decrypt implementation (mirrors utils/crypto.js) ---
const dec = new TextDecoder();
async function deriveKeyFromPassphrase(passphrase, saltBase64) {
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const passKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    passKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptText(encryptedObj, passphrase) {
  const { salt, iv, ciphertext } = encryptedObj;
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const ct = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, ct);
  return dec.decode(plainBuffer);
}
