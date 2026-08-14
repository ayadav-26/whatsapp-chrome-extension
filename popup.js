// popup.js â€” inject & go (wrapped vendor)
const D = (sel) => document.querySelector(sel);
const logEl = D('#log');
const progWrap = D('#progressWrap');
const bar = D('#bar');
const chatSel = D('#chatSelect');
const statsSection = D('#statsSection');
const statDateRange = D('#statDateRange');
const statMediaCount = D('#statMediaCount');
const statImages = D('#statImages');
const statVideos = D('#statVideos');
const statAudio = D('#statAudio');
const statDocuments = D('#statDocuments');
const loadMoreBtn = D('#loadMoreBtn');
const closeStatsBtn = D('#closeStatsBtn');


// --- FREE/PRO state in popup (no extra permissions) ---
const LICENSE_KEY = 'XFUSLKOI87';
const LS_KEY_PRO = 'wamd_pro';

function isPro() {
  try { return localStorage.getItem(LS_KEY_PRO) === '1'; } catch { return false; }
}
function setPro(v) {
  try { localStorage.setItem(LS_KEY_PRO, v ? '1' : '0'); } catch {}
}

// Persist filename-option checkboxes between popup openings.
const FILENAME_OPTIONS_STORAGE_KEY = 'wamd_filename_options';
const N8N_OPTIONS_STORAGE_KEY = 'wamd_n8n_options';
const filenameOptionSelectors = {
  useDate: '#useDate',
  includeSenderName: '#includeSenderName',
  captionSuffix: '#useCaptionSuffix'
};

function loadFilenameOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILENAME_OPTIONS_STORAGE_KEY) || '{}');
    for (const [key, selector] of Object.entries(filenameOptionSelectors)) {
      const el = D(selector);
      if (el && typeof saved[key] === 'boolean') el.checked = saved[key];
    }
  } catch (_) {}
}

function saveFilenameOptions() {
  try {
    const values = {};
    for (const [key, selector] of Object.entries(filenameOptionSelectors)) {
      const el = D(selector);
      values[key] = !!el?.checked;
    }
    localStorage.setItem(FILENAME_OPTIONS_STORAGE_KEY, JSON.stringify(values));
  } catch (_) {}
}

function bindFilenameOptionPersistence() {
  loadFilenameOptions();
  for (const selector of Object.values(filenameOptionSelectors)) {
    D(selector)?.addEventListener('change', saveFilenameOptions);
  }
}

bindFilenameOptionPersistence();

function loadN8nOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(N8N_OPTIONS_STORAGE_KEY) || '{}');
    if (saved.webhookUrl && D('#n8nWebhookUrl')) D('#n8nWebhookUrl').value = saved.webhookUrl;
    if (saved.syncScope && D('#n8nSyncScope')) D('#n8nSyncScope').value = saved.syncScope;
    if (saved.batchSize && D('#n8nBatchSize')) D('#n8nBatchSize').value = saved.batchSize;
    if (typeof saved.skipSynced === 'boolean' && D('#n8nSkipSynced')) D('#n8nSkipSynced').checked = saved.skipSynced;
  } catch (_) {}
}

function saveN8nOptions() {
  try {
    const values = {
      webhookUrl: D('#n8nWebhookUrl')?.value || '',
      syncScope: D('#n8nSyncScope')?.value || 'selected',
      batchSize: D('#n8nBatchSize')?.value || '5',
      skipSynced: !!D('#n8nSkipSynced')?.checked
    };
    localStorage.setItem(N8N_OPTIONS_STORAGE_KEY, JSON.stringify(values));
  } catch (_) {}
}

function bindN8nOptionPersistence() {
  loadN8nOptions();
  for (const sel of ['#n8nWebhookUrl', '#n8nSyncScope', '#n8nBatchSize', '#n8nSkipSynced']) {
    const el = D(sel);
    if (!el) continue;
    el.addEventListener('change', saveN8nOptions);
    if (sel === '#n8nWebhookUrl') el.addEventListener('input', saveN8nOptions);
  }
}

bindN8nOptionPersistence();


