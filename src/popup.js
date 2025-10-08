import { encryptText, decryptText } from './utils/crypto.js';

const apiKeyInput = document.getElementById('apiKey');
const passInput = document.getElementById('pass');
const passUnlockInput = document.getElementById('pass-unlock');
const saveBtn = document.getElementById('save');
const unlockBtn = document.getElementById('unlock');
const lockBtn = document.getElementById('lock');
const statusBox = document.getElementById('status');
const msgBox = document.getElementById('msg');
const toggle = document.getElementById('predictiveToggle');
const sectionSave = document.getElementById('section-save');
const sectionUnlock = document.getElementById('section-unlock');
const sectionLocked = document.getElementById('section-locked');
const deleteBtnLocked = document.getElementById('delete-key-locked');
const deleteBtnUnlocked = document.getElementById('delete-key-unlocked');

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
  const session = await chrome.storage.session.get('openai_key_present');
  const hasKey = !!stored.openai_encrypted;
  const predictive = !!stored.predictive_enabled;
  const isUnlocked = !!session.openai_key_present;

  toggle.checked = predictive;

  if (unlocked || isUnlocked) {
    setStatus('unlocked', 'API key unlocked and active.');
    sectionSave.classList.add('hidden');
    sectionUnlock.classList.add('hidden');
    sectionLocked.classList.remove('hidden');
  } else if (hasKey) {
    setStatus('stored', 'Encrypted key stored. Locked.');
    sectionSave.classList.add('hidden');
    sectionUnlock.classList.remove('hidden');
    sectionLocked.classList.add('hidden');
  } else {
    setStatus('none', 'No API key saved.');
    sectionSave.classList.remove('hidden');
    sectionUnlock.classList.add('hidden');
    sectionLocked.classList.add('hidden');
  }
}

// --- Save new key ---
saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const pass = passInput.value.trim();
  if (!apiKey || !pass) return setMessage('Enter both API key and passphrase.', 'red');

  try {
    // validate key before saving
    const validation = await chrome.runtime.sendMessage({ action: 'validate_key', apiKey });
    if (!validation?.ok) throw new Error(validation?.error || 'Validation failed');
    if (!validation.valid) return setMessage('API key invalid. Please check and try again.', 'red');

    const encrypted = await encryptText(apiKey, pass);
    await chrome.storage.local.set({ openai_encrypted: encrypted });
    unlocked = false;
    setMessage('Key encrypted and stored securely.', 'green');
    apiKeyInput.value = '';
    passInput.value = '';
    await refreshState();
  } catch (e) {
    console.error(e);
    setMessage('Encryption failed.', 'red');
  }
});

// --- Unlock existing key ---
unlockBtn.addEventListener('click', async () => {
  const pass = (passUnlockInput?.value || passInput.value).trim();
  if (!pass) return setMessage('Enter your passphrase to unlock.', 'red');

  const stored = await chrome.storage.local.get('openai_encrypted');
  if (!stored.openai_encrypted) return setMessage('No saved key to unlock.', 'red');

  try {
    // Quick decrypt attempt to verify passphrase; we do not keep key here
    await decryptText(stored.openai_encrypted, pass);
    chrome.runtime.sendMessage({ action: 'unlock', passphrase: pass }, async (resp) => {
      if (resp?.ok) {
        unlocked = true;
        setMessage('Unlocked successfully.', 'green');
        if (passUnlockInput) passUnlockInput.value = '';
        await refreshState();
      } else {
        setMessage(resp?.error || 'Unlock failed. Try again.', 'red');
      }
    });
  } catch (e) {
    console.error(e);
    setMessage('Incorrect passphrase.', 'red');
  }
});

// --- Lock ---
if (lockBtn) {
  lockBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'lock' });
    unlocked = false;
    setMessage('Locked.', 'blue');
    await refreshState();
  });
}

// --- Delete saved key ---
async function deleteSavedKey() {
  await chrome.storage.local.remove('openai_encrypted');
  await chrome.storage.session.remove(['openai_key', 'openai_key_present']);
  unlocked = false;
  setMessage('Saved key deleted.', 'blue');
  await refreshState();
}

if (deleteBtnLocked) deleteBtnLocked.addEventListener('click', deleteSavedKey);
if (deleteBtnUnlocked) deleteBtnUnlocked.addEventListener('click', deleteSavedKey);

// --- Predictive toggle ---
toggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ predictive_enabled: toggle.checked });
  setMessage(toggle.checked ? 'Predictive typing enabled.' : 'Predictive typing disabled.', 'blue');
});

// --- Init ---
refreshState();
