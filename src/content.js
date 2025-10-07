let predictiveEnabled = false;
let debounceTimer = null;
let currentSuggestion = '';
let suggestionBox = null;

// Load predictive setting on startup
chrome.storage.local.get('predictive_enabled', (r) => {
  predictiveEnabled = !!r.predictive_enabled;
  if (predictiveEnabled) attachListeners();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.predictive_enabled) {
    predictiveEnabled = changes.predictive_enabled.newValue;
    if (predictiveEnabled) attachListeners();
    else detachListeners();
  }
});

function attachListeners() {
  document.addEventListener('focusin', onFocus, true);
}

function detachListeners() {
  document.removeEventListener('focusin', onFocus, true);
  clearUI();
}

function onFocus(e) {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  if (!('value' in el) && !el.isContentEditable) return;
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKeyDown);
}

function onInput(e) {
  const el = e.target;
  const text = el.isContentEditable ? el.innerText : el.value;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => requestSuggestion(el, text), 700);
}

function onKeyDown(e) {
  if (e.key === 'Tab' && currentSuggestion) {
    e.preventDefault();
    insertSuggestion(e.target, currentSuggestion);
    clearUI();
  }
}

function requestSuggestion(el, text) {
  if (!predictiveEnabled) return;
  const payload = {
    contextText: text.slice(-500),
    partial: text,
    tone: 'casual'
  };
  chrome.runtime.sendMessage({ action: 'request_suggestion', payload }, (resp) => {
    if (resp?.ok) renderSuggestion(el, resp.suggestion);
  });
}

function renderSuggestion(el, suggestion) {
  currentSuggestion = suggestion;
  if (!suggestionBox) {
    suggestionBox = document.createElement('div');
    suggestionBox.id = 'cg-suggestion-box';
    suggestionBox.style.cssText =
      'position:absolute;z-index:999999;background:#f9f9f9;border:1px solid #ccc;' +
      'padding:4px 6px;font-size:13px;color:#666;border-radius:6px;';
    document.body.appendChild(suggestionBox);
  }
  const rect = el.getBoundingClientRect();
  suggestionBox.style.left = rect.left + window.scrollX + 'px';
  suggestionBox.style.top = rect.bottom + window.scrollY + 6 + 'px';
  suggestionBox.innerText = suggestion || '';
}

function insertSuggestion(el, suggestion) {
  if (el.isContentEditable) el.innerText += ' ' + suggestion;
  else el.value += (el.value.endsWith(' ') ? '' : ' ') + suggestion;
}

function clearUI() {
  if (suggestionBox) suggestionBox.remove();
  suggestionBox = null;
  currentSuggestion = '';
}
