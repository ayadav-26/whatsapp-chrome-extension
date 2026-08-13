// inpage/app.js — verbose logging + robust download fallback + correct ACK count
(function () {
  // --- Guard per evitare doppia iniezione ---
  if (window.__WAMD_APP_LOADED__) {
    window.postMessage({
      __from: 'wamd:inpage',
      type: 'wa:log',
      message: 'app.js già caricato'
    }, '*');
    return;
  }
  window.__WAMD_APP_LOADED__ = true;

  // --- util comuni ---
  // NB: per i log il popup si aspetta "message", non "payload"
  const busSend = (type, payload) => window.postMessage({ __from: 'wamd:inpage', type, ...payload }, '*');
  const log = (m) => busSend('wa:log', { message: String(m) });

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function getTimeoutForMedia(m) {
  const kind = (m.type || m.mediaType || '').toLowerCase();
  if (kind === 'video') return 20000;
  if (kind === 'document') return 12000;
  return 8000; // images/audio
}



function getMediaStage(m) {
  // prova prima su mediaData
  const md = m?.mediaData || m?._mediaData;
  const stage =
    md?.__x_mediaStage ??
    md?.["__x_mediaStage"] ??   // accesso esplicito
    md?.mediaStage ??
    md?.stage ??
    m?.__x_mediaStage ??
    m?.mediaStage ??
    m?.stage ??
    null;

  return stage;
}




function isProbablyUnavailableByMessage(m) {
  const kind = (m.type || m.mediaType || '').toLowerCase();
  const md = m?.mediaData || m?._mediaData || null;

  // 1) Stati WA che spesso bloccano downloadMedia() (pendente)
  const stage = getMediaStage(m);
  //if ((m?.id?._serialized || '').includes('3EB002AFA6E1B2EAD52111')) log(`DBG stage=${stage}`);
  const stageUp = stage ? String(stage).toUpperCase() : '';
  if (stageUp && ['REUPLOADING', 'ERROR', 'WAITING', 'PROCESSING'].includes(stageUp)) {
    return true;
  }

  // 2) Check campi minimi
  const hasKey = !!(
    m.mediaKey ||
    md?.mediaKey || md?.key || md?.__x_mediaKey || md?.__x_key
  );

  const hasPathOrUrl = !!(
    m.directPath || md?.directPath || md?.__x_directPath ||
    m.clientUrl || md?.clientUrl || md?.url || md?.__x_clientUrl || md?.__x_url ||
    m.deprecatedMms3Url || md?.deprecatedMms3Url || md?.__x_deprecatedMms3Url
  );

  if ((kind === 'image' || kind === 'video' || kind === 'document') && (!hasKey || !hasPathOrUrl)) {
    return true;
  }

  return false;
}


  
  
  function sanitizeFilename(s) {
    return (s || '').replace(/\s+/g, ' ').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 120);
  }

  const senderNameCache = new Map();

  function widToString(wid) {
    if (!wid) return '';
    if (typeof wid === 'string') return wid;
    return wid._serialized || wid.serialized || wid.user || wid.id || '';
  }

  function cleanSenderFallback(value) {
    const raw = widToString(value);
    if (!raw) return '';
    const user = raw.split('@')[0].split(':')[0];
    return sanitizeFilename(user);
  }

  async function resolveSenderName(message) {
    if (!message) return '';
    if (message.fromMe || message.id?.fromMe) return 'Me';

    const embedded = [
      message.senderObj?.formattedName,
      message.senderObj?.pushname,
      message.senderObj?.name,
      message.authorObj?.formattedName,
      message.authorObj?.pushname,
      message.authorObj?.name,
      message.contact?.formattedName,
      message.contact?.pushname,
      message.contact?.name,
      message.notifyName,
      message.pushname,
      message.senderName
    ].find(v => typeof v === 'string' && v.trim());
    if (embedded) return sanitizeFilename(embedded);

    const senderWid = message.author || message.sender || message.from || message.id?.participant || message.id?.remote;
    const senderId = widToString(senderWid);
    if (!senderId) return '';
    if (senderNameCache.has(senderId)) return senderNameCache.get(senderId);

    let resolved = '';
    try {
      const contactApi = window.WPP?.contact;
      let contact = null;
      if (typeof contactApi?.get === 'function') contact = await contactApi.get(senderId);
      else if (typeof contactApi?.getContact === 'function') contact = await contactApi.getContact(senderId);

      resolved = sanitizeFilename(
        contact?.formattedName || contact?.pushname || contact?.name || contact?.shortName || ''
      );
    } catch (e) {
      log(`resolveSenderName(): contact lookup failed for ${senderId}: ${e?.message || e}`);
    }

    if (!resolved) resolved = cleanSenderFallback(senderId);
    senderNameCache.set(senderId, resolved);
    return resolved;
  }

function makeFilename({ chatName, senderName, ts, index, mime, caption, extHint, naming, message, kind }) {
  const pad = (n) => String(n).padStart(2, '0');
  let datePart = '';
  if (naming?.useDate) {
    const d = new Date((ts || Math.floor(Date.now() / 1000)) * 1000);
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hms = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    datePart = `_${ymd}_${hms}`;
  }

  let suffix = '';
  if (naming?.captionSuffix && caption) {
     const cap = sanitizeFilename(caption);
    if (cap) suffix += `_${cap}`;
  }
  
  if (naming?.appendOrigNameAll) {
    const orig = message?.filename || message?.fileName || message?.title || message?.name || '';
    const baseOrig = sanitizeFilename(baseNameNoExt(orig)).slice(0, 80);
    if (baseOrig && !suffix.includes(baseOrig)) {
      suffix += `_${baseOrig}`;
    }
  }
  

  let senderPart = '';
  if (naming?.includeSenderName && senderName) {
    const safeSender = sanitizeFilename(senderName).slice(0, 60);
    if (safeSender) senderPart = `_${safeSender}`;
  }

  const base = `${sanitizeFilename(chatName || 'Chat')}${senderPart}${datePart}_${String(index).padStart(4, '0')}${suffix}`;

  // <-- QUI ora message e kind esistono
  let ext = extHint || resolveExt({ message, mime, kind });
  return base + (ext ? '.' + ext : '');
}



  // --- readiness basata sulle API realmente usate ---
  // Nelle versioni recenti di WA-JS webpack.isReady()/isReady() può restare false
  // anche quando WPP.chat è già perfettamente utilizzabile. In quel caso il vecchio
  // controllo introduceva 8 secondi di attesa a ogni comando.
  let wppReadyConfirmed = false;

  async function ensureReady(timeoutMs = 2500) {
    const hasRequiredApis = () => {
      const W = window.WPP;
      return !!(
        W &&
        W.chat &&
        typeof W.chat.list === 'function' &&
        typeof W.chat.getMessages === 'function'
      );
    };

    if (wppReadyConfirmed && hasRequiredApis()) return true;

    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (hasRequiredApis()) {
        wppReadyConfirmed = true;
        return true;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    log('ensureReady: API WPP.chat non ancora disponibili, continuo best-effort');
    return false;
  }

  // --- API: elenco chat ---
  async function listChats() {
    await ensureReady();
    try {
      const list = await window.WPP.chat.list();
     // log(`listChats(): ricevute ${list?.length ?? 0} chat`);
      return (list || []).map(c => ({
        id: c?.id?._serialized || c?.id || '',
        name: c?.formattedTitle || c?.contact?.pushname || c?.contact?.name || c?.name || c?.id?.user || 'Chat'
      }));
    } catch (e) {
      log('listChats() ERROR: ' + (e?.message || e));
      return [];
    }
  }

  // --- API: ottieni statistiche della chat ---
  async function getChatStats(chatId) {
  await ensureReady();
  try {
    log(`getChatStats(): analyzing chatId=${chatId}`);

    const msgChatSer = (m) => {
      const r = m?.id?.remote || m?.id?._remote;
      const rs = r?._serialized || (typeof r === 'string' ? r : '');
      return rs || m?.chatId || m?.chat?.id?._serialized || m?.chat?.id || '';
    };

    // Prova come prima: senza aprire chat
    let msgs = null;
    try {
      msgs = await window.WPP.chat.getMessages(chatId, { count: 10000 });
    } catch (e1) {
      log('getChatStats(): getMessages(10000) failed, retrying with 3000. ' + (e1?.message || e1));
      try {
        msgs = await window.WPP.chat.getMessages(chatId, { count: 3000 });
      } catch (e2) {
        log('getChatStats(): getMessages(3000) failed, retrying with default options. ' + (e2?.message || e2));
        msgs = await window.WPP.chat.getMessages(chatId);
      }
    }

    // Se torna roba di un'altra chat, inizializza (una sola volta) aprendo la chat e riprova
    if (msgs && msgs.length) {
      const mism = msgs.filter(m => {
        const c = msgChatSer(m);
        return c && c !== chatId;
      });

      if (mism.length && mism.length > Math.floor(msgs.length * 0.6)) {
        log(`getChatStats(): WARN ${mism.length}/${msgs.length} msgs from another chat -> initializing chat and retrying`);
        try {
          if (window.WPP?.chat?.openChatBottom) await window.WPP.chat.openChatBottom(chatId);
          else if (window.WPP?.chat?.openChatAt) await window.WPP.chat.openChatAt(chatId);
          await new Promise(r => setTimeout(r, 250));
          msgs = await window.WPP.chat.getMessages(chatId, { count: 5000 });
        } catch (e3) {
          log('getChatStats(): openChat* retry failed: ' + (e3?.message || e3));
        }
      }

      // Filtra comunque per sicurezza
      msgs = msgs.filter(m => {
        const c = msgChatSer(m);
        return !c || c === chatId;
      });
    }

    if (!msgs || msgs.length === 0) {
      log('getChatStats(): No messages found');
      return { dateRange: 'No messages loaded', totalMedia: 0, images: 0, videos: 0, audio: 0, documents: 0 };
    }

    const mediaMessages = msgs.filter(m => {
      const kind = (m.type || m.mediaType || '').toLowerCase();
      return m.isMedia || m.isMMS || !!m.mediaKey || !!m.mediaData ||
        ['image','video','ptt','audio','document','sticker'].includes(kind);
    });

    let images = 0, videos = 0, audio = 0, documents = 0;
    mediaMessages.forEach(m => {
      const kind = (m.type || m.mediaType || '').toLowerCase();
      if (kind === 'image') images++;
      else if (kind === 'video') videos++;
      else if (kind === 'ptt' || kind === 'audio') audio++;
      else if (kind === 'document') documents++;
    });

    let oldestDate = null, newestDate = null;
    msgs.forEach(m => {
      const ts = m.t || m.timestamp || 0;
      if (ts > 0) {
        if (!oldestDate || ts < oldestDate) oldestDate = ts;
        if (!newestDate || ts > newestDate) newestDate = ts;
      }
    });

    let dateRange = 'Unknown';
    if (oldestDate && newestDate) {
      const formatDate = (ts) => {
        const d = new Date(ts * 1000);
        return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
      };
      dateRange = `${formatDate(oldestDate)} - ${formatDate(newestDate)}`;
    }

    log(`getChatStats(): Found ${mediaMessages.length} media files, date range: ${dateRange}`);

    return { dateRange, totalMedia: mediaMessages.length, images, videos, audio, documents };
  } catch (e) {
    log('getChatStats() ERROR: ' + (e?.message || e));
    return { dateRange: 'Error loading stats', totalMedia: 0, images: 0, videos: 0, audio: 0, documents: 0 };
  }
}


  // --- API: carica più messaggi ---
  async function loadMoreMessages(chatId) {
    await ensureReady();
    try {
      log(`loadMoreMessages(): opening chat ${chatId}`);
      
      // 1. Apri la chat usando WPP.chat.openChatBottom
      try {
        await window.WPP.chat.openChatBottom(chatId);
        log('Chat opened successfully');
      } catch (e) {
        log('openChatBottom error, trying alternative method: ' + e.message);
        // Fallback: usa openChatAt
        await window.WPP.chat.openChatAt(chatId);
      }
      
      // Aspetta che la chat sia caricata
      await new Promise(r => setTimeout(r, 500));
      
      // 2. Trova l'elemento scrollabile
      // Secondo i test dell'utente, l'elemento #4 è quello giusto con queste classi:
      // x10l6tqk x13vifvy x1o0tod xupqr0c x9f619 x78zum5 xdt5ytf xh8yej3 x5yr21d x6ikm8r x1rife3k xjbqb8w x1ewm37j
      
      log('Searching for scroll container...');
      
      let scrollContainer = null;
      
      // Metodo 1: Cerca il container specifico con le classi dell'elemento #4
      const specificContainer = document.querySelector('.x10l6tqk.x13vifvy.x1o0tod.xupqr0c.x9f619.x78zum5.xdt5ytf.xh8yej3.x5yr21d.x6ikm8r.x1rife3k.xjbqb8w.x1ewm37j');
      if (specificContainer && specificContainer.scrollHeight > specificContainer.clientHeight) {
        scrollContainer = specificContainer;
        log(`Found specific container: scrollHeight=${scrollContainer.scrollHeight}, clientHeight=${scrollContainer.clientHeight}, scrollTop=${scrollContainer.scrollTop}`);
      }
      
      // Metodo 2: Cerca container con classi parziali
      if (!scrollContainer) {
        const partialSelectors = [
          '.x10l6tqk.x13vifvy',
          '[role="application"]',
          '._aiwn._aiwm'
        ];
        
        for (const selector of partialSelectors) {
          const elements = document.querySelectorAll(selector);
          log(`Checking selector "${selector}": found ${elements.length} elements`);
          
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (el.scrollHeight > el.clientHeight) {
              scrollContainer = el;
              log(`Found scrollable container #${i}: scrollHeight=${el.scrollHeight}, clientHeight=${el.clientHeight}, scrollTop=${el.scrollTop}`);
              break;
            }
          }
          if (scrollContainer) break;
        }
      }
      
      // Metodo 3: Cerca tutti gli elementi scrollabili
      if (!scrollContainer) {
        log('Using fallback: searching all scrollable elements');
        const allElements = document.querySelectorAll('*');
        let scrollables = [];
        
        for (const el of allElements) {
          if (el.scrollHeight > el.clientHeight && el.clientHeight > 200) {
            scrollables.push({
              element: el,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              classes: el.className
            });
          }
        }
        
        log(`Found ${scrollables.length} scrollable elements`);
        
        // Ordina per dimensione (più grande probabilmente è il container principale)
        scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight);
        
        // Log dei primi 5
        scrollables.slice(0, 5).forEach((s, i) => {
          log(`Scrollable #${i}: scrollHeight=${s.scrollHeight}, clientHeight=${s.clientHeight}, classes="${s.classes.substring(0, 50)}"`);
        });
        
        // Usa il 4° o il più grande se ce ne sono meno
        const targetIndex = Math.min(4, scrollables.length - 1);
        if (scrollables[targetIndex]) {
          scrollContainer = scrollables[targetIndex].element;
          log(`Selected scrollable #${targetIndex} as container`);
        }
      }
      
      if (!scrollContainer) {
        log('ERROR: Cannot find scroll container');
        return { ok: false, error: 'Cannot find scroll container' };
      }
      
      log(`Using scroll container: scrollHeight=${scrollContainer.scrollHeight}, clientHeight=${scrollContainer.clientHeight}`);
      
      // 3. SCROLL PROGRESSIVO AGGRESSIVO verso l'alto
      // Forziamo WhatsApp a caricare più messaggi vecchi scrollando progressivamente
      const initialScrollTop = scrollContainer.scrollTop;
      const scrollSteps = 10; // Numero di step per lo scroll
      const scrollAmount = 500; // Pixel per step (totale = 5000 pixel verso l'alto)
      
      log(`Starting aggressive progressive scroll from scrollTop=${initialScrollTop}`);
      
      // Scrolla progressivamente verso l'alto in step, dando tempo a WhatsApp di caricare
      for (let i = 1; i <= scrollSteps; i++) {
        const targetScroll = Math.max(0, scrollContainer.scrollTop - scrollAmount);
        scrollContainer.scrollTop = targetScroll;
        log(`Scroll step ${i}/${scrollSteps}: scrollTop=${scrollContainer.scrollTop}`);
        
        // Aspetta un po' per permettere a WhatsApp di caricare messaggi
        await new Promise(r => setTimeout(r, 200));
      }
      
      // Forza a 0 assoluto
      scrollContainer.scrollTop = 0;
      log(`Final scroll to absolute top: scrollTop=0`);
      
      // Blocca temporaneamente lo scroll automatico di WhatsApp
      let scrollLocked = true;
      const lockScroll = (e) => {
        if (scrollLocked) {
          scrollContainer.scrollTop = 0;
        }
      };
      scrollContainer.addEventListener('scroll', lockScroll);
      
      // Aspetta che il contenuto si carichi completamente
      await new Promise(r => setTimeout(r, 1500));
      
      // Forza di nuovo a top (WhatsApp potrebbe aver ri-scrollato)
      scrollContainer.scrollTop = 0;
      await new Promise(r => setTimeout(r, 500));
      
      // 4. Cerca e clicca il pulsante "Load more messages"
      // Il pulsante ha questa struttura specifica:
      // <button class="x1bvqhpb x6f6fmj x1b9z3ur x9f619 x1rg5ohu x1okw0bk x193iq5w x123j3cw xpdmqnj x10b6aqq x1g0dm76 x13a8xbf xdod15v x2b8uid xyi3aci xwf5gio x1p453bz x1suzm8a">
      
      let loadMoreBtn = null;
      
      // Metodo 1: Cerca il button specifico con le classi caratteristiche
      const buttons = document.querySelectorAll('button.x1bvqhpb.x6f6fmj.x1b9z3ur');
      log(`Found ${buttons.length} potential load-more buttons`);
      
      for (const btn of buttons) {
        // Verifica che il button contenga un div con il testo
        const innerDiv = btn.querySelector('div.x78zum5.x6s0dn4.x1r0jzty.x17zd0t2');
        if (innerDiv) {
          const textDiv = innerDiv.querySelector('div');
          if (textDiv && textDiv.textContent.trim().length > 0) {
            // Questo è molto probabilmente il pulsante di caricamento messaggi
            log(`Found candidate button with text: "${textDiv.textContent.substring(0, 50)}..."`);
            loadMoreBtn = btn;
            break;
          }
        }
      }
      
      // Metodo 2: Se non trovato, cerca button con classi parziali e verifica la struttura interna
      if (!loadMoreBtn) {
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
          // Cerca button che contiene div.x78zum5.x6s0dn4
          const innerDiv = btn.querySelector('div.x78zum5.x6s0dn4');
          if (innerDiv) {
            const textDiv = innerDiv.querySelector('div');
            if (textDiv && textDiv.textContent.trim().length > 30) {
              // Il testo deve essere abbastanza lungo (il messaggio tipico è lungo)
              log(`Found alternative button with text: "${textDiv.textContent.substring(0, 50)}..."`);
              loadMoreBtn = btn;
              break;
            }
          }
        }
      }
      
      // Metodo 3: Fallback - cerca button vicino alla parte superiore dello scroll container
      if (!loadMoreBtn) {
        log('Using fallback method: searching near scroll top');
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
          const rect = btn.getBoundingClientRect();
          const text = btn.textContent;
          
          // Il pulsante deve essere:
          // 1. Nella parte superiore visibile (0-400px)
          // 2. Avere testo lungo (il messaggio è tipicamente 40-100 caratteri)
          // 3. NON contenere parole comuni di altri pulsanti (call, menu, etc)
          if (rect.top >= 0 && rect.top < 400 && text.length > 35 && text.length < 150) {
            const lowerText = text.toLowerCase();
            
            // Escludi pulsanti comuni che non sono il "load more"
            const excludeKeywords = ['call', 'video', 'menu', 'search', 'emoji', 'attach', 'send'];
            const hasExcluded = excludeKeywords.some(kw => lowerText.includes(kw));
            
            if (!hasExcluded) {
              log(`Found fallback button at top with text: "${text.substring(0, 50)}..."`);
              loadMoreBtn = btn;
              break;
            }
          }
        }
      }
      
      if (loadMoreBtn) {
        log('Found "Load more" button, preparing to click...');
        
        // Verifica che il button sia visibile e nel DOM
        if (!document.contains(loadMoreBtn)) {
          log('ERROR: Button not in DOM anymore');
          scrollLocked = false;
          scrollContainer.removeEventListener('scroll', lockScroll);
          return { ok: false, error: 'Button disappeared' };
        }
        
        // Verifica le proprietà di visibilità PRIMA dello scrollIntoView
        let rect = loadMoreBtn.getBoundingClientRect();
        let isVisible = rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight;
        log(`Button visibility check (before scroll): width=${rect.width}, height=${rect.height}, top=${rect.top}, visible=${isVisible}`);
        
        // Se il pulsante NON è visibile, forza lo scroll del container a top
        if (!isVisible || rect.top < 0) {
          log('Button not visible, forcing scroll to top...');
          scrollContainer.scrollTop = 0;
          await new Promise(r => setTimeout(r, 300));
          
          // Ri-controlla la visibilità
          rect = loadMoreBtn.getBoundingClientRect();
          isVisible = rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight;
          log(`Button visibility check (after forced scroll): width=${rect.width}, height=${rect.height}, top=${rect.top}, visible=${isVisible}`);
        }
        
        // Se ANCORA non visibile, prova scrollIntoView
        if (!isVisible || rect.top < 0) {
          log('Button still not visible, using scrollIntoView...');
          loadMoreBtn.scrollIntoView({ behavior: 'instant', block: 'start' });
          await new Promise(r => setTimeout(r, 300));
          
          rect = loadMoreBtn.getBoundingClientRect();
          isVisible = rect.width > 0 && rect.height > 0 && rect.top >= 0;
          log(`Button visibility check (after scrollIntoView): width=${rect.width}, height=${rect.height}, top=${rect.top}, visible=${isVisible}`);
        }
        
        if (!isVisible) {
          log('ERROR: Button still not visible after all attempts');
          scrollLocked = false;
          scrollContainer.removeEventListener('scroll', lockScroll);
          return { ok: false, error: 'Button not visible' };
        }
        
        // Verifica che il button sia ancora presente dopo tutti gli scroll
        if (!document.contains(loadMoreBtn)) {
          log('ERROR: Button disappeared after scroll attempts');
          scrollLocked = false;
          scrollContainer.removeEventListener('scroll', lockScroll);
          return { ok: false, error: 'Button disappeared after scroll' };
        }
        
        // OK, ora possiamo cliccare
        log('Button is visible and ready, clicking...');
        
        // Prova sia click() che dispatchEvent per massima compatibilità
        try {
          // Metodo 1: Click diretto
          loadMoreBtn.click();
          log('Clicked load more button (direct click)');
        } catch (e) {
          log('Direct click failed: ' + e.message);
          
          // Metodo 2: MouseEvent dispatch
          try {
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true
            });
            loadMoreBtn.dispatchEvent(clickEvent);
            log('Clicked load more button (dispatchEvent)');
          } catch (e2) {
            log('dispatchEvent click also failed: ' + e2.message);
            scrollLocked = false;
            scrollContainer.removeEventListener('scroll', lockScroll);
            return { ok: false, error: 'Both click methods failed' };
          }
        }
        
        // Mantieni lo scroll bloccato ancora per un po' dopo il click
        await new Promise(r => setTimeout(r, 1000));
        
        // Sblocca lo scroll
        scrollLocked = false;
        scrollContainer.removeEventListener('scroll', lockScroll);
        log('Scroll unlocked');
        
        // Aspetta che i messaggi vengano caricati
        await new Promise(r => setTimeout(r, 3000));
        
        log('Load more completed successfully');
        return { ok: true, clicked: true };
      } else {
        log('No "Load more" button found - all messages may already be loaded');
        scrollLocked = false;
        scrollContainer.removeEventListener('scroll', lockScroll);
        return { ok: true, clicked: false, message: 'No load more button found' };
      }
      
    } catch (e) {
      log('loadMoreMessages() ERROR: ' + (e?.message || e));
      return { ok: false, error: e.message };
    }
  }


  // --- filtri ---
  function withinRange(ts, from, to) {
    if (from && ts < from) return false;
    if (to && ts > to) return false;
    return true;
  }
  
  function dayRangeToEpochSeconds(dateStr) {
  // dateStr = 'YYYY-MM-DD'
  if (!dateStr) return { start: undefined, end: undefined };
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = Math.floor(new Date(y, m - 1, d, 0, 0, 0, 0).getTime() / 1000);
  const end   = Math.floor(new Date(y, m - 1, d, 23, 59, 59, 999).getTime() / 1000);
  return { start, end };
}

