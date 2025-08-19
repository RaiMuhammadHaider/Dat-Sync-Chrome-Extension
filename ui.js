import { pushDomain, getSettings, readGist, writeGist, clearAllDomains } from './gist.js';

function buildURL(secure,domain,path){ if(domain&&domain.startsWith('.')) domain=domain.slice(1); return `http${secure?'s':''}://${domain}${path||'/'}`; }
async function getActiveTab(){ const tabs=await chrome.tabs.query({active:true,currentWindow:true}); return tabs[0]; }
function toHost(u){ try{ return new URL(u).hostname; }catch(e){ return ''; } }
function baseDomain(host){ const parts=(host||'').split('.').filter(Boolean); if(parts.length<=2) return host||''; return parts.slice(-2).join('.'); }

function clonePayloadFromCookie(c){
  const p={ name:c.name, value:c.value, path:c.path, secure:c.secure, httpOnly:c.httpOnly, storeId:c.storeId,
            url:buildURL(c.secure,c.domain||'',c.path||'/') };
  if(!c.hostOnly && c.domain) p.domain=c.domain;
  if(!c.session && typeof c.expirationDate==='number') p.expirationDate=c.expirationDate;
  if(c.sameSite) p.sameSite=c.sameSite;
  if(c.priority) p.priority=c.priority;
  if(typeof c.sameParty==='boolean') p.sameParty=c.sameParty;
  if(c.partitionKey && typeof c.partitionKey==='object') p.partitionKey=c.partitionKey;
  return p;
}

async function readAllCookies(){ return new Promise(r=>chrome.cookies.getAll({}, r)); }
async function readBaseDomainCookies(bd){
  const all = await readAllCookies();
  return all.filter(c=>{
    const d=(c.domain||'').replace(/^\./,'');
    if(d===bd || d.endsWith('.'+bd)) return true;
    if(bd==='dat.com' && d==='one.dat.com') return true;
    return false;
  });
}
async function writeCookies(cookies){
  let ok=0, fail=0;
  for(const c of cookies){
    const payload = clonePayloadFromCookie(c);
    try{ await chrome.cookies.set(payload); ok++; }
    catch(e){ console.warn('cookies.set failed', e, payload); fail++; }
  }
  return {ok, fail};
}

async function getEnabledFor(bd){ return new Promise(resolve=>chrome.storage.local.get({enabledBases:{}},res=>resolve(!!(res.enabledBases||{})[bd]))); }
async function setEnabledFor(bd,on){ return new Promise(resolve=>chrome.storage.local.get({enabledBases:{}},res=>{ const map=res.enabledBases||{}; map[bd]=!!on; chrome.storage.local.set({enabledBases:map},resolve); })); }

/* non-copyable inputs: block selection, copy, cut, context menu */
function hardenInput(el){
  const stop=e=>{ e.preventDefault(); e.stopPropagation(); return false; };
  ['copy','cut','contextmenu','dragstart','selectstart','paste'].forEach(evt=>el.addEventListener(evt, stop));
}

async function pushCookies(root){
  const tab=await getActiveTab(); const host=toHost(tab?.url||''); const bd=baseDomain(host);
  const cookies = await readBaseDomainCookies(bd);
  await pushDomain(bd, cookies);
  root.querySelector('#status').textContent = `Pushed ${cookies.length} cookie(s) for ${bd}.`;
}
async function mergeCookies(root){
  const cfg=await getSettings(); const state=await readGist(cfg);
  let totalOk=0,totalFail=0,total=0;
  const domains = Object.keys(state.domains||{});
  for(const key of domains){
    const list = state.domains[key]||[];
    total += list.length;
    const {ok,fail} = await writeCookies(list);
    totalOk += ok; totalFail += fail;
  }
  root.querySelector('#status').textContent = `Merged ${totalOk}/${total} cookie(s)` + (totalFail?`, ${totalFail} failed`:``) + ` from ${domains.length} group(s).`;
}

async function loadStorage(){
  return new Promise(r=>chrome.storage.local.get(
    {token:'',gistId:'',filename:'session.json',secret:'',authFile:'users.csv',autoPush:false,encrypt:true}, r));
}
async function saveStorage(obj){
  return new Promise(r=>chrome.storage.local.set(obj, r));
}

function toB64Url(str){return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}

