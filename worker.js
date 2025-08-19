// importScripts('worker_util.js');
// chrome.runtime.onInstalled.addListener(() => setup());
// chrome.runtime.onStartup.addListener(() => setup());
// chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'cfg-updated') { setup(); } });

// async function setup() {
//   const cfg = await getCfg();
//   chrome.alarms.clearAll();
//   try { chrome.cookies.onChanged.removeListener(onCookieChanged); } catch (e) { }
//   if (cfg.autoPush) {
//     chrome.cookies.onChanged.addListener(onCookieChanged);
//     chrome.alarms.create('dat-sync-push', { periodInMinutes: 15 });
//   }
// }
// chrome.alarms.onAlarm.addListener(async (alarm) => {
//   if (alarm.name !== 'dat-sync-push') return;
//   const cfg = await getCfg();
//   if (!cfg.autoPush) return;
// });

// const domainTimers = new Map();
// function debounceDomain(domain, fn) {
//   if (domainTimers.has(domain)) clearTimeout(domainTimers.get(domain));
//   const id = setTimeout(fn, 10000);
//   domainTimers.set(domain, id);
// }
// async function onCookieChanged(changeInfo) {
//   const cfg = await getCfg(); if (!cfg.autoPush) return;
//   const c = changeInfo.cookie; if (!c || !c.domain) return;
//   const domain = c.domain.replace(/^\./, '');
//   debounceDomain(domain, async () => {
//     try {
//       const cookies = await getAllCookiesForDomain(domain);
//       await pushDomainToGist(domain, cookies);
//       console.log('[DAT Sync 2.0] Auto-pushed', domain, cookies.length);
//     } catch (e) {
//       console.warn('[DAT Sync 2.0] Auto-push failed', domain, e);
//     }
//   });
// }
// // Send a message to background service worker
// chrome.runtime.sendMessage({ action: "ping" }, (response) => {
//   console.log("Response from background:", response);
// });
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === "ping") {
//     console.log("Popup pinged me!");
//     sendResponse({ reply: "pong" });
//   }
// });
// worker.js (background service worker)
importScripts('worker_util.js');

// chrome.runtime.onInstalled.addListener(() => setup());              error whole adevent lisnser is coomont
// chrome.runtime.onStartup.addListener(() => setup());
// chrome.runtime.onMessage.addListener((msg) => {
//   if (msg && msg.type === 'cfg-updated') {
//     // setup();    error
//   }
// });

// Handle "ping" from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    console.log("Popup pinged me!");
    sendResponse({ reply: "pong" });
  }
});
