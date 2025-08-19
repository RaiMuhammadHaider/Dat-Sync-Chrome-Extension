
async function loadSettings() {
  return new Promise(r => chrome.storage.local.get(
    { token: '', gistId: '', filename: 'session.json', secret: '', authFile: 'users.csv', autoPush: false, encrypt: true }, r));
}
async function saveSettings(v) { return new Promise(r => chrome.storage.local.set(v, r)); }
function toB64Url(str) { return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

document.addEventListener('DOMContentLoaded', async () => {
  const els = {
    token: document.getElementById('token'),
    gistId: document.getElementById('gistId'),
    filename: document.getElementById('filename'),
    authFile: document.getElementById('authFile'),
    secret: document.getElementById('secret'),
    autoPush: document.getElementById('autoPush'),
    encrypt: document.getElementById('encrypt'),
    saveBtn: document.getElementById('save'),
    status: document.getElementById('status'),
    gen: document.getElementById('gen'),
    out: document.getElementById('tokenOut'),
    copy: document.getElementById('copy')
  };
  const s = await loadSettings();
  els.token.value = s.token || ''; els.gistId.value = s.gistId || ''; els.filename.value = s.filename || 'session.json';
  els.authFile.value = s.authFile || 'users.csv'; els.secret.value = s.secret || '';
  els.autoPush.checked = !!s.autoPush; if (els.encrypt) els.encrypt.checked = !!s.encrypt;

  els.saveBtn.addEventListener('click', async () => {
    await saveSettings({
      token: (els.token.value || '').trim(),
      gistId: (els.gistId.value || '').trim(),
      filename: (els.filename.value || '').trim() || 'session.json',
      authFile: (els.authFile.value || '').trim() || 'users.csv',
      secret: (els.secret.value || '').trim(),
      autoPush: !!els.autoPush.checked,
      encrypt: !!(els.encrypt && els.encrypt.checked)
    });
    els.status.textContent = 'Saved.'; setTimeout(() => els.status.textContent = '', 1200);
  });

  // Generate Base64URL setup token (PAT is included; one-time)
  els.gen.addEventListener('click', async () => {
    const s2 = await loadSettings();
    const payload = JSON.stringify({ gistId: s2.gistId, token: s2.token, secret: s2.secret, filename: s2.filename || 'session.json', authFile: s2.authFile || 'users.csv' });
    els.out.value = toB64Url(payload);
  });
  els.copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(els.out.value || ''); els.status.textContent = 'Copied.'; setTimeout(() => els.status.textContent = '', 1200); }
    catch (e) { els.status.textContent = 'Copy failed.'; }
  });
});