export async function mountUI(){
  const root=document; // popup.html
  const statusEl=root.getElementById('status');
  const slider=root.getElementById('slider');
  const thumb=root.getElementById('thumb');
  const pushBtn=root.getElementById('pushBtn');
  const mergeBtn=root.getElementById('mergeBtn');
  const settingsBtn=root.getElementById('settingsBtn');
  const panel=root.getElementById('settingsPanel');
  const saveBtn=root.getElementById('saveBtn');
  const saveStatus=root.getElementById('saveStatus');
  const tokenMasked=root.getElementById('tokenMasked');
  const gistIdMasked=root.getElementById('gistIdMasked');
  const secretMasked=root.getElementById('secretMasked');
  const tokenEdit=root.getElementById('tokenEdit');
  const gistIdEdit=root.getElementById('gistIdEdit');
  const secretEdit=root.getElementById('secretEdit');
  const filenameEl=root.getElementById('filename');
  const authFileEl=root.getElementById('authFile');
  const autoPushEl=root.getElementById('autoPush');
  const encryptEl=root.getElementById('encrypt'); // hidden debug switch
  const tokenOut=root.getElementById('tokenOut');
  const genBtn=root.getElementById('genBtn');

  // Domain label
  const tab=await getActiveTab(); const host=toHost(tab?.url||''); const bd=baseDomain(host);
  root.getElementById('domainLabel').textContent=bd||host||'unknown';

  // Non-copyable masks
  [tokenMasked,gistIdMasked,secretMasked].forEach(hardenInput);

  // Load settings
  const s=await loadStorage();
  // populate visible non-sensitive fields
  filenameEl.value=s.filename||'session.json';
  authFileEl.value=s.authFile||'users.csv';
  autoPushEl.checked=!!s.autoPush;
  // encryption forced on by default (hidden switch mirrors s.encrypt OR defaults to true)
  encryptEl.checked = (typeof s.encrypt==='boolean') ? s.encrypt : true;

  // Persisted enable state -> big slider UI
  const on = await getEnabledFor(bd);
  setSliderState(on);

  function setSliderState(isOn){
    slider.classList.remove(isOn?'off':'on');
    slider.classList.add(isOn?'on':'off');
    slider.setAttribute('aria-checked', String(!!isOn));
    thumb.textContent = isOn ? 'ON' : 'OFF';
    pushBtn.disabled = !isOn;
    mergeBtn.disabled = !isOn;
    statusEl.textContent = isOn ? 'Ready.' : 'Slide ON to enable actions.';
  }

  async function handleTurnOff(){
    // Delete cookies stored in Gist
    try{
      await clearAllDomains();
      statusEl.textContent = 'Remote cookies cleared.';
    }catch(e){
      statusEl.textContent = 'Clear failed: ' + (e?.message||String(e));
    }
  }

  async function toggleSlider(){
    const nowOn = slider.classList.contains('off'); // if off -> turning on
    setSliderState(nowOn);
    await setEnabledFor(bd, nowOn);
    if(!nowOn){ await handleTurnOff(); }
  }

  slider.addEventListener('click', toggleSlider);
  slider.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); toggleSlider(); } });

  pushBtn.addEventListener('click', ()=>pushCookies(root).catch(e=>{ statusEl.textContent='Push error: '+(e?.message||String(e)); }));
  mergeBtn.addEventListener('click', ()=>mergeCookies(root).catch(e=>{ statusEl.textContent='Merge error: '+(e?.message||String(e)); }));

  // Settings panel toggle
  settingsBtn.addEventListener('click', ()=>{
    panel.classList.toggle('hidden');
  });

  // Edit masked sensitive values with ephemeral prompts (no actual values put into DOM inputs)
  tokenEdit.addEventListener('click', async ()=>{
    const v = prompt('Enter GitHub Token (PAT):','');
    if(v!=null){ await saveStorage({ ...await loadStorage(), token: v.trim() }); showSaved(); }
  });
  gistIdEdit.addEventListener('click', async ()=>{
    const v = prompt('Enter Gist ID:','');
    if(v!=null){ await saveStorage({ ...await loadStorage(), gistId: v.trim() }); showSaved(); }
  });
  secretEdit.addEventListener('click', async ()=>{
    const v = prompt('Enter Admin Secret Phrase:','');
    if(v!=null){ await saveStorage({ ...await loadStorage(), secret: v.trim() }); showSaved(); }
  });

  function showSaved(){
    saveStatus.textContent='Saved.'; setTimeout(()=>saveStatus.textContent='',1200);
  }

  saveBtn.addEventListener('click', async ()=>{
    const cur = await loadStorage();
    const obj = {
      token: cur.token||'',
      gistId: cur.gistId||'',
      secret: cur.secret||'',
      filename: (filenameEl.value||'session.json').trim(),
      authFile: (authFileEl.value||'users.csv').trim(),
      autoPush: !!autoPushEl.checked,
      // Force encryption ON by default; allow debug override only if manually unchecked (hidden)
      encrypt: !!encryptEl.checked
    };
    await saveStorage(obj);
    // Re-init background for autoPush
    chrome.runtime.getBackgroundPage?.(() => {}); // MV3 SW – no-op, but keep for safety
    chrome.runtime.sendMessage({type:'cfg-updated'}).catch(()=>{});
    showSaved();
  });

  // Generate Base64URL setup token (includes PAT; treat as sensitive)
  genBtn.addEventListener('click', async ()=>{
    const ss=await loadStorage();
    const payload = JSON.stringify({
      gistId:ss.gistId, token:ss.token, secret:ss.secret,
      filename:ss.filename||'session.json', authFile:ss.authFile||'users.csv'
    });
    tokenOut.value = toB64Url(payload);
    panel.classList.remove('hidden');
    statusEl.textContent = 'Setup token generated (handle carefully).';
  });
}