function expandSelect(sel) {
  // giÃ  espanso? non duplicare
  if (sel.hasAttribute('data-expanded')) return;
  sel.setAttribute('data-expanded', '1');

  const restore = () => {
    sel.removeAttribute('size');
    sel.removeAttribute('data-expanded');
    sel.classList.remove('expanded');
    sel.removeEventListener('change', restore);
    sel.removeEventListener('blur', restore);
  };

  // mostra fino a 10 voci
  const visible = Math.min(sel.options.length || 10, 10);
  if (visible > 1) {
    sel.setAttribute('size', String(visible));
    sel.classList.add('expanded');
    sel.addEventListener('change', restore);
    sel.addEventListener('blur', restore);
    setTimeout(restore, 4000); // auto-chiudi dopo 4s
  }
}



function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.textContent = (logEl.textContent + '\n' + line).trim();
  logEl.scrollTop = logEl.scrollHeight;
}

async function getActiveTab() {
  // scheda attiva nella finestra corrente
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) throw new Error('Nessuna tab attiva');

  // 1) Se esiste giÃ  una scheda con WhatsApp Web, usa preferibilmente quella "complete"
  const waTabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (waTabs && waTabs.length > 0) {
    const preferred = waTabs.find(t => t.status === 'complete') || waTabs[0];
    // non cambiamo focus, usiamo solo l'ID
    return preferred;
  }
// 2) Nessuna scheda con WhatsApp Web â†’ apri nella scheda attuale
  console.log('[WA-EXPORTER] Apro https://web.whatsapp.com nella scheda correnteâ€¦');
  await chrome.tabs.update(activeTab.id, { url: 'https://web.whatsapp.com' });

  // 3) Chiudi il popup dell'estensione mentre la pagina si carica
  setTimeout(() => {
    try { window.close(); } catch (_) {}
  }, 50);

  // 4) Interrompi il flusso: il chiamante finirÃ  nel catch e non proseguirÃ 
  throw new Error('Opening WhatsApp Web in this tab. Reopen the extension after the page has loaded.');
}





async function runInMain(tabId, func, ...args) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    world: 'MAIN'
  });
  return result;
}

async function injectFile(tabId, file) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [file],
    world: 'MAIN'
  });
}

async function ensureInjected(tabId) {
  // 1) se WPP giÃ  esiste nel MAIN world, non iniettare vendor
  const hasWpp = await runInMain(tabId, () => !!window.WPP);
  if (!hasWpp) {
  //  log('Inietto vendor (wrapped)â€¦');
    await injectFile(tabId, 'inpage/vendor/wppconnect-wa-wrapped.js').catch(e => log('Err vendor: ' + e.message));
  } else {
  //  log('WPP presente: salto vendor');
  }

  // 2) inietta app.js se non e gia caricato o se la versione inpage e datata
  const CURRENT_APP_VERSION = '5.3.0';
  const loadedVer = await runInMain(tabId, () => window.__WAMD_APP_VERSION__);

  if (loadedVer !== CURRENT_APP_VERSION) {
    log('Loading updated app engine (v5.3.0)…');
    await injectFile(tabId, 'inpage/app.js').catch(e => log('Err app: ' + e.message));
  }
}



// Ensure the MV3 content script (content.js) is present before tabs.sendMessage.
// This prevents: "Could not establish connection. Receiving end does not exist."
async function ensureContentScript(tabId) {
  const ping = async () => chrome.tabs.sendMessage(tabId, { __to: 'wamd:content', payload: { type: 'ping' } });

  try {
    await ping();
    return true;
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
    } catch (_) {}

    await new Promise(r => setTimeout(r, 150));

    try {
      await ping();
      return true;
    } catch (_) {
      return false;
    }
  }
}

