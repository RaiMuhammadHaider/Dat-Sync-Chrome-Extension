
async function getCfg() {
  return new Promise(r => chrome.storage.local.get(
    { token: '', gistId: '', filename: 'session.json', secret: '', encrypt: true, autoPush: false }, r));
}

function buildURL(secure, domain, path) { if (domain && domain.startsWith('.')) domain = domain.slice(1); return `http${secure ? 's' : ''}://${domain}${path || '/'}`; }
function clonePayloadFromCookie(c) {
  const p = { name: c.name, value: c.value, path: c.path, secure: c.secure, httpOnly: c.httpOnly, storeId: c.storeId, url: buildURL(c.secure, c.domain || '', c.path || '/') };
  if (!c.hostOnly && c.domain) p.domain = c.domain;
  if (!c.session && typeof c.expirationDate === 'number') p.expirationDate = c.expirationDate;
  if (c.sameSite) p.sameSite = c.sameSite;
  if (c.priority) p.priority = c.priority;
  if (typeof c.sameParty === 'boolean') p.sameParty = c.sameParty;
  if (c.partitionKey && typeof c.partitionKey === 'object') p.partitionKey = c.partitionKey;
  return p;
}
async function getAllCookiesForDomain(domain) { return new Promise(r => chrome.cookies.getAll({ domain }, r)); }

// --- Encryption helpers (duplicate for worker context) ---
function b64(bytes) { let bin = ''; bytes = new Uint8Array(bytes); for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); }
function b64dec(str) { const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; }
function looksEncrypted(raw) { try { const j = JSON.parse(raw); return !!(j && j.kdf && j.cipher && j.payload); } catch (e) { return false; } }
async function deriveKeyFromPhrase(phrase, salt, iter = 250000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(phrase), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptEnvelope(obj, phrase) {
  const enc = new TextEncoder(); const salt = new Uint8Array(16); crypto.getRandomValues(salt);
  const iv = new Uint8Array(12); crypto.getRandomValues(iv);
  const key = await deriveKeyFromPhrase(phrase, salt);
  const plaintext = enc.encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { v: '1', kdf: { alg: 'PBKDF2-SHA256', salt: b64(salt), iter: 250000 }, cipher: { alg: 'AES-256-GCM', iv: b64(iv) }, payload: b64(ciphertext), meta: { createdAt: Date.now() } };
}
async function decryptEnvelope(env, phrase) {
  const salt = new Uint8Array(b64dec(env.kdf.salt)); const iv = new Uint8Array(b64dec(env.cipher.iv));
  const key = await deriveKeyFromPhrase(phrase, salt, env.kdf.iter || 250000);
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b64dec(env.payload));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(data)));
}

async function pushDomainToGist(domain, cookies) {
  const { token, gistId, filename, secret, encrypt } = await getCfg();
  if (!token || !gistId || !filename) throw new Error('Missing token/gistId/filename');
  const API = 'https://api.github.com';
  // Read current
  const res = await fetch(`${API}/gists/${gistId}`, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github+json', 'Cache-Control': 'no-cache, no-store' } });
  if (!res.ok) throw new Error('Gist read error: ' + res.status);
  const data = await res.json();
  let obj = { updatedAt: Date.now(), domains: {} };
  if (data.files && data.files[filename] && data.files[filename].content) {
    const raw = data.files[filename].content;
    if (looksEncrypted(raw)) {
      if (!secret) throw new Error('Encrypted session: secret required');
      obj = await decryptEnvelope(JSON.parse(raw), secret);
    } else {
      try { obj = JSON.parse(raw); } catch (e) { obj = { updatedAt: Date.now(), domains: {} }; }
    }
  }
  obj.updatedAt = Date.now(); obj.domains = obj.domains || {}; obj.domains[domain] = cookies;
  let content;
  if (encrypt && secret) { content = JSON.stringify(await encryptEnvelope(obj, secret)); }
  else { content = JSON.stringify(obj, null, 2); }
  const body = JSON.stringify({ files: { [filename]: { content } } });
  const res2 = await fetch(`${API}/gists/${gistId}`, { method: 'PATCH', headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github+json', 'Cache-Control': 'no-cache, no-store', 'Content-Type': 'application/json' }, body });
  if (!res2.ok) throw new Error('Gist write error: ' + res2.status);
}

// Simple domain debouncer for cookie change storms
const _pending = new Map();
function debounceDomain(domain, fn) {
  if (_pending.has(domain)) clearTimeout(_pending.get(domain));
  const h = setTimeout(() => { _pending.delete(domain); fn(); }, 1200);
  _pending.set(domain, h);
}

// Expose for worker.js
self.getAllCookiesForDomain = getAllCookiesForDomain;
self.pushDomainToGist = pushDomainToGist;
self.debounceDomain = debounceDomain;
self.getCfg = getCfg;
