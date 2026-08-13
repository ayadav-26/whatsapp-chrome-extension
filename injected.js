/**
 * WhatsApp Web Monitor — Main World Injected Script
 * run_at: document_start → intercepts blob creation BEFORE WhatsApp loads.
 *
 * Primary media strategy: enumerate Store.Msg → get clientUrl/directPath + mediaKey → HKDF + AES-CBC → real binary.
 * Same approach as commercial WhatsApp media downloaders.
 */
(function () {
  "use strict";
  if (window.__WA_MONITOR_V3__) return;
  window.__WA_MONITOR_V3__ = true;

  // ── Global state ─────────────────────────────────────────────────────────────
  window.WAMonitorMain = {
    blobCache:   new Map(),   // blobUrl → Blob
    videoChunks: [],          // SourceBuffer ArrayBuffers
    Store: {}                 // will hold Chat, Msg, DownloadManager refs
  };

  // ── 1. Intercept URL.createObjectURL BEFORE WhatsApp runs ────────────────────
  const _origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    const url = _origCreate(obj);
    if (obj instanceof Blob && url) {
      window.WAMonitorMain.blobCache.set(url, obj);
      setTimeout(() => window.WAMonitorMain.blobCache.delete(url), 7_200_000);
    }
    return url;
  };

  // ── 2. Intercept SourceBuffer for video chunk reassembly ─────────────────────
  if (typeof MediaSource !== "undefined" && MediaSource.prototype.addSourceBuffer) {
    const _origASB = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function (mime) {
      const sb = _origASB.apply(this, arguments);
      if (mime && (mime.includes("video") || mime.includes("mp4") || mime.includes("avc"))) {
        const _origAB = sb.appendBuffer;
        sb.appendBuffer = function (buf) {
          try {
            const copy = ArrayBuffer.isView(buf)
              ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
              : buf.slice(0);
            window.WAMonitorMain.videoChunks.push(copy);
          } catch (_) {}
          return _origAB.apply(this, arguments);
        };
      }
      return sb;
    };
  }

  // ── 3. Load WhatsApp webpack stores ──────────────────────────────────────────
  const S = window.WAMonitorMain.Store;

  function tryLoadStores() {
    if (S.Msg && S.Chat) return true;
    const wc = window.webpackChunkwhatsapp_web_client;
    if (!Array.isArray(wc)) return false;

    let req;
    try {
      wc.push([[Symbol()], {}, (r) => { req = r; }]);
    } catch (_) { return false; }
    if (!req || !req.m) return false;

    for (const id of Object.keys(req.m)) {
      let mod;
      try { mod = req(id); } catch (_) { continue; }
      if (!mod || typeof mod !== "object") continue;

      const candidates = Object.values(mod).concat(
        mod.default ? Object.values(mod.default) : []
      ).concat([mod, mod.default]);

      for (const exp of candidates) {
        if (!exp || typeof exp !== "object") continue;

        // Store.Msg — message collection
        if (!S.Msg && typeof exp.get === "function" && typeof exp.getModels === "function") {
          try {
            const m = exp.getModels();
            if (Array.isArray(m) && m.length && (m[0].body !== undefined || m[0].type !== undefined)) {
              S.Msg = exp;
            }
          } catch (_) {}
        }
        if (!S.Msg && exp.Msg && typeof exp.Msg.get === "function") S.Msg = exp.Msg;

        // Store.Chat — chat collection
        if (!S.Chat && typeof exp.get === "function" && typeof exp.getModels === "function") {
          try {
            const c = exp.getModels();
            if (Array.isArray(c) && c.length && (c[0].formattedTitle !== undefined || c[0].isGroup !== undefined)) {
              S.Chat = exp;
            }
          } catch (_) {}
        }
        if (!S.Chat && exp.Chat && typeof exp.Chat.get === "function") S.Chat = exp.Chat;

        // DownloadManager
        if (!S.DownloadManager && typeof exp.downloadMedia === "function") S.DownloadManager = exp;
        if (!S.DownloadManager && exp.default && typeof exp.default.downloadMedia === "function") S.DownloadManager = exp.default;
      }

      if (S.Msg && S.Chat) break;
    }
    return !!(S.Msg || S.Chat);
  }

  // Retry until loaded
  let _retries = 0;
  const _loadInterval = setInterval(() => {
    if (tryLoadStores() && S.Msg || _retries++ > 30) clearInterval(_loadInterval);
  }, 1500);
  tryLoadStores();

  // ── 4. Helpers ────────────────────────────────────────────────────────────────
  const MIME = {
    image:"image/jpeg", IMAGE:"image/jpeg", sticker:"image/webp", STICKER:"image/webp",
    video:"video/mp4",  VIDEO:"video/mp4",  ptv:"video/mp4",
    audio:"audio/ogg",  AUDIO:"audio/ogg",  ptt:"audio/ogg",  VOICE_NOTE:"audio/ogg",
    document:"application/octet-stream", DOCUMENT:"application/octet-stream",
  };
  const HKDF_INFO = {
    image:"WhatsApp Image Keys", IMAGE:"WhatsApp Image Keys", sticker:"WhatsApp Image Keys", STICKER:"WhatsApp Image Keys",
    video:"WhatsApp Video Keys", VIDEO:"WhatsApp Video Keys", ptv:"WhatsApp Video Keys",
    audio:"WhatsApp Audio Keys", AUDIO:"WhatsApp Audio Keys", ptt:"WhatsApp Audio Keys", VOICE_NOTE:"WhatsApp Audio Keys",
    document:"WhatsApp Document Keys", DOCUMENT:"WhatsApp Document Keys",
  };

  function toKeyBytes(key) {
    if (!key) return null;
    if (key instanceof Uint8Array) return key;
    if (key instanceof ArrayBuffer) return new Uint8Array(key);
    if (Array.isArray(key)) return new Uint8Array(key);
    if (typeof key === "object" && key.buffer instanceof ArrayBuffer) return new Uint8Array(key.buffer, key.byteOffset || 0, key.byteLength);
    if (typeof key === "string") {
      try {
        const bin = atob(key.trim());
        return Uint8Array.from(bin, c => c.charCodeAt(0));
      } catch (_) { return null; }
    }
    return null;
  }

  /**
   * Check magic byte signatures to detect if ArrayBuffer is ALREADY plain unencrypted binary media
   */
  function isPlainMedia(bytes) {
    if (!bytes || bytes.length < 8) return false;
    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
    // GIF: GIF8 (47 49 46 38)
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
    // WEBP / RIFF: 52 49 46 46
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true;
    // MP4: ftyp at index 4-7 (66 74 79 70)
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return true;
    // OGG: OggS (4F 67 67 53)
    if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return true;
    // PDF: %PDF (25 50 44 46)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true;
    return false;
  }

  async function hkdfDecrypt(encBuf, mediaKey, mediaType) {
    try {
      const keyBytes = toKeyBytes(mediaKey);
      if (!keyBytes || keyBytes.length < 32) return null;
      const info   = new TextEncoder().encode(HKDF_INFO[mediaType] || "WhatsApp Video Keys");
      const salt   = new Uint8Array(32);
      const base   = await crypto.subtle.importKey("raw", keyBytes, { name:"HKDF" }, false, ["deriveBits"]);
      const der    = new Uint8Array(await crypto.subtle.deriveBits({ name:"HKDF", hash:"SHA-256", salt, info }, base, 112 * 8));
      const iv     = der.slice(0, 16);
      const encKey = der.slice(16, 48);
      const aes    = await crypto.subtle.importKey("raw", encKey, { name:"AES-CBC" }, false, ["decrypt"]);
      const cipher = encBuf.slice(0, encBuf.byteLength - 10); // strip 10-byte MAC
      return await crypto.subtle.decrypt({ name:"AES-CBC", iv }, aes, cipher);
    } catch (e) { return null; }
  }

  async function fetchAndDecrypt(urlOrPath, mediaKey, mediaType, mimeType) {
    if (!urlOrPath) return null;
    try {
      let fetchUrl = urlOrPath;
      if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
        fetchUrl = "https://mmg.whatsapp.net" + (fetchUrl.startsWith("/") ? "" : "/") + fetchUrl;
      }
      const res = await fetch(fetchUrl, { credentials: "omit" });
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Check if ALREADY plain unencrypted binary media
      if (isPlainMedia(bytes)) {
        return new Blob([arrayBuffer], { type: mimeType || MIME[mediaType] || "application/octet-stream" });
      }

      // Otherwise decrypt via HKDF + AES-CBC
      const decBuf = await hkdfDecrypt(arrayBuffer, mediaKey, mediaType);
      if (!decBuf || decBuf.byteLength < 50) return null;
      return new Blob([decBuf], { type: mimeType || MIME[mediaType] || "application/octet-stream" });
    } catch (e) { return null; }
  }

  function blobToDataUrl(blob) {
    return new Promise(res => {
      const r = new FileReader();
      r.onloadend = () => res(r.result || null);
      r.onerror   = () => res(null);
      r.readAsDataURL(blob);
    });
  }

  // ── 5. Enumerate all media messages from Store.Msg ────────────────────────────
  function getAllMsgs() {
    const store = S.Msg;
    if (!store) return [];
    try {
      if (typeof store.getModels === "function") return store.getModels() || [];
      if (Array.isArray(store.models)) return store.models;
      if (Array.isArray(store._models)) return store._models;
      return Array.from(store.values ? store.values() : []);
    } catch (_) { return []; }
  }

  function buildMediaList(chatIdFilter) {
    const all = getAllMsgs();
    const MEDIA_TYPES = new Set(["image","video","audio","ptt","ptv","document","sticker"]);
    const results = [];

    for (const m of all) {
      if (!MEDIA_TYPES.has(m.type)) continue;

      const clientUrl  = m.clientUrl || m.deprecatedMms3Url || m.mediaData?.clientUrl || "";
      const directPath = clientUrl || m.directPath || m.mediaData?.directPath || "";
      const mediaKey   = m.mediaKey   || m.mediaData?.mediaKey   || "";
      if (!directPath || !mediaKey) continue;

      const chatId = m.id?.remote?._serialized || m.chatId?._serialized || "";
      if (chatIdFilter && chatId && !chatId.includes(chatIdFilter) && !chatId.startsWith(chatIdFilter)) continue;

      const ts = m.t ? new Date(m.t * 1000) : new Date();

      results.push({
        id:          m.id?._serialized   || "",
        chatId:      chatId,
        type:        m.type              || "image",
        directPath:  directPath,
        mediaKey:    mediaKey,
        mimeType:    m.mimetype          || MIME[m.type] || "application/octet-stream",
        fileName:    m.filename          || "",
        caption:     m.caption           || "",
        sender:      m.id?.participant?._serialized || (m.id?.fromMe ? "Me" : chatId),
        timestamp:   ts.toLocaleTimeString("en-US", { hour12:true }),
        dateStr:     ts.toLocaleDateString("en-US"),
        size:        m.size              || 0,
        fromMe:      !!m.id?.fromMe,
      });
    }

    return results;
  }

  // ── 6. Find a single msg model by data-id or serialized id ──────────────────
  function findMsg(identifier, mediaType) {
    const all = getAllMsgs();
    if (!all.length) return null;

    const parts      = (identifier || "").split("_");
    const isDataId   = parts.length >= 3 && (parts[0] === "false" || parts[0] === "true");
    const msgTail    = isDataId ? parts.slice(2).join("_") : identifier;

    const isVideo = ["VIDEO","video","ptv"].includes(mediaType);
    const isDoc   = ["DOCUMENT","document"].includes(mediaType);
    const isImg   = ["IMAGE","image","STICKER","sticker"].includes(mediaType);

    const matches = (m) => {
      const ser = m.id?._serialized || m.id?.id || "";
      return ser === identifier || ser === msgTail || ser.endsWith("_" + msgTail);
    };

    // Strict: type + id
    let found = all.find(m => matches(m) && (
      isVideo ? (m.type === "video" || m.type === "ptv") :
      isDoc   ? m.type === "document" :
      isImg   ? (m.type === "image"  || m.type === "sticker") : true
    ));
    if (found) return found;

    // Loose: id only
    found = all.find(matches);
    if (found) return found;

    // Type-based most recent with CDN data
    const typed = all.filter(m =>
      ((m.directPath || m.clientUrl) && m.mediaKey) && (
        isVideo ? (m.type === "video" || m.type === "ptv") :
        isDoc   ? m.type === "document" :
        isImg   ? (m.type === "image"  || m.type === "sticker") : true
      )
    );
    return typed[typed.length - 1] || null;
  }

  // ── 7. Main media extractor for on-demand single-file download ───────────────
  async function extractOne(identifier, mediaUrl, mediaType, mimeType) {
    const isVideo = ["VIDEO","video","ptv"].includes(mediaType);
    const mime    = mimeType || MIME[mediaType] || "application/octet-stream";

    // A: blobCache (will hit for images loaded AFTER document_start injection)
    const cached = mediaUrl && window.WAMonitorMain.blobCache.get(mediaUrl);
    if (cached && cached.size > 5000 && (!isVideo || !cached.type.startsWith("image/"))) {
      return await blobToDataUrl(cached);
    }

    // B: Store.Msg → CDN fetch → HKDF decrypt (primary for all types)
    const msg = findMsg(identifier, mediaType);
    if (msg) {
      const url = msg.clientUrl || msg.deprecatedMms3Url || msg.directPath || msg.mediaData?.directPath || "";
      const key = msg.mediaKey || msg.mediaData?.mediaKey || "";
      if (url && key) {
        const blob = await fetchAndDecrypt(url, key, mediaType, mime);
        if (blob && blob.size > 100) return await blobToDataUrl(blob);
      }
      // Try WA's own downloader
      const dm = S.DownloadManager;
      if (dm && typeof dm.downloadMedia === "function") {
        try {
          let blob = await dm.downloadMedia({ msg, downloadEvenIfExpensive:true, isUserInitiated:true });
          if (blob instanceof Blob && blob.size > 100) return await blobToDataUrl(blob);
          if (blob?.blob instanceof Blob) return await blobToDataUrl(blob.blob);
        } catch (_) {}
      }
    }

    // C: direct blob URL fetch (fallback for audio/stickers already loaded)
    if (mediaUrl && mediaUrl.startsWith("blob:")) {
      try {
        const r = await fetch(mediaUrl);
        if (r.ok) {
          const b = await r.blob();
          if (b && b.size > 2000 && (!isVideo || !b.type.startsWith("image/"))) {
            return await blobToDataUrl(b);
          }
        }
      } catch (_) {}
    }

    // D: SourceBuffer chunks for streaming video
    if (isVideo && window.WAMonitorMain.videoChunks.length > 0) {
      try {
        const blob = new Blob(window.WAMonitorMain.videoChunks, { type:"video/mp4" });
        if (blob.size > 1000) return await blobToDataUrl(blob);
      } catch (_) {}
    }

    return null;
  }

  // ── 8. Message listener ───────────────────────────────────────────────────────
  window.addEventListener("message", async (event) => {
    const d = event.data;
    if (!d || d.source !== "WA_MONITOR_CONTENT_SCRIPT") return;
    const { action, requestId } = d;

    const reply = (extra) =>
      window.postMessage({ source:"WA_MONITOR_MAIN_WORLD", requestId, ...extra }, "*");

    // Action: Get all media from Store.Msg for a specific chat
    if (action === "GET_MEDIA_LIST") {
      try {
        const list = buildMediaList(d.chatId || "");
        reply({ success:!!list.length, mediaList:list });
      } catch (e) {
        reply({ success:false, mediaList:[], error: e.message });
      }
      return;
    }

    // Action: Direct CDN download + decrypt for a specific media message
    if (action === "DOWNLOAD_MEDIA_DIRECT") {
      try {
        const blob = await fetchAndDecrypt(d.directPath, d.mediaKey, d.type, d.mimeType);
        if (blob && blob.size > 50) {
          const data = await blobToDataUrl(blob);
          reply({ success:true, base64Data:data });
        } else {
          reply({ success:false, base64Data:null, error:"Decryption returned empty" });
        }
      } catch (e) {
        reply({ success:false, base64Data:null, error: e.message });
      }
      return;
    }

    // Action: Legacy single-file fetch (fallback)
    if (action === "FETCH_MAIN_WORLD_MEDIA") {
      try {
        const data = await extractOne(d.messageId, d.mediaUrl, d.mediaType, d.mimeType);
        reply({ success:!!data, base64Data:data, cdnMetadata:null });
      } catch (e) {
        reply({ success:false, base64Data:null, cdnMetadata:null });
      }
      return;
    }

    // Action: CDN metadata only
    if (action === "FETCH_MEDIA_METADATA") {
      const msg = findMsg(d.messageId, d.mediaType);
      const meta = msg ? {
        directPath:  msg.clientUrl  || msg.deprecatedMms3Url || msg.directPath || msg.mediaData?.directPath || "",
        mediaKey:    msg.mediaKey   || msg.mediaData?.mediaKey || "",
        encFilehash: msg.encFilehash || "",
        fileSize:    msg.size       || 0,
        mimetype:    msg.mimetype   || d.mimeType || "",
        cdnUrl:      msg.clientUrl  || msg.deprecatedMms3Url || ("https://mmg.whatsapp.net" + (msg.directPath || "")),
        type:        msg.type       || d.mediaType,
      } : null;
      reply({ success:!!meta, cdnMetadata:meta });
    }
  });

  console.log("[WA Monitor] injected.js v3.1 — Full CDN clientUrl + Magic Byte + HKDF decrypt active.");
})();