function withinRange(ts, from, to) {
  if (from != null && ts < from) return false;
  if (to   != null && ts > to)   return false;
  return true;
}

  function baseNameNoExt(name) {
  if (!name) return '';
  const m = String(name).split(/[\\/]/).pop();
  return m.replace(/\.[a-z0-9]{1,10}$/i, '');
}
  
  function extFromFilename(name) {
  if (!name) return '';
  const m = String(name).match(/\.([a-z0-9]{1,10})$/i);
  return m ? m[1].toLowerCase() : '';
}

function extFromMime(mime) {
  const m = (mime || '').toLowerCase();
  if (!m) return '';
  if (m.includes('jpeg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('gif')) return 'gif';
  if (m.includes('webp')) return 'webp';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('mpeg') && m.includes('audio')) return 'mp3';
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('zip')) return 'zip';
  if (m.includes('rar')) return 'rar';
  if (m.includes('7z')) return '7z';
  if (m.includes('csv')) return 'csv';
  if (m.includes('plain')) return 'txt';
  if (m.includes('json')) return 'json';
  if (m.includes('msword')) return 'doc';
  if (m.includes('vnd.openxmlformats-officedocument.wordprocessingml')) return 'docx';
  if (m.includes('vnd.ms-excel')) return 'xls';
  if (m.includes('vnd.openxmlformats-officedocument.spreadsheetml')) return 'xlsx';
  if (m.includes('vnd.ms-powerpoint')) return 'ppt';
  if (m.includes('vnd.openxmlformats-officedocument.presentationml')) return 'pptx';
  return '';
}

