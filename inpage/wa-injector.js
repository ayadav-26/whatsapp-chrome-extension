// inpage/wa-injector.js (LOCAL vendor mode)
(function () {
  const bus = (type, payload) => window.postMessage({ __from: 'wamd:inpage', type, payload }, '*');
  const log = (m) => bus('wa:log', m);

  async function waitReady() {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      try {
        // Verifica le API effettivamente necessarie invece di webpack.isReady(),
        // che nelle versioni recenti di WA-JS può non diventare mai true.
        if (
          window.WPP?.chat &&
          typeof window.WPP.chat.list === 'function' &&
          typeof window.WPP.chat.getMessages === 'function'
        ) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  (async () => {
    try {
      // In LOCAL mode, content.js injects vendor first via blob.
      // If for qualsiasi motivo WPP non c'è ancora ma è stato fornito un blob URL, lo possiamo caricare qui:
      if (!window.WPP && window.__WAMD_WAJS_BLOB_URL) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = window.__WAMD_WAJS_BLOB_URL;
          s.async = false;
          s.onload = () => { res(); s.remove(); };
          s.onerror = (e) => { rej(e); s.remove(); };
          (document.head || document.documentElement).appendChild(s);
        });
      }

      const ok = await waitReady();
      log(ok ? 'WA-JS ready (LOCAL)' : 'WA-JS not ready (LOCAL)');
    } catch (e) {
      log('Injector error (LOCAL): ' + e.message);
    }
  })();
})();