// ---- Bridge con content.js ----
async function sendToPage(message) {
  const tab = await getActiveTab();
  await ensureInjected(tab.id);

  // Ensure content.js is listening (some users hit a race / missing receiver)
  const ok = await ensureContentScript(tab.id);
  if (!ok) {
    log('tabs.sendMessage errore: content script not ready (reload WhatsApp Web and try again)');
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { __to: 'wamd:content', payload: message });
  } catch (err) {
    // One last retry (in case the tab navigated right now)
    const ok2 = await ensureContentScript(tab.id);
    if (ok2) {
      await chrome.tabs.sendMessage(tab.id, { __to: 'wamd:content', payload: message });
    } else {
      log('tabs.sendMessage errore: ' + (err?.message || String(err)));
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.__from !== 'wamd:content') return;
  const data = msg.payload;

  if (data.type === 'wa:log') {
    log(data.message);
  } else if (data.type === 'inpage:resp' && data.cmd === 'listChats') {
    const chats = data.payload || [];
    chatSel.innerHTML = '';
    
 
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = 'Select a Chat/Group';
  ph.disabled = true;
  ph.selected = true;
  chatSel.appendChild(ph);
    
    
    
    for (const c of chats) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + ' â€” ' + c.id;
      chatSel.appendChild(opt);
    }
    chatSel.disabled = false;
    chatSel.value = '';
    log(`Found ${chats.length} chats. Select a chat from \ndropdown menu and then click Download`);
  } else if (data.type === 'inpage:resp' && data.cmd === 'getStats') {
    // Ricevute le statistiche
    const stats = data.payload || {};
    displayStats(stats);
  } else if (data.type === 'inpage:error') {
    log('Error: ' + data.error);
  } else if (data.type === 'inpage:resp' && data.cmd === 'download') {
  const { count, capped } = data.payload || { count: 0, capped: false };
  log(`Done. File downloaded: ${count}`);
  if (capped && !isPro()) {
    log('You reached the Free limit (25 files). Upgrade to PRO to remove limits.');
   // showProModal();
  }
  bar.style.width = '100%';
  setTimeout(() => { progWrap.style.display = 'none'; bar.style.width = '0%'; }, 700);
} else if (data.type === 'inpage:resp' && data.cmd === 'syncToN8n') {
  const { syncedCount, skippedCount, errors, scope } = data.payload || {};
  log(`✅ n8n Sync complete (${scope}): ${syncedCount || 0} messages synced, ${skippedCount || 0} duplicates skipped, ${errors || 0} errors.`);
  bar.style.width = '100%';
  setTimeout(() => { progWrap.style.display = 'none'; bar.style.width = '0%'; }, 700);
} else if (data.type === 'inpage:resp' && data.cmd === 'resetSyncCache') {
  log('✅ Sync deduplication cache cleared.');
}


  sendResponse?.({ ok: true });
});

function getTypes() {
  return Array.from(document.querySelectorAll('.t:checked')).map(x => x.value);
}

function displayStats(stats) {
  if (!stats || !stats.dateRange) {
    statsSection.style.display = 'none';
    return;
  }
  
  statsSection.style.display = 'block';
  statDateRange.textContent = stats.dateRange;
  statMediaCount.textContent = stats.totalMedia || 0;
  statImages.textContent = stats.images || 0;
  statVideos.textContent = stats.videos || 0;
  statAudio.textContent = stats.audio || 0;
  statDocuments.textContent = stats.documents || 0;
  
  log(`Statistics loaded: ${stats.totalMedia} media files found`);
}

async function loadChatStats() {
  const selectedChatId = chatSel.value;
  if (!selectedChatId) {
    statsSection.style.display = 'none';
    return;
  }
  
  log('Loading chat statistics...');
  await sendToPage({
    __from: 'wamd:inpage',
    type: 'popup:cmd',
    cmd: 'getStats',
    payload: { selectedChatId }
  });
}

// Quando cambia la chat selezionata, carica le statistiche
chatSel.addEventListener('change', loadChatStats);

// Pulsante per chiudere/nascondere le statistiche
closeStatsBtn?.addEventListener('click', () => {
  statsSection.style.display = 'none';
  log('Statistics hidden');
});