/** Restituisce estensione migliore possibile: filename > mimetype > fallback per ptt/document */
function resolveExt({ message, mime, kind }) {
  // 1) dal filename originale del messaggio (meglio di tutto)
  const origName = message?.filename || message?.fileName || message?.title || message?.name || '';
  let ext = extFromFilename(origName);
  if (ext) return ext;

  // 2) dal mimetype
  ext = extFromMime(mime);
  if (ext) return ext;

  // 3) fallback per tipi particolari
  if ((kind === 'ptt' || kind === 'audio') && (!mime || /opus|ogg/.test(mime||''))) return 'ogg';
  if (kind === 'document') return 'bin';

  return '';
}

  
  

  // --- fetch dei messaggi con media (paginando all’indietro) ---
async function fetchMediaMessages({ chatId, types, from, to, estimatedBatch = 200, maxBatches = 20 }) {
  const out = [];
  const seenIds = new Set();
  let anchorId = '';      // SEMPRE stringa _serialized
  let keepGoing = true;
  const wanted = new Set(types || []);
  let batchNo = 0;

  let noNewRepeats = 0;
  let sameAnchorRepeats = 0;

  log(`fetchMediaMessages(): start chatId=${chatId}, types=[${[...wanted].join(',')}], from=${from||'-'}, to=${to||'-'}`);
  fetchMediaMessages.__didOpen = false;

  const msgId = (m) => {
    if (typeof m === 'string') return m;
    const v = m?.id?._serialized ?? m?.id;
    return (typeof v === 'string') ? v : '';
  };

  const msgTs = (m) => (m?.t || m?.timestamp || 0);

  const msgChatSer = (m) => {
    const r = m?.id?.remote || m?.id?._remote;
    const rs = r?._serialized || (typeof r === 'string' ? r : '');
    return rs || m?.chatId || m?.chat?.id?._serialized || m?.chat?.id || '';
  };

  while (keepGoing && batchNo < maxBatches) {
    batchNo++;

const anchorSerPrev =
  (typeof anchorId === 'string') ? anchorId : (anchorId?._serialized || '');

const opts = {
  count: estimatedBatch,
  direction: anchorSerPrev ? 'before' : undefined,
  id: anchorSerPrev || undefined,
  // NOTE: evitare media:'all' (può rompere su alcune chat / build)
};


    let batch = [];
    try {
      batch = await window.WPP.chat.getMessages(chatId, opts);
    } catch (e) {
      log(`getMessages() ERROR batch#${batchNo}: ${e?.message || e}`);
      break;
    }

    const totalRaw = batch?.length || 0;
    log(`DBG requested=${estimatedBatch} got=${totalRaw}`);

    if (!totalRaw) { log(`getMessages() batch#${batchNo}: vuoto, stop`); break; }

    // Se WPP restituisce messaggi di un'altra chat (capita quando la chat non è inizializzata),
    // NON mischiare mai: filtra e, se quasi tutto è mismatch nel primo batch, apri la chat e riparti una sola volta.
    const mism = (batch || []).filter(m => {
      const c = msgChatSer(m);
      return c && c !== chatId;
    });

    if (mism.length) {
      log(`WARN batch#${batchNo}: ${mism.length}/${totalRaw} messages belong to another chat (sampleChat=${msgChatSer(mism[0])||'?'})`);

      // Filtra subito per sicurezza
      batch = (batch || []).filter(m => {
        const c = msgChatSer(m);
        return !c || c === chatId;
      });

      if (batchNo === 1 && batch.length < Math.max(1, Math.floor(totalRaw * 0.2)) && !fetchMediaMessages.__didOpen) {
        fetchMediaMessages.__didOpen = true;
        try {
          if (window.WPP?.chat?.openChatBottom) await window.WPP.chat.openChatBottom(chatId);
          else if (window.WPP?.chat?.openChatAt) await window.WPP.chat.openChatAt(chatId);
          await new Promise(r => setTimeout(r, 250));

          // reset scan e riparti
          anchorId = '';
          batchNo = 0;
          out.length = 0;
          seenIds.clear();
          noNewRepeats = 0;
          sameAnchorRepeats = 0;
          log('INFO: chat initialized by openChat*; restarting scan');
          continue;
        } catch (e) {
          log('openChat* failed during fetchMediaMessages: ' + (e?.message || e));
        }
      }
    }

    // Rimuovi l'anchor se WPP la reinclude
    if (anchorSerPrev) {
      const before = batch.length;
      batch = (batch || []).filter(m => msgId(m) !== anchorSerPrev);
      if (before !== batch.length) log(`getMessages() batch#${batchNo}: removed anchor ${anchorSerPrev}`);
      if (!batch.length) { log(`getMessages() batch#${batchNo}: empty after anchor-filter, stop`); break; }
    }

    let kept = 0;
    let newIdsInBatch = 0;

    for (const m of batch) {
      const id = msgId(m);
      if (!id) continue;
      if (seenIds.has(id)) continue;

      newIdsInBatch++;

      const ts = msgTs(m);
      const kind = (m.type || m.mediaType || '').toLowerCase();

      const isMedia =
        m.isMedia || m.isMMS || !!m.mediaKey || !!m.mediaData ||
        ['image','video','ptt','audio','document','sticker'].includes(kind);

      // marca come visto comunque, per evitare loop
      if (!isMedia) { seenIds.add(id); continue; }
      if (!withinRange(ts, from, to)) { seenIds.add(id); continue; }

      const norm = kind === 'ptt' ? 'audio' : kind;
      if (wanted.size && !wanted.has(norm) && !(wanted.has('ptt') && kind === 'ptt')) {
        seenIds.add(id);
        continue;
      }

      out.push(m);
      seenIds.add(id);
      kept++;
    }

    const first5 = batch.slice(0, 5).map(m => `${msgId(m)}:${(m.type||m.mediaType||'').toLowerCase()}:${msgTs(m)}`).join(' , ');
    log(`getMessages() batch#${batchNo}: tot=${totalRaw}, kept=${kept}, newIds=${newIdsInBatch}, anchorPrev=${anchorSerPrev||'-'} | sample[5]= ${first5}`);

    // BONUS: ordine e range
    try {
      log(`DBG batch order#${batchNo}: first=${msgId(batch[0])}@${msgTs(batch[0])} | last=${msgId(batch[batch.length-1])}@${msgTs(batch[batch.length-1])}`);
    } catch {}

    // ---- CURSOR ROBUSTO: usa SEMPRE il messaggio più vecchio (min timestamp) ----
    // Questo evita l'overlap enorme quando WPP ti restituisce array in ordine diverso.
    let cursorMsg = batch[0];
    let cursorTs = msgTs(cursorMsg);

    for (const x of batch) {
      const t = msgTs(x);
      // scegli il minimo t valido
      if (t && (!cursorTs || t < cursorTs)) {
        cursorMsg = x;
        cursorTs = t;
      }
    }

    // fallback: se timestamp mancano/zero ovunque, usa last (meglio di niente)
    if (!cursorTs) {
      cursorMsg = batch[batch.length - 1];
      cursorTs = msgTs(cursorMsg);
    }

    const cursorSer = msgId(cursorMsg);
    if (!cursorSer) {
      log(`batch#${batchNo}: cursorSer vuoto, stop`);
      break;
    }

    // aggiorna anchor PRIMA dei check
    anchorId = cursorSer;

    // stop se siamo oltre il range richiesto
    const maxTs = Math.max(...batch.map(x => msgTs(x) || 0));
    if (from && maxTs < from) {
      log(`batch#${batchNo}: maxTs<from (${maxTs}<${from}), tutti i messaggi troppo vecchi, stop`);
      break;
    }

    // overlap enorme: consenti 2 batch consecutivi senza nuovi ID
    if (!newIdsInBatch) {
      noNewRepeats++;
      log(`batch#${batchNo}: nessun ID nuovo, noNewRepeats=${noNewRepeats}`);
      if (noNewRepeats >= 2) {
        log(`batch#${batchNo}: nessun ID nuovo 2x, stop`);
        break;
      }
    } else {
      noNewRepeats = 0;
    }

    // loop: anchor invariato
    if (anchorSerPrev && anchorSerPrev === anchorId) {
      sameAnchorRepeats++;
      log(`batch#${batchNo}: anchor invariato (${anchorId}), sameAnchorRepeats=${sameAnchorRepeats}`);
      if (sameAnchorRepeats >= 2) {
        log(`batch#${batchNo}: anchor invariato 2x, stop`);
        break;
      }
    } else {
      sameAnchorRepeats = 0;
    }
  }

  log(`fetchMediaMessages(): DONE, trovati ${out.length} media unici`);
  return out;
}



