const API='https://api.github.com';

export async function getSettings(){
  return new Promise(r=>chrome.storage.local.get(
    {token:'',gistId:'',filename:'session.json',secret:'',authFile:'users.csv',autoPush:false,enabledBases:{},encrypt:true}, r));
}

function headers(token){
  return {'Authorization':`token ${token}`,'Accept':'application/vnd.github+json','Cache-Control':'no-cache, no-store'};
}

// --- Encryption helpers (AES-GCM + PBKDF2) ---
function b64(bytes){ let bin=''; bytes=new Uint8Array(bytes); for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); }
function b64dec(str){ const bin=atob(str); const out=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out.buffer; }
function looksEncrypted(raw){ try{ const j=JSON.parse(raw); return !!(j && j.kdf && j.cipher && j.payload); }catch(e){ return false; } }

async function deriveKeyFromPhrase(phrase, salt, iter=250000){
  const enc=new TextEncoder();
  const keyMaterial=await crypto.subtle.importKey('raw', enc.encode(phrase), {name:'PBKDF2'}, false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:iter, hash:'SHA-256'}, keyMaterial, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
async function encryptEnvelope(obj, phrase){
  const enc=new TextEncoder(); const salt=new Uint8Array(16); crypto.getRandomValues(salt);
  const iv=new Uint8Array(12); crypto.getRandomValues(iv);
  const key=await deriveKeyFromPhrase(phrase, salt);
  const plaintext=enc.encode(JSON.stringify(obj));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, plaintext);
  return { v:'1', kdf:{alg:'PBKDF2-SHA256', salt:b64(salt), iter:250000}, cipher:{alg:'AES-256-GCM', iv:b64(iv)}, payload:b64(ciphertext), meta:{createdAt:Date.now()} };
}
async function decryptEnvelope(env, phrase){
  const salt=new Uint8Array(b64dec(env.kdf.salt)); const iv=new Uint8Array(b64dec(env.cipher.iv));
  const key=await deriveKeyFromPhrase(phrase, salt, env.kdf.iter||250000);
  const data=await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, b64dec(env.payload));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(data)));
}

export async function readGist({token,gistId,filename,secret}){
  if(!token||!gistId||!filename) throw new Error('Missing token/gistId/filename');
  const res=await fetch(`${API}/gists/${gistId}`, { headers: headers(token) });
  if(!res.ok) throw new Error(`Gist read failed: ${res.status}`);
  const data=await res.json();
  const f=data.files && data.files[filename];
  const raw=(f && typeof f.content==='string')? f.content : '';
  if(!raw) return {updatedAt:Date.now(),domains:{}};
  if(looksEncrypted(raw)){
    if(!secret) throw new Error('Encrypted session: secret required');
    const env=JSON.parse(raw);
    return await decryptEnvelope(env, secret);
  }
  try{ return JSON.parse(raw);}catch(e){ return {updatedAt:Date.now(),domains:{}}; }
}

export async function writeGist({token,gistId,filename,secret,encrypt}, state){
  const content = (encrypt && secret) ? JSON.stringify(await encryptEnvelope(state, secret)) : JSON.stringify(state, null, 2);
  const res=await fetch(`${API}/gists/${gistId}`, { method:'PATCH', headers: headers(token),
    body: JSON.stringify({ files: { [filename]: { content } } }) });
  if(!res.ok) throw new Error('Gist write failed: '+res.status);
  return true;
}

export async function pushDomain(domain, cookies){
  const cfg = await getSettings();
  const state = await readGist(cfg);
  state.updatedAt = Date.now();
  state.domains = state.domains || {};
  state.domains[domain] = cookies;
  await writeGist(cfg, state);
}

export async function getDomain(domain){
  const cfg = await getSettings();
  const state = await readGist(cfg);
  return (state.domains && state.domains[domain]) || [];
}

/** Clear all cookie groups from Gist (used when slider turns OFF) */
export async function clearAllDomains(){
  const cfg = await getSettings();
  const state = { updatedAt: Date.now(), domains: {} };
  await writeGist(cfg, state);
  return true;
}
