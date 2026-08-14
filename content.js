// content.js — bridge popup <-> pagina + ACK per download
(function () {
  // Pagina -> Estensione (BG/Popup)
  window.addEventListener('message', (ev) => {
    const { data } = ev;
    if (!data || data.__from !== 'wamd:inpage') return;

    // Caso speciale: richiesta di download (serve ACK a pagina)
    if (data.type === 'wa:download') {
      try {
        chrome.runtime.sendMessage(
          { type: 'wa:download', payload: data.payload },
          (res) => {
            // Rispondi al page-script con l'ACK
            try {
              window.postMessage({
                __from: 'wamd:content',
                type: 'wa:download:ack',
                id: data.id,
                res: res || { ok: false, error: chrome.runtime.lastError?.message || 'no response' }
              }, '*');
            } catch {}
          }
        );
      } catch (e) {
        window.postMessage({
          __from: 'wamd:content',
          type: 'wa:download:ack',
          id: data.id,
          res: { ok: false, error: String(e) }
        }, '*');
      }
      return; // IMPORTANTE: non proseguire con l'inoltro generico
    }

    // Caso speciale: richiesta webhook n8n (serve ACK a pagina)
    if (data.type === 'wa:n8n_post') {
      try {
        chrome.runtime.sendMessage(
          { type: 'wa:n8n_post', payload: data.payload },
          (res) => {
            try {
              window.postMessage({
                __from: 'wamd:content',
                type: 'wa:n8n_post:ack',
                id: data.id,
                res: res || { ok: false, error: chrome.runtime.lastError?.message || 'no response' }
              }, '*');
            } catch {}
          }
        );
      } catch (e) {
        window.postMessage({
          __from: 'wamd:content',
          type: 'wa:n8n_post:ack',
          id: data.id,
          res: { ok: false, error: String(e) }
        }, '*');
      }
      return;
    }

    // Inoltro generico (log, risposte inpage->popup, ecc.)
    try {
      chrome.runtime.sendMessage({ __from: 'wamd:content', payload: data });
    } catch {}
  });

  // Popup -> Pagina
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.__to !== 'wamd:content') return;
    // Lightweight ping used by the popup to detect if the receiver exists
    if (msg.payload && msg.payload.type === 'ping') {
      sendResponse({ ok: true, pong: true });
      return;
    }

    try { window.postMessage(msg.payload, '*'); sendResponse({ ok: true }); }
    catch (e) { sendResponse({ ok: false, error: String(e) }); }
  });
})();