function patchWppDownloadMedia() {
  const W = window.WPP?.chat;
  if (!W || W.__wamdDownloadPatched) return;

  function getMediaData(msg) {
    return msg?.mediaData || msg?._mediaData || null;
  }

  function neutralizeBrokenBlob(msg, label) {
    const md = getMediaData(msg);
    if (!md) return;

    if (md.mediaBlob && !md.mediaBlob.__wamdSafePatched) {
      const origForce =
        typeof md.mediaBlob.forceToBlob === 'function'
          ? md.mediaBlob.forceToBlob.bind(md.mediaBlob)
          : null;

      md.mediaBlob.forceToBlob = function () {
        try {
          return origForce ? origForce() : null;
        } catch (e) {
          const emsg = String(e?.message || e || '');
          if (/msgChunks|forceToBlob|Cannot read properties of undefined/i.test(emsg)) {
            log(`patchWppDownloadMedia(): neutralized forceToBlob crash for ${label}`);
            return null;
          }
          throw e;
        }
      };

      md.mediaBlob.__wamdSafePatched = true;
    }

    try {
      if (md.mediaBlob) md.mediaBlob = null;
    } catch {}
  }

  const origDownloadMediaMessage =
    typeof W.downloadMediaMessage === 'function'
      ? W.downloadMediaMessage.bind(W)
      : null;

  if (origDownloadMediaMessage) {
    W.downloadMediaMessage = async function (msg) {
      const id =
        msg?.id?._serialized ||
        msg?.id ||
        msg?._serialized ||
        msg;

      log(`patchWppDownloadMedia(): ENTER downloadMediaMessage ${id}`);

      neutralizeBrokenBlob(msg, id);

      try {
        return await origDownloadMediaMessage(msg);
      } catch (e) {
        const emsg = String(e?.message || e || '');
        if (/msgChunks|forceToBlob|Cannot read properties of undefined/i.test(emsg)) {
          log(`patchWppDownloadMedia(): retry downloadMediaMessage after msgChunks for ${id}`);
          neutralizeBrokenBlob(msg, id);
          return await origDownloadMediaMessage(msg);
        }
        throw e;
      }
    };
  }

  const origDownloadMedia =
    typeof W.downloadMedia === 'function'
      ? W.downloadMedia.bind(W)
      : null;

  if (origDownloadMedia) {
    W.downloadMedia = async function (idOrMsg) {
      const id =
        idOrMsg?.id?._serialized ||
        idOrMsg?.id ||
        idOrMsg?._serialized ||
        idOrMsg;

      log(`patchWppDownloadMedia(): ENTER downloadMedia ${id}`);
      return await origDownloadMedia(idOrMsg);
    };
  }

  W.__wamdDownloadPatched = true;
  log('patchWppDownloadMedia(): applied SIMPLE override');
}


