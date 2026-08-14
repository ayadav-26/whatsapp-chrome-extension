// background.js — MV3 safe: usa data: URL; preferisci base64 dal page-script
const dl = chrome.downloads;

// fallback: ArrayBuffer -> base64 (se mai arrivasse ancora un buffer)
function ab2b64(buf) {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'wa:download') {
        const { base64, arrayBuffer, filename, mime } = msg.payload || {};
        if (!filename) { sendResponse({ ok: false, error: 'filename mancante' }); return; }

        let b64 = base64;
        if (!b64 && arrayBuffer) {
          // fallback: se per caso arriva ancora l'ArrayBuffer
          b64 = ab2b64(arrayBuffer);
        }
        if (!b64) { sendResponse({ ok: false, error: 'dati mancanti (base64/arrayBuffer)' }); return; }

        const dataUrl = `data:${mime || 'application/octet-stream'};base64,${b64}`;

        await dl.download({
          url: dataUrl,
          filename,
          saveAs: false,
          conflictAction: 'uniquify'
        });

        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === 'wa:log') {
        console.log('[WAMD]', msg.message);
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === 'wa:n8n_post') {
        const { webhookUrl, payload } = msg.payload || {};
        if (!webhookUrl) {
          sendResponse({ ok: false, error: 'Missing n8n Webhook URL' });
          return;
        }
        try {
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            sendResponse({ ok: false, error: `Webhook HTTP ${res.status}: ${errText.slice(0, 200)}` });
          } else {
            const resData = await res.json().catch(() => ({ status: 'ok' }));
            sendResponse({ ok: true, status: res.status, response: resData });
          }
        } catch (fetchErr) {
          sendResponse({ ok: false, error: `Webhook error: ${fetchErr?.message || fetchErr}` });
        }
        return;
      }

      sendResponse({ ok: false, error: 'unknown msg.type' });
    } catch (e) {
      console.error('BG error:', e);
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true; // async
});