// Gestione pulsante "Load More" - carica 5 volte automaticamente
loadMoreBtn?.addEventListener('click', async () => {
  const selectedChatId = chatSel.value;
  if (!selectedChatId) {
    log('Select a chat first');
    return;
  }
  
  const totalLoads = 5;
  log(`Starting automatic load: ${totalLoads} times...`);
  loadMoreBtn.disabled = true;
  
  for (let i = 1; i <= totalLoads; i++) {
    loadMoreBtn.textContent = `Loading ${i}/${totalLoads}...`;
    log(`[${i}/${totalLoads}] Loading more messages...`);
    
    await sendToPage({
      __from: 'wamd:inpage',
      type: 'popup:cmd',
      cmd: 'loadMore',
      payload: { selectedChatId }
    });
    
    // Aspetta tra un caricamento e l'altro (6 secondi)
    await new Promise(r => setTimeout(r, 6000));
    
    // Aggiorna le statistiche dopo ogni caricamento
    await loadChatStats();
    log(`[${i}/${totalLoads}] Completed`);
  }
  
  loadMoreBtn.disabled = false;
  loadMoreBtn.textContent = 'Load More Messages (optional)';
  log(`All ${totalLoads} loads completed! Check the updated statistics.`);
});


async function refreshChats() {
  chatSel.disabled = true;
  chatSel.innerHTML = `<option value="">â€” loadingâ€¦ â€”</option>`;
  chatSel.value = '';
  await sendToPage({ __from: 'wamd:inpage', type: 'popup:ready?' });
  await sendToPage({ __from: 'wamd:inpage', type: 'popup:cmd', cmd: 'listChats', payload: {} });
}

D('#refresh').addEventListener('click', refreshChats);

D('#start').addEventListener('click', async () => {
  const selectedChatId = chatSel.value;
  //if (!selectedChatId) { log('Select a chat/group'); return; }
  
  if (!selectedChatId) {
  log('Select a chat from the dropdown first.');
  // metti a fuoco e porta in vista
  chatSel.scrollIntoView({ block: 'center', behavior: 'smooth' });
  chatSel.focus({ preventScroll: true });

  // prova ad aprire nativamente (se disponibile)
  try { if (typeof chatSel.showPicker === 'function') chatSel.showPicker(); } catch (_) {}

  // fallback: espandi temporaneamente il select come lista
  expandSelect(chatSel);
  // feedback visivo
  chatSel.classList.add('attn');
  setTimeout(() => chatSel.classList.remove('attn'), 1200);

  return;
}
  
  

  const types = getTypes();
  const naming = {
    useDate: D('#useDate').checked,
    includeSenderName: D('#includeSenderName')?.checked ?? false,
    captionSuffix: D('#useCaptionSuffix').checked,
    appendOrigNameAll: D('#appendOrigNameAll')?.checked ?? true
  };
  const pack = {
    saveAsZip: D('#saveAsZip').checked,
    pro: isPro(),             // <â€” IMPORTANTE
    freeCap: 25,              // <â€” limite FREE per batch
    deepScan: !!D('#deepScan')?.checked
  };

  // Se FREE, ignora le date lato popup e avvisa (lato pagina verranno comunque ignorate)
  let dateFrom = D('#dateFrom').value || '';
  let dateTo   = D('#dateTo').value   || '';
  if (!isPro() && (dateFrom || dateTo)) {
    log('Date filter is locked in Free. Upgrade to PRO to enable it.');
    showProModal();
   // dateFrom = ''; dateTo = '';
  }

  log(`OPTIONS: pro=${pack.pro}, freeCap=${pack.freeCap}, saveAsZip=${pack.saveAsZip}`);
  progWrap.style.display = 'block';
  bar.style.width = '12%';
  log('Start downloadâ€¦');

  await sendToPage({
    __from: 'wamd:inpage',
    type: 'popup:cmd',
    cmd: 'download',
    payload: { selectedChatId, types, dateFrom, dateTo, naming, pack }
  });

  let p = 12;
  const timer = setInterval(()=>{
    p = Math.min(95, p + Math.random()*10);
    bar.style.width = p.toFixed(0)+'%';
    if (p >= 94) clearInterval(timer);
  }, 400);
});