async function getBlobFromMessageCaches(message, idForLog) {
  const md = message?.mediaData || message?._mediaData || null;
  if (!md) return null;

  const mimetype = md.mimetype || message?.mimetype || 'application/octet-stream';
  const filehash = md.filehash || message?.filehash || null;

  // 1) LruMediaStore
  try {
    const LruMediaStore =
      window.LruMediaStore ||
      window.Store?.LruMediaStore ||
      window.WPP?.whatsapp?.LruMediaStore;

    if (filehash && LruMediaStore?.get) {
      const cachedBuffer = await LruMediaStore.get(filehash).catch(() => null);
      if (cachedBuffer) {
        const ab =
          cachedBuffer instanceof ArrayBuffer
            ? cachedBuffer
            : cachedBuffer?.buffer instanceof ArrayBuffer
            ? cachedBuffer.buffer
            : null;

        if (ab) {
          log(`getBlobFromMessageCaches(): LruMediaStore hit for ${idForLog}`);
          return new Blob([ab], { type: mimetype });
        }
      }
    }
  } catch (e) {}

  // 2) MediaBlobCache
  try {
    const MediaBlobCache =
      window.MediaBlobCache ||
      window.Store?.MediaBlobCache ||
      window.WPP?.whatsapp?.MediaBlobCache;

    if (filehash && MediaBlobCache?.has?.(filehash)) {
      const blob = MediaBlobCache.get(filehash);
      if (blob) {
        log(`getBlobFromMessageCaches(): MediaBlobCache hit for ${idForLog}`);
        return blob;
      }
    }
  } catch (e) {}

  // 3) mediaBlob classico
  try {
    if (md.mediaBlob && typeof md.mediaBlob.forceToBlob === 'function') {
      try {
        const blob = md.mediaBlob.forceToBlob();
        if (blob) {
          log(`getBlobFromMessageCaches(): mediaBlob hit for ${idForLog}`);
          return blob;
        }
      } catch (e) {
        const emsg = String(e?.message || e || '');
        if (/msgChunks|forceToBlob|Cannot read properties of undefined/i.test(emsg)) {
          log(`getBlobFromMessageCaches(): broken mediaBlob ignored for ${idForLog}`);
          try { md.mediaBlob = null; } catch (_) {}
          return null;
        }
        throw e;
      }
    }
  } catch (e) {}

  return null;
}





