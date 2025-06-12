// encrypt.js – AES-GCM encryption for end-to-end encrypted memory storage

const ENCRYPTION_KEY_NAME = "nexus-user-key";

// ========== 1. Utility functions ==========
function strToBuf(str) {
  return new TextEncoder().encode(str);
}

function bufToStr(buf) {
  return new TextDecoder().decode(buf);
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  return new Uint8Array([...binary].map(char => char.charCodeAt(0)));
}

// ========== 2. Key Management ==========
export async function generateKey() {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  localStorage.setItem(ENCRYPTION_KEY_NAME, bufToBase64(raw));
  return key;
}

export async function getStoredKey() {
  const b64 = localStorage.getItem(ENCRYPTION_KEY_NAME);
  if (!b64) return null;
  const raw = base64ToBuf(b64);
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function ensureKey() {
  const existing = await getStoredKey();
  return existing || await generateKey();
}

// ========== 3. Encrypt ==========
export async function encryptText(plainText) {
  const key = await ensureKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = strToBuf(plainText);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return {
    iv: bufToBase64(iv),
    data: bufToBase64(encrypted)
  };
}

// ========== 4. Decrypt ==========
export async function decryptText({ iv, data }) {
  const key = await ensureKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(iv) },
    key,
    base64ToBuf(data)
  );
  return bufToStr(decrypted);
}