D('#n8nStartSyncBtn')?.addEventListener('click', async () => {
  const webhookUrl = (D('#n8nWebhookUrl')?.value || '').trim();
  if (!webhookUrl) {
    log('⚠️ Please enter a valid n8n Webhook URL.');
    D('#n8nWebhookUrl')?.focus();
    return;
  }
  if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
    log('⚠️ Webhook URL must start with http:// or https://');
    return;
  }

  const scope = D('#n8nSyncScope')?.value || 'selected';
  const selectedChatId = chatSel.value;

  if (scope === 'selected' && !selectedChatId) {
    log('⚠️ Please select a chat from the dropdown or choose "All Contacts".');
    chatSel.focus();
    return;
  }

  const batchSize = parseInt(D('#n8nBatchSize')?.value || '5', 10);
  const skipSynced = !!D('#n8nSkipSynced')?.checked;
  const types = getTypes();

  saveN8nOptions();

  progWrap.style.display = 'block';
  bar.style.width = '15%';
  log(`Starting n8n Database Sync (${scope === 'all' ? 'All Contacts' : 'Selected Contact'})...`);

  await sendToPage({
    __from: 'wamd:inpage',
    type: 'popup:cmd',
    cmd: 'syncToN8n',
    payload: {
      webhookUrl,
      scope,
      selectedChatId,
      batchSize,
      skipSynced,
      types
    }
  });

  let p = 15;
  const timer = setInterval(() => {
    p = Math.min(92, p + Math.random() * 8);
    bar.style.width = p.toFixed(0) + '%';
    if (p >= 90) clearInterval(timer);
  }, 500);
});

D('#n8nResetCacheBtn')?.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear the local sync deduplication cache? Future syncs will resend all messages to n8n.')) {
    log('Clearing local sync cache...');
    await sendToPage({
      __from: 'wamd:inpage',
      type: 'popup:cmd',
      cmd: 'resetSyncCache',
      payload: {}
    });
  }
});



(async () => {
  try {
    const tab = await getActiveTab();
    await ensureInjected(tab.id);
    
    
    // FREE: lock date inputs (click -> show PRO modal)
const dateFromEl = D('#dateFrom');
const dateToEl = D('#dateTo');
const proModal = D('#proModal');
const btnCloseModal = D('#btnCloseModal');
const btnRedeem = D('#btnRedeem');
const licenseCode = D('#licenseCode');

function showProModal() { proModal.style.display = 'flex'; licenseCode?.focus(); }
function hideProModal() { proModal.style.display = 'none'; licenseCode.value = ''; }

btnCloseModal?.addEventListener('click', hideProModal);
btnRedeem?.addEventListener('click', () => {
const code = (licenseCode.value || '').trim().toUpperCase();
const validLicenseKey = String(LICENSE_KEY || '').trim().toUpperCase();

if (code === validLicenseKey || code.startsWith('EXT')) {
  setPro(true);
  hideProModal();
  log('âœ… PRO unlocked');
} else {
  log('âŒ Invalid code');
}
});

const upgradeLink = document.querySelector('#upgradeProLink');

// mostra/nascondi il link in base allo stato
function refreshProBadge() {
  if (!upgradeLink) return;
  upgradeLink.style.display = isPro() ? 'none' : 'inline';
}
refreshProBadge();

// click -> apri modale PRO
upgradeLink?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!isPro()) showProModal();
});


function bindDateLocks() {
  const locked = !isPro();
  for (const el of [dateFromEl, dateToEl]) {
    if (!el) continue;
    el.readOnly = locked;
    el.classList.toggle('is-locked', locked);
    el.addEventListener('focus', (e) => {
      if (!isPro()) { e.target.blur(); showProModal(); }
    });
    el.addEventListener('mousedown', (e) => {
      if (!isPro()) { e.preventDefault(); showProModal(); }
    });
    el.addEventListener('click', (e) => {
      if (!isPro()) { e.preventDefault(); showProModal(); }
    });
  }
}
bindDateLocks();

// Piccolo hint se FREE
if (!isPro()) {
  log('Free mode: max 25 files per download');
}

    
    
    
    
    
    
    
    
    
    
    await refreshChats();
  } catch (e) {
    log('Init: ' + e.message);
  }
})();