let dlFnName = null;

async function downloadAnyMedia(message) {
  patchWppDownloadMedia();

  const W = window.WPP?.chat || {};
  const id = message?.id?._serialized || message?.id || message?._serialized || message;

  // PRIMA scelta: metodo del message model
  if (message && typeof message === 'object' && typeof message.downloadMedia === 'function') {
    if (!dlFnName) {
      dlFnName = 'message.downloadMedia()';
      log(`downloadAnyMedia(): funzione selezionata = ${dlFnName}`);
    }

    const md = message.mediaData || message._mediaData || null;

    // neutralizza blob corrotto prima del download
    try {
      if (md?.mediaBlob && typeof md.mediaBlob.forceToBlob === 'function' && !md.mediaBlob.__wamdSafePatched) {
        const origForce = md.mediaBlob.forceToBlob.bind(md.mediaBlob);
        md.mediaBlob.forceToBlob = function () {
          try {
            return origForce();
          } catch (e) {
            const emsg = String(e?.message || e || '');
            if (/msgChunks|forceToBlob|Cannot read properties of undefined/i.test(emsg)) {
              log(`downloadAnyMedia(): neutralized forceToBlob on message model for ${id}`);
              return null;
            }
            throw e;
          }
        };
        md.mediaBlob.__wamdSafePatched = true;
      }
    } catch {}

    try { if (md?.mediaBlob) md.mediaBlob = null; } catch {}

    // prima controlla se il blob è già disponibile da qualche parte
    let blob = await getBlobFromMessageCaches(message, id);
    if (blob) return blob;

    await message.downloadMedia({
      downloadEvenIfExpensive: true,
      rmrReason: 1,
      isUserInitiated: true,
    });

    // piccola attesa: alcune build aggiornano la cache async
    await new Promise(r => setTimeout(r, 250));

    // riprova cercando in TUTTE le cache, non solo mediaBlob
    blob = await getBlobFromMessageCaches(message, id);
    if (blob) return blob;

    // seconda attesa breve e ultimo retry
    await new Promise(r => setTimeout(r, 400));
    blob = await getBlobFromMessageCaches(message, id);
    if (blob) return blob;

    throw new Error(`message.downloadMedia() completed but no blob available in caches for ${id}`);
  }

  // fallback secondario: API WPP.chat
  if (!dlFnName) {
    if (typeof W.downloadMediaMessage === 'function') dlFnName = 'downloadMediaMessage(message)';
    else if (typeof W.downloadMedia === 'function') dlFnName = 'downloadMedia(id)';
    else if (typeof W.downloadMessage === 'function') dlFnName = 'downloadMessage(id)';
    else dlFnName = 'NONE';
    log(`downloadAnyMedia(): funzione selezionata = ${dlFnName}`);
  }

  if (dlFnName === 'downloadMediaMessage(message)') return await W.downloadMediaMessage(message);
  if (dlFnName === 'downloadMedia(id)') return await W.downloadMedia(id);
  if (dlFnName === 'downloadMessage(id)') return await W.downloadMessage(id);

  throw new Error('Nessuna API downloadMedia* disponibile nella build corrente');
}
 
 
 
  
async function safeDownloadBlob(m, { timeoutMs = 45000, retries = 1 } = {}) {
  const mid = m?.id?._serialized || m?.id || '';
  const kind = (m.type || m.mediaType || '').toLowerCase();

  for (let attempt = 1; attempt <= (retries + 1); attempt++) {
    try {
      const blob = await withTimeout(
        downloadAnyMedia(m),
        timeoutMs,
        `downloadAnyMedia kind=${kind} id=${mid} attempt=${attempt}`
      );

      // blob non valido o vuoto = media non più disponibile / preview / ecc.
      if (!blob || typeof blob.arrayBuffer !== 'function') {
        throw new Error('download returned invalid blob');
      }
      if (typeof blob.size === 'number' && blob.size === 0) {
        throw new Error('blob size = 0 (media not available)');
      }

      return blob;
    } catch (e) {
      log(`SKIP candidate (attempt ${attempt}): id=${mid}, kind=${kind} -> ${e?.message || e}`);
      if (attempt <= retries) await new Promise(r => setTimeout(r, 400));
    }
  }

  return null; // da saltare
}
  
  

  // --- Download diretto con Blob URL (supporta file grandi) ---
