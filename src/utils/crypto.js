const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKeyFromPassphrase(passphrase, saltBase64) {
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const passKey = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    passKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptText(plainText, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const saltB64 = btoa(String.fromCharCode(...salt));
  const ivB64 = btoa(String.fromCharCode(...iv));
  const key = await deriveKeyFromPassphrase(passphrase, saltB64);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plainText));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ct)));
  return { salt: saltB64, iv: ivB64, ciphertext: ctB64 };
}

async function decryptText(encryptedObj, passphrase) {
  const { salt, iv, ciphertext } = encryptedObj;
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const ct = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, ct);
  return dec.decode(plainBuffer);
}

export { encryptText, decryptText };
