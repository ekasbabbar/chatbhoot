import { encryptText, decryptText } from './utils/crypto.js';

const apiKeyInput = document.getElementById('apiKey');
const passInput = document.getElementById('pass');
const saveBtn = document.getElementById('save');
const unlockBtn = document.getElementById('unlock');
const statusBox = document.getElementById('status');
const msgBox = document.getElementById('msg');
const toggle = document.getElementById('predictiveToggle');

let unlocked = false;

// --- Helper functions ---

function setStatus(type, text) {
  statusBox.className = 'status ' + type;
  statusBox.textContent = text;
}

function setMessage(text, color = '#555') {
  msgBox.style.color = color;
  msgBox.textContent = text;
}

async function refreshState() {
  const stored = await chrome.storage.local.get(['openai_encrypted', 'predictive_enabled']);
  const hasKey = !!stored.openai_encrypted;
  const predictive = !!stored.predictive_enabled;

  toggle.checked = predictive;

  if (unlocked) {
    setStatus('unlocked', 'API key unlocked and active.');
  } else if (hasKey) {
    setStatus('stored', 'Encrypted key stored. Locked.');
  } else {
    setStatus('none', 'No API key saved.');
  }
}

// --- Save new key ---
saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const pass = passInput.value.trim();
  if (!apiKey || !pass) return setMessage('Enter both API key and passphrase.', 'red');

  try {
    const encrypted = await encryptText(apiKey, pass);
    await chrome.storage.local.set({ openai_encrypted: encrypted });
    unlocked = false;
    setMessage('Key encrypted and stored securely.', 'green');
    await refreshState();
  } catch (e) {
    console.error(e);
    setMessage('Encryption failed.', 'red');
  }
});

// --- Unlock existing key ---
unlockBtn.addEventListener('click', async () => {
  const pass = passInput.value.trim();
  if (!pass) return setMessage('Enter your passphrase to unlock.', 'red');

  const stored = await chrome.storage.local.get('openai_encrypted');
  if (!stored.openai_encrypted) return setMessage('No saved key to unlock.', 'red');

  try {
    const apiKey = await decryptText(stored.openai_encrypted, pass);
    chrome.runtime.sendMessage({ action: 'unlock', apiKey }, async (resp) => {
      if (resp?.ok) {
        unlocked = true;
        setMessage('Unlocked successfully.', 'green');
        await refreshState();
      } else {
        setMessage('Unlock failed. Try again.', 'red');
      }
    });
  } catch (e) {
    console.error(e);
    setMessage('Incorrect passphrase.', 'red');
  }
});

// --- Predictive toggle ---
toggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ predictive_enabled: toggle.checked });
  setMessage(toggle.checked ? 'Predictive typing enabled.' : 'Predictive typing disabled.', 'blue');
});

// --- Init ---
refreshState();