async function postDownload({ arrayBuffer, filename, mime }) {
  try {
    // Crea blob direttamente dall'arrayBuffer
    const blob = new Blob([arrayBuffer], { type: mime || 'application/octet-stream' });
    
    // Crea URL temporaneo per il blob
    const blobUrl = URL.createObjectURL(blob);
    
    // Crea elemento <a> per scaricare
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    // Trigger download
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 100);
    
    log(`download direct: ${filename} (${blob.size}B)`);
    return { ok: true };
  } catch (e) {
    log(`download ERROR: ${e?.message || e}`);
    return { ok: false, error: String(e?.message || e) };
  }
}


// --- Minimal ZIP (STORE) writer ---
function crc32(buf) {
  // table
  const table = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  let crc = 0 ^ (-1);
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function strToUtf8Bytes(str) {
  return new TextEncoder().encode(str);
}
function u32(n){ const a = new Uint8Array(4); const dv=new DataView(a.buffer); dv.setUint32(0, n>>>0, true); return a; }
function u16(n){ const a = new Uint8Array(2); const dv=new DataView(a.buffer); dv.setUint16(0, n & 0xFFFF, true); return a; }

function writeLocalHeader(nameBytes, crc, size) {
  const arr = [];
  arr.push(u32(0x04034b50));     // signature
  arr.push(u16(20));             // version needed
  arr.push(u16(0));              // flags
  arr.push(u16(0));              // method = 0 (store)
  arr.push(u16(0));              // mod time
  arr.push(u16(0));              // mod date
  arr.push(u32(crc));            // crc32
  arr.push(u32(size));           // comp size
  arr.push(u32(size));           // uncomp size
  arr.push(u16(nameBytes.length));
  arr.push(u16(0));              // extra len
  arr.push(nameBytes);
  return concat(arr);
}
function writeCentralHeader(nameBytes, crc, size, offset) {
  const arr = [];
  arr.push(u32(0x02014b50));     // signature
  arr.push(u16(20));             // version made
  arr.push(u16(20));             // version needed
  arr.push(u16(0));              // flags
  arr.push(u16(0));              // method
  arr.push(u16(0));              // mod time
  arr.push(u16(0));              // mod date
  arr.push(u32(crc));            // crc32
  arr.push(u32(size));           // comp size
  arr.push(u32(size));           // uncomp size
  arr.push(u16(nameBytes.length));
  arr.push(u16(0));              // extra len
  arr.push(u16(0));              // comment len
  arr.push(u16(0));              // disk start
  arr.push(u16(0));              // int attrs
  arr.push(u32(0));              // ext attrs
  arr.push(u32(offset));         // local header offset
  arr.push(nameBytes);
  return concat(arr);
}
function writeEOCD(count, cdSize, cdOffset) {
  const arr = [];
  arr.push(u32(0x06054b50));     // signature
  arr.push(u16(0));              // disk number
  arr.push(u16(0));              // central dir disk
  arr.push(u16(count));          // entries on this disk
  arr.push(u16(count));          // total entries
  arr.push(u32(cdSize));         // central dir size
  arr.push(u32(cdOffset));       // central dir offset
  arr.push(u16(0));              // comment len
  return concat(arr);
}
function concat(parts) {
  let len = 0;
  for (const p of parts) len += p.length || p.byteLength || 0;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    const u8 = p instanceof Uint8Array ? p : new Uint8Array(p);
    out.set(u8, off);
    off += u8.length;
  }
  return out;
}

async function makeZip(entries) {
  // entries: [{name: 'file.ext', bytes: Uint8Array}]
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = strToUtf8Bytes(e.name);
    const data = e.bytes instanceof Uint8Array ? e.bytes : new Uint8Array(e.bytes);
    const crc = crc32(data);
    const lh = writeLocalHeader(nameBytes, crc, data.length);
    const localRec = concat([lh, data]);
    locals.push(localRec);

    const ch = writeCentralHeader(nameBytes, crc, data.length, offset);
    centrals.push(ch);

    offset += localRec.length;
  }

  const cd = concat(centrals);
  const eocd = writeEOCD(entries.length, cd.length, offset);
  const zip = concat([...locals, cd, eocd]);
  return zip;
}




async function downloadMessages({ chatId, chatsFriendlyMap, types, from, to, naming, pack }) {
  await ensureReady();

  if (!chatId) {
    log('downloadMessages(): No chat selected');
    return { count: 0 };
  }

  log(`downloadMessages(): chatId=${chatId}, types=[${(types||[]).join(',')}], from=${from||'-'}, to=${to||'-'}, useDate=${!!naming?.useDate}, includeSenderName=${!!naming?.includeSenderName}, captionSuffix=${!!naming?.captionSuffix}, saveAsZip=${!!pack?.saveAsZip}`);

 // const msgs = await fetchMediaMessages({ chatId, types, from, to });
  
  const msgs = await fetchMediaMessages({
  chatId,
  types,
  from,
  to,
estimatedBatch: pack?.deepScan ? 1000 : 700,
maxBatches: pack?.deepScan ? 200 : 80
});


  
  
  
  if (!msgs.length) {
    log('downloadMessages(): No media to download (check your filters)');
    return { count: 0 };
  }
  
// Pro Mode: Unlimited downloads (no 25 file cap)
const isProUser = true;
const cap = Infinity;

let work = msgs;
let capped = false;

  const chatName = chatsFriendlyMap.get(chatId) || 'Chat';
  let idx = 0;
  let saved = 0;

  if (pack?.saveAsZip) {
    // Accumula per zip
    const entries = [];
    for (const m of work) {
      if (!isProUser && saved >= cap) {
        capped = true;
        log(`FREE: cap reached (${saved}/${cap}). ZIP collection stopped.`);
        break;
      }
      idx++;
      const mid = m?.id?._serialized || m?.id || '';
      const kind = (m.type || m.mediaType || '').toLowerCase();
      const ts = m.t || m.timestamp || Math.floor(Date.now()/1000);
      log(`zip collect #${idx}: id=${mid}, kind=${kind}, ts=${ts}`);
      
      
// DEBUG: stampa solo per quelli “problematici” (consigliato)

/*  
console.log({
    id: m?.id?._serialized,
    type: m?.type,
    mediaKey: m?.mediaKey,
    directPath: m?.directPath,
    clientUrl: m?.clientUrl,
    deprecatedMms3Url: m?.deprecatedMms3Url,
    mediaData: m?.mediaData || m?._mediaData
  });
 */  
 
 /*
 if (kind === 'video' || kind === 'document') {
  console.log('stage candidates', {
    id: mid,
    keys: Object.keys(m?.mediaData || {}).filter(k => k.toLowerCase().includes('stage')),
    md: m?.mediaData
  });
}
 */

      if (isProbablyUnavailableByMessage(m)) {
log(`SKIPPED fast(MSG): id=${mid} kind=${kind} (not ready/unavailable)`);
  continue;
}

      try {

        const blob = await safeDownloadBlob(m, { timeoutMs: getTimeoutForMedia(m), retries: 0 });
if (!blob) {
  log(`SKIPPED: id=${mid} kind=${kind} (unavailable/timeout)`);
  continue;
}

        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const mime = blob.type || m.mimetype || 'application/octet-stream';
        const senderName = naming?.includeSenderName ? await resolveSenderName(m) : '';
const filename = makeFilename({
  chatName,
  senderName,
  ts,
  index: idx,
  mime,
  caption: m.caption || m.body || '',
  extHint: '',
  naming,
  message: m,
  kind: kind
});

        log(`zip add: ${filename} (${bytes.length}B)`);
        entries.push({ name: filename, bytes });
        saved++;
      } catch (e) {
        log(`ERROR collect id=${mid}: ${e?.message || e}`);
      }
    }
    
    if (!entries.length) {
  log('ZIP: nessun file valido da includere (tutti non disponibili o falliti).');
  return { count: 0, zip: true, capped };
}

    // Build ZIP
    const zipBytes = await makeZip(entries);
    const zipName = `${sanitizeFilename(chatName)}_media.zip`;
    log(`zip build: ${entries.length} files, size=${zipBytes.length}B`);

    // Scarica lo zip (base64 via postDownload)
    const res = await postDownload({ arrayBuffer: zipBytes.buffer, filename: zipName, mime: 'application/zip' });
    if (!res?.ok) log(`ACK ERROR ZIP: ${res?.error || 'unknown'}`);
    return { count: saved, zip: true, capped };
  }

  // Scarico singolarmente
  for (const m of work) {
    if (!isProUser && saved >= cap) {
      capped = true;
      log(`FREE: cap reached (${saved}/${cap}). Download stopped.`);
      break;
    }
    idx++;
    const mid = m?.id?._serialized || m?.id || '';
    const kind = (m.type || m.mediaType || '').toLowerCase();
    const ts = m.t || m.timestamp || Math.floor(Date.now()/1000);
    log(`download loop #${idx}: id=${mid}, kind=${kind}, ts=${ts}`);



   
    if (isProbablyUnavailableByMessage(m)) {
  log(`SKIPPED fast(MSG): id=${mid} kind=${kind} (missing media info)`);
  continue;
}


    try {

    
      const blob = await safeDownloadBlob(m, { timeoutMs: getTimeoutForMedia(m), retries: 0 });
if (!blob) {
  log(`SKIPPED: id=${mid} kind=${kind} (unavailable/timeout)`);
  continue;
}

      const arrayBuffer = await blob.arrayBuffer();
      const mime = blob.type || m.mimetype || 'application/octet-stream';
      const senderName = naming?.includeSenderName ? await resolveSenderName(m) : '';
const filename = makeFilename({
  chatName,
  senderName,
  ts,
  index: idx,
  mime,
  caption: m.caption || m.body || '',
  extHint: '',
  naming,
  message: m,
  kind: kind
});

      log(`saving: ${filename} (mime=${mime}, size=${arrayBuffer.byteLength}B)`);
      const ack = await postDownload({ arrayBuffer, filename, mime });

      if (ack?.ok) {
        saved++;
        log(`DONE: ${filename}`);
      } else {
        log(`ACK ERROR for ${filename}: ${ack?.error || 'unknown'}`);
      }
    } catch (e) {
      log(`ERROR download id=${mid}: ${e?.message || e}`);
    }
  }

  log(`downloadMessages(): COMPLETATO, files salvati=${saved}`);
  return { count: saved, capped };
}

  // --- handler messaggi dal popup (via content.js bridge) ---
// --- handler messaggi dal popup (via content.js bridge) ---
window.addEventListener('message', async (ev) => {
  const { data } = ev;
  if (!data || data.__from !== 'wamd:inpage') return;

  if (data.type === 'popup:cmd') {
    const { cmd, payload } = data;

    try {
      if (cmd === 'listChats') {
        const list = await listChats();
        window.postMessage(
          { __from: 'wamd:inpage', type: 'inpage:resp', cmd, payload: list },
          '*'
        );
        return;
      }

      if (cmd === 'getStats') {
        const { selectedChatId } = payload || {};
        if (!selectedChatId) {
          window.postMessage(
            { __from: 'wamd:inpage', type: 'inpage:error', cmd, error: 'Missing selectedChatId' },
            '*'
          );
          return;
        }
        const stats = await getChatStats(selectedChatId);
        window.postMessage(
          { __from: 'wamd:inpage', type: 'inpage:resp', cmd, payload: stats },
          '*'
        );
        return;
      }

      if (cmd === 'loadMore') {
        const { selectedChatId } = payload || {};
        if (!selectedChatId) {
          window.postMessage(
            { __from: 'wamd:inpage', type: 'inpage:error', cmd, error: 'Missing selectedChatId' },
            '*'
          );
          return;
        }
        const result = await loadMoreMessages(selectedChatId);
        window.postMessage(
          { __from: 'wamd:inpage', type: 'inpage:resp', cmd, payload: result },
          '*'
        );
        return;
      }

      if (cmd === 'download') {
  const { selectedChatId, types, dateFrom, dateTo, naming, pack } = payload || {};
  const chats = await listChats();
  const map = new Map(chats.map(c => [c.id, c.name]));

  // Calcolo locale inclusivo SOLO se PRO, altrimenti ignora date
  let from, to;
  if (pack?.pro) {
    const rFrom = dateFrom ? dayRangeToEpochSeconds(dateFrom).start : undefined;
    const rTo   = dateTo   ? dayRangeToEpochSeconds(dateTo).end   : undefined;
    from = rFrom; to = rTo;
  } else {
    from = undefined; to = undefined; // FREE: date filter locked
  }

  const res = await downloadMessages({
    chatId: selectedChatId,
    chatsFriendlyMap: map,
    types,
    from,
    to,
    naming,
    pack,
  });

  window.postMessage(
    { __from: 'wamd:inpage', type: 'inpage:resp', cmd, payload: res },
    '*'
  );
  return;
}


      // cmd sconosciuto
      window.postMessage(
        { __from: 'wamd:inpage', type: 'inpage:error', cmd, error: 'Unknown cmd' },
        '*'
      );
    } catch (e) {
      window.postMessage(
        { __from: 'wamd:inpage', type: 'inpage:error', cmd, error: String(e?.message || e) },
        '*'
      );
    }
  }
});



  // --- canale diretto (senza content.js) opzionale ---
window.__WAMD_DIRECT_CMD = async (cmd, payload) => {
  try {
    if (cmd === 'listChats') {
      const list = await listChats();
      return { ok: true, data: list };
    } else if (cmd === 'download') {
      const { selectedChatId, types, dateFrom, dateTo, naming, pack } = payload || {};
      if (!selectedChatId) return { ok: false, error: 'Missing selectedChatId' };

      const chats = await listChats();
      const map = new Map(chats.map(c => [c.id, c.name]));

const { start: f, end: t } = (pack?.pro && (dateFrom || dateTo))
  ? {
      start: dateFrom ? dayRangeToEpochSeconds(dateFrom).start : undefined,
      end:   dateTo   ? dayRangeToEpochSeconds(dateTo).end     : undefined,
    }
  : { start: undefined, end: undefined };

      const res = await downloadMessages({
        chatId: selectedChatId,
        chatsFriendlyMap: map,
        types,
        from: f,
        to: t,
        naming,
        pack, // abilita ZIP anche nel canale diretto
      });
      return { ok: true, data: res };
    }

    return { ok: false, error: 'Unknown cmd' };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
};
})();

