/**
 * WhatsApp Web Media Downloader Pro - Core Downloader Engine
 * Namespace: window.WAMonitor.MediaDownloader
 * Handles media item scanning, filtering, blob fetching, filename formatting, and client-side ZIP packaging.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.MediaDownloader = {
  isDownloading: false,
  cancelDownload: false,

  /**
   * Helper: Formats custom filename based on template placeholders
   */
  formatFilename: function (item, index, templateStr) {
    const H = window.WAMonitor?.Helpers;
    const clean = (s) => (s ? String(s).replace(/[/\\?%*:|"<>]/g, "_").trim() : "");

    const dateStr = item.timestamp ? clean(item.timestamp.replace(/,/g, "")) : clean(new Date().toISOString().split("T")[0]);
    const chatName = clean(item.chatName || "Chat");
    const sender = clean(item.senderName || "User");
    const mType = item.messageType || item.mediaType || item.mediaCategory || "IMAGE";
    const type = clean(mType);
    const idx = String(index + 1).padStart(3, "0");

    let originalName = item.fileName || "";
    let ext = "";

    if (originalName && originalName.includes(".") && !originalName.endsWith(".bin")) {
      const parts = originalName.split(".");
      ext = parts.pop().toLowerCase();
      originalName = parts.join(".");
    } else {
      const extMap = {
        IMAGE: "jpg",
        VIDEO: "mp4",
        AUDIO: "ogg",
        VOICE_NOTE: "ogg",
        DOCUMENT: "pdf",
        STICKER: "webp"
      };
      ext = extMap[mType] || extMap[item.mediaCategory] || (mType.includes("VIDEO") ? "mp4" : "jpg");
      originalName = `${type.toLowerCase()}_${idx}`;
    }

    const tpl = templateStr || "{Date}_{ChatName}_{Sender}_{FileName}";
    let formatted = tpl
      .replace(/{Date}/g, dateStr)
      .replace(/{ChatName}/g, chatName)
      .replace(/{Sender}/g, sender)
      .replace(/{Type}/g, type)
      .replace(/{Index}/g, idx)
      .replace(/{FileName}/g, clean(originalName));

    if (!formatted.toLowerCase().endsWith("." + ext)) {
      formatted = `${formatted}.${ext}`;
    }

    return formatted;
  },

  /**
   * Scans sidebar and active DOM for all available contact and group chat names
   */
  getAvailableChats: function () {
    const chats = new Set();

    // Active Chat
    const CD = window.WAMonitor?.ChatDetector;
    if (CD) {
      const info = CD.getActiveChatInfo();
      if (info && info.chatName) chats.add(info.chatName);
    }

    // Sidebar Chats
    const rows = document.querySelectorAll("#pane-side div[role='listitem'], #pane-side div._ak72, #pane-side div._ak7h");
    rows.forEach((row) => {
      const titleEl = row.querySelector("span[title], div[title], span[dir='auto']");
      if (titleEl) {
        const title = titleEl.getAttribute("title") || titleEl.textContent;
        if (title && title.trim()) chats.add(title.trim());
      }
    });

    return Array.from(chats);
  },

  /**
   * Scans chat media elements matching category, date range, and contact target filters
   */
  scanActiveChatMedia: function (filters = {}) {
    const main = document.querySelector("#main");
    const CD = window.WAMonitor?.ChatDetector;
    const chatInfo = CD ? CD.getActiveChatInfo() : { chatName: "WhatsApp_Chat" };
    const mediaItems = [];
    const seenUrls = new Set();

    if (!main) return mediaItems;

    // Contact Target Filter Check
    if (filters.targetChat && filters.targetChat !== "ACTIVE" && filters.targetChat !== "ALL") {
      if (chatInfo && chatInfo.chatName && chatInfo.chatName !== filters.targetChat) {
        // Active chat does not match requested contact
      }
    }

    // Query message elements
    const messageNodes = main.querySelectorAll("div.message-in, div.message-out, div[data-id]");

    messageNodes.forEach((node, index) => {
      if (node.parentElement && node.parentElement.closest("div.message-in, div.message-out, div[data-id^='true_'], div[data-id^='false_']")) {
        return;
      }

      const parsedMsg = window.WAMonitor?.MessageParser ? window.WAMonitor.MessageParser.parseMessage(node) : null;
      if (!parsedMsg) return;

      const msgType = parsedMsg.messageType || "UNKNOWN";
      if (msgType === "TEXT" || msgType === "UNKNOWN" || msgType === "CONTACT") return;

      const attachment = parsedMsg.attachmentDetails || {};
      const mediaUrl = attachment.mediaUrl || attachment.thumbUrl || "";
      const messageId = parsedMsg.messageId || "";

      // Capture the FULL data-id attribute — survives JSON serialization unlike DOM nodes.
      // Used by injected.js to look up the WhatsApp Store.Msg model.
      let fullDataId = "";
      let scanNode = node;
      while (scanNode && scanNode !== document.body) {
        const attr = scanNode.getAttribute && scanNode.getAttribute("data-id");
        if (attr && (attr.includes("true_") || attr.includes("false_"))) {
          fullDataId = attr;
          break;
        }
        scanNode = scanNode.parentElement;
      }
      if (!fullDataId) {
        const child = node.querySelector && node.querySelector("[data-id]");
        if (child) fullDataId = child.getAttribute("data-id") || "";
      }

      const dedupKey = fullDataId || mediaUrl || messageId || `${parsedMsg.senderName}_${parsedMsg.timestamp}_${index}`;
      if (seenUrls.has(dedupKey)) return;
      seenUrls.add(dedupKey);

      let category = "DOCUMENT";
      if (msgType === "IMAGE") category = "IMAGE";
      else if (msgType === "VIDEO") category = "VIDEO";
      else if (msgType === "AUDIO" || msgType === "VOICE_NOTE") category = "AUDIO";
      else if (msgType === "STICKER") category = "STICKER";

      if (filters.categories && Array.isArray(filters.categories) && filters.categories.length > 0) {
        if (!filters.categories.includes(category)) return;
      }

      const dateObj = parsedMsg.dateObj || (parsedMsg.timestamp ? new Date(parsedMsg.timestamp) : new Date());

      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        if (dateObj < start) return;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        if (dateObj > end) return;
      }

      mediaItems.push({
        id: messageId || `media_${index}`,
        dataId: fullDataId,       // full data-id e.g. false_9189@c.us_3EB0... (JSON-safe, survives popup→content serialization)
        chatName: chatInfo ? chatInfo.chatName : "WhatsApp_Chat",
        senderName: parsedMsg.senderName || "Unknown",
        messageType: msgType,
        mediaCategory: category,
        fileName: attachment.fileName || `${category.toLowerCase()}_${index + 1}`,
        mediaUrl: mediaUrl,
        thumbUrl: attachment.thumbUrl || "",
        mimeType: parsedMsg.mediaMetadata?.mimeType || "application/octet-stream",
        caption: parsedMsg.message || "",
        timestamp: parsedMsg.timestamp || "",
        dateObj: dateObj,
        node: node  // kept for in-page use; stripped during popup→content JSON serialization
      });
    });

    return mediaItems;
  },

  /**
   * Asynchronously scans chat media from both WhatsApp Web internal Store.Msg and active DOM
   * Returns enriched media items with directPath + mediaKey for 100% binary CDN decryption.
   */
  scanActiveChatMediaAsync: function (filters = {}, callback) {
    const domItems = this.scanActiveChatMedia(filters);
    const MP = window.WAMonitor?.MediaParser;

    if (!MP || typeof MP.getStoreMediaList !== "function") {
      if (typeof callback === "function") callback(domItems);
      return;
    }

    MP.getStoreMediaList("", (storeList) => {
      if (!Array.isArray(storeList) || storeList.length === 0) {
        if (typeof callback === "function") callback(domItems);
        return;
      }

      const seenIds = new Set();
      domItems.forEach(i => { if (i.dataId) seenIds.add(i.dataId); if (i.id) seenIds.add(i.id); });
      const merged = [...domItems];

      storeList.forEach((storeMsg, idx) => {
        const msgId = storeMsg.id || "";

        // Enrich DOM item if present
        const match = merged.find(i => (i.dataId === msgId || i.id === msgId || (msgId && i.dataId && i.dataId.endsWith(msgId))));
        if (match) {
          match.directPath = storeMsg.directPath;
          match.mediaKey = storeMsg.mediaKey;
          return;
        }

        if (msgId && seenIds.has(msgId)) return;
        if (msgId) seenIds.add(msgId);

        const rawType = (storeMsg.type || "image").toUpperCase();
        let category = "DOCUMENT";
        let mType = rawType;
        if (rawType === "IMAGE") { category = "IMAGE"; mType = "IMAGE"; }
        else if (rawType === "VIDEO" || rawType === "PTV") { category = "VIDEO"; mType = "VIDEO"; }
        else if (rawType === "AUDIO" || rawType === "PTT" || rawType === "VOICE_NOTE") { category = "AUDIO"; mType = "AUDIO"; }
        else if (rawType === "STICKER") { category = "STICKER"; mType = "STICKER"; }

        if (filters.categories && Array.isArray(filters.categories) && filters.categories.length > 0) {
          if (!filters.categories.includes(category)) return;
        }

        merged.push({
          id: msgId || `store_media_${idx}`,
          dataId: msgId,
          directPath: storeMsg.directPath,
          mediaKey: storeMsg.mediaKey,
          chatName: storeMsg.chatId || "WhatsApp_Chat",
          senderName: storeMsg.sender || "User",
          messageType: mType,
          mediaCategory: category,
          fileName: storeMsg.fileName || `${category.toLowerCase()}_${idx + 1}`,
          mediaUrl: "",
          thumbUrl: "",
          mimeType: storeMsg.mimeType || "application/octet-stream",
          caption: storeMsg.caption || "",
          timestamp: storeMsg.timestamp || "",
          dateObj: new Date()
        });
      });

      if (typeof callback === "function") callback(merged);
    });
  },

  /**
   * Downloads a single media item directly
   */
  downloadSingleItem: function (item, filenameTemplate) {
    const MP = window.WAMonitor?.MediaParser;
    const filename = this.formatFilename(item, 0, filenameTemplate);

    const triggerSave = (dataUrlOrBlob) => {
      if (!dataUrlOrBlob) {
        console.error("[WA Downloader] Failed to retrieve media blob for", item);
        return;
      }

      let url = "";
      if (typeof dataUrlOrBlob === "string") {
        url = dataUrlOrBlob;
      } else if (dataUrlOrBlob instanceof Blob) {
        url = URL.createObjectURL(dataUrlOrBlob);
      }

      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: "DOWNLOAD_FILE",
          url: url,
          filename: filename
        }, (res) => {
          if (chrome.runtime.lastError) {
            console.warn("[WA Downloader] Direct download dispatch error, falling back to <a> click:", chrome.runtime.lastError.message);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        });
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    };

    if (MP && typeof MP.convertBlobToBase64 === "function") {
      MP.convertBlobToBase64(item.mediaUrl, triggerSave, item.node, item.id, item.messageType, item.mimeType);
    } else if (item.mediaUrl) {
      triggerSave(item.mediaUrl);
    }
  },

  /**
   * Bulk downloads media items (unlimited batch count) and packages them into a client-side .zip archive
   */
  downloadAsZip: async function (mediaItems, options = {}, onProgress) {
    if (this.isDownloading) {
      if (typeof onProgress === "function") onProgress({ status: "error", message: "Download already in progress." });
      return;
    }

    if (!mediaItems || mediaItems.length === 0) {
      if (typeof onProgress === "function") onProgress({ status: "error", message: "No media items selected to download." });
      return;
    }

    if (typeof JSZip === "undefined") {
      if (typeof onProgress === "function") onProgress({ status: "error", message: "JSZip library not loaded." });
      return;
    }

    this.isDownloading = true;
    this.cancelDownload = false;

    const zip = new JSZip();
    const MP = window.WAMonitor?.MediaParser;
    const total = mediaItems.length;
    let fetchedCount = 0;
    let failedCount = 0;
    const template = options.filenameTemplate || "{Date}_{ChatName}_{Sender}_{FileName}";

    const chatName = mediaItems[0]?.chatName || "WhatsApp_Chat";
    const dateStr = new Date().toISOString().split("T")[0];
    const zipFilename = options.zipName || `WhatsApp_Media_${chatName.replace(/[/\\?%*:|"<>]/g, "_")}_${dateStr}.zip`;

    // Process files in parallel batches of 5 for maximum speed & unlimited     // ─── Per-item download helpers ──────────────────────────────────────────────

    /**
     * Converts a Blob to base64 string
     */
    const blobToB64 = (blob) => new Promise((res) => {
      const fr = new FileReader();
      fr.onloadend = () => {
        const result = fr.result || "";
        const idx = result.indexOf(",");
        res(idx >= 0 ? result.slice(idx + 1) : result);
      };
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });

    /**
     * Write a file to the ZIP (accepts data URL string, raw b64, or Blob)
     */
    const writeToZip = async (zipObj, fname, data) => {
      if (!data) return false;
      if (typeof data === "string" && data.startsWith("data:")) {
        const idx = data.indexOf(",");
        const b64 = idx >= 0 ? data.slice(idx + 1) : data;
        if (!b64 || b64.length < 10) return false;
        zipObj.file(fname, b64, { base64: true });
        return true;
      }
      if (data instanceof Blob && data.size > 0) {
        const b64 = await blobToB64(data);
        if (!b64 || b64.length < 10) return false;
        zipObj.file(fname, b64, { base64: true });
        return true;
      }
      if (typeof data === "string" && data.length > 10) {
        zipObj.file(fname, data, { base64: true });
        return true;
      }
      return false;
    };

    /**
     * Find a live DOM node by the full data-id attribute string
     * Avoids CSS.escape which breaks on @ and . characters
     */
    const findLiveNode = (dataId) => {
      if (!dataId) return null;
      // Direct attribute match (@ and . are fine inside ["..."] selectors)
      let node = document.querySelector('[data-id="' + dataId + '"]');
      if (node) return node;
      // Tail match (e.g. "3EB0ABC123" at end of "false_918@c.us_3EB0ABC123")
      const tail = dataId.split("_").slice(2).join("_");
      if (!tail) return null;
      const all = document.querySelectorAll("[data-id]");
      for (const el of all) {
        const attr = el.getAttribute("data-id") || "";
        if (attr.endsWith("_" + tail)) return el;
      }
      return null;
    };

    /**
     * Canvas-capture an image from a DOM node (works on any visible image)
     * Returns a data: URL string or null
     */
    const canvasCapture = (node) => {
      if (!node) return null;
      try {
        const img = node.querySelector("img[src^='blob:']") ||
                    node.querySelector("img[src^='data:']") ||
                    node.querySelector("img");
        if (!img) return null;
        const w = img.naturalWidth  || img.width  || 400;
        const h = img.naturalHeight || img.height || 400;
        if (w < 4 || h < 4) return null;
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL("image/jpeg", 0.92);
      } catch (e) { return null; }
    };

    // ─── Main per-item loop ────────────────────────────────────────────────────

    const BATCH_SIZE = 3; // Smaller batches for stability

    for (let i = 0; i < total; i += BATCH_SIZE) {
      if (this.cancelDownload) {
        this.isDownloading = false;
        if (typeof onProgress === "function") onProgress({ status: "cancelled", message: "Download cancelled." });
        return;
      }

      const batch = mediaItems.slice(i, i + BATCH_SIZE);

      if (typeof onProgress === "function") {
        const cur = Math.min(i + BATCH_SIZE, total);
        onProgress({ status:"fetching", current:cur, total, percent:Math.round((cur/total)*75), currentFile:`Fetching media (${cur}/${total})...` });
      }

      await Promise.all(batch.map(async (item, batchIdx) => {
        const itemIdx  = i + batchIdx;
        const filename = this.formatFilename(item, itemIdx, template);
        const msgType  = item.messageType || "";
        const isVideo  = msgType === "VIDEO";
        const isDoc    = msgType === "DOCUMENT";
        const isImg    = msgType === "IMAGE" || msgType === "STICKER";
        const isAudio  = msgType === "AUDIO" || msgType === "VOICE_NOTE";
        const dataId   = item.dataId || item.id || "";
        const srcUrl   = item.mediaUrl || "";
        const mime     = item.mimeType || (isVideo ? "video/mp4" : isImg ? "image/jpeg" : isAudio ? "audio/ogg" : "application/octet-stream");

        let ok = false;

        // ── STEP 0: Direct CDN HKDF Decryption (if directPath + mediaKey present) ──
        if (item.directPath && item.mediaKey && MP && typeof MP.downloadDirect === "function") {
          await new Promise((res) => {
            const timeout = setTimeout(res, isVideo ? 90000 : 25000);
            MP.downloadDirect(item.directPath, item.mediaKey, msgType, mime, async (data) => {
              clearTimeout(timeout);
              if (data) ok = await writeToZip(zip, filename, data);
              res();
            });
          });
        }

        // ── IMAGES & STICKERS ──────────────────────────────────────────────────
        if (isImg) {
          // Step 1: Main World CDN HKDF + AES-CBC decrypt (downloads FULL-RES binary from mmg.whatsapp.net)
          if (!ok && MP && typeof MP.fetchMainWorldMedia === "function") {
            await new Promise((res) => {
              const timeout = setTimeout(res, 15000);
              MP.fetchMainWorldMedia(dataId, srcUrl, msgType, mime, async (data) => {
                clearTimeout(timeout);
                if (data) ok = await writeToZip(zip, filename, data);
                res();
              });
            });
          }

          // Step 2: Direct blob URL fetch (fast path — if blob is still alive and > 5000 bytes)
          if (!ok && srcUrl && srcUrl.startsWith("blob:")) {
            try {
              const r = await fetch(srcUrl);
              if (r.ok) {
                const b = await r.blob();
                if (b && b.size > 2000) { ok = await writeToZip(zip, filename, b); }
              }
            } catch (e) {}
          }

          // Step 3: data: URL (already decoded)
          if (!ok && srcUrl && srcUrl.startsWith("data:")) {
            ok = await writeToZip(zip, filename, srcUrl);
          }

          // Step 4: Re-find live DOM node for fresh blob URL or canvas capture (last fallback)
          if (!ok) {
            const liveNode = findLiveNode(dataId) ||
                             (item.node instanceof HTMLElement ? item.node : null);
            if (liveNode) {
              const imgEl = liveNode.querySelector("img[src^='blob:']") || liveNode.querySelector("img[src^='data:']");
              if (imgEl?.src && !ok) {
                if (imgEl.src.startsWith("data:")) {
                  ok = await writeToZip(zip, filename, imgEl.src);
                } else {
                  try {
                    const r = await fetch(imgEl.src);
                    if (r.ok) { const b = await r.blob(); if (b && b.size > 2000) ok = await writeToZip(zip, filename, b); }
                  } catch(e) {}
                }
              }
              if (!ok) {
                const c64 = canvasCapture(liveNode);
                if (c64) ok = await writeToZip(zip, filename, c64);
              }
            }
          }
        }

        // ── AUDIO / VOICE NOTE ────────────────────────────────────────────────
        if (isAudio) {
          // Step 1: Direct blob URL fetch
          if (!ok && srcUrl && srcUrl.startsWith("blob:")) {
            try {
              const r = await fetch(srcUrl);
              if (r.ok) { const b = await r.blob(); if (b && b.size > 100) ok = await writeToZip(zip, filename, b); }
            } catch(e) {}
          }
          // Step 2: Re-find audio element
          if (!ok) {
            const liveNode = findLiveNode(dataId);
            if (liveNode) {
              const aud = liveNode.querySelector("audio");
              const audSrc = aud?.src || aud?.currentSrc || "";
              if (audSrc && audSrc.startsWith("blob:")) {
                try {
                  const r = await fetch(audSrc);
                  if (r.ok) { const b = await r.blob(); if (b && b.size > 100) ok = await writeToZip(zip, filename, b); }
                } catch(e) {}
              }
            }
          }
          // Step 3: Main World CDN decrypt
          if (!ok && MP && typeof MP.fetchMainWorldMedia === "function") {
            await new Promise((res) => {
              MP.fetchMainWorldMedia(dataId, srcUrl, msgType, mime, async (data) => {
                if (data) ok = await writeToZip(zip, filename, data);
                res();
              });
            });
          }
        }

        // ── VIDEOS & DOCUMENTS ────────────────────────────────────────────────
        if (isVideo || isDoc) {
          // Step 1: Main World CDN HKDF + AES-CBC decrypt
          if (!ok && MP && typeof MP.fetchMainWorldMedia === "function") {
            await new Promise((res) => {
              const timeout = setTimeout(res, isVideo ? 120000 : 60000);
              MP.fetchMainWorldMedia(dataId, srcUrl, msgType, mime, async (data) => {
                clearTimeout(timeout);
                if (data) ok = await writeToZip(zip, filename, data);
                res();
              });
            });
          }
          // Step 2: direct video src fetch (for already-played videos)
          if (!ok && isVideo) {
            const liveNode = findLiveNode(dataId);
            if (liveNode) {
              const vid = liveNode.querySelector("video");
              const vsrc = vid?.src || vid?.currentSrc || "";
              if (vsrc && vsrc.startsWith("blob:")) {
                try {
                  const r = await fetch(vsrc);
                  if (r.ok) { const b = await r.blob(); if (b && b.size > 1000 && !b.type.startsWith("image/")) ok = await writeToZip(zip, filename, b); }
                } catch(e) {}
              }
            }
          }
        }

        // ── Fallback: write metadata stub ─────────────────────────────────────
        if (!ok) {
          zip.file(`${filename}.info.txt`, `Media File: ${item.fileName}\nType: ${item.messageType}\nSender: ${item.senderName}\nTimestamp: ${item.timestamp}\nCaption: ${item.caption || ""}\n`);
        }
        if (ok) fetchedCount++;
        else failedCount++;
      }));
    }

    if (fetchedCount === 0) {
      this.isDownloading = false;
      if (typeof onProgress === "function") {
        onProgress({ status: "error", message: "Failed to fetch media data for selected files." });
      }
      return;
    }

    if (typeof onProgress === "function") {
      onProgress({ status: "zipping", current: total, total: total, percent: 85, message: "Creating ZIP compression archive..." });
    }

    try {
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }, (meta) => {
        if (typeof onProgress === "function") {
          const zipPercent = 85 + Math.round((meta.percent / 100) * 14); // 85% to 99%
          onProgress({ status: "zipping", current: total, total: total, percent: zipPercent, message: `Compressing ZIP (${meta.percent}%)...` });
        }
      });

      this.isDownloading = false;

      // Trigger standard browser download
      const zipUrl = URL.createObjectURL(zipBlob);

      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: "DOWNLOAD_FILE",
          url: zipUrl,
          filename: zipFilename
        }, (res) => {
          if (chrome.runtime.lastError) {
            const a = document.createElement("a");
            a.href = zipUrl;
            a.download = zipFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        });
      } else {
        const a = document.createElement("a");
        a.href = zipUrl;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      if (typeof onProgress === "function") {
        onProgress({
          status: "completed",
          current: total,
          total: total,
          percent: 100,
          fetchedCount: fetchedCount,
          failedCount: failedCount,
          zipFilename: zipFilename,
          message: `Successfully generated ZIP archive with ${fetchedCount} files.`
        });
      }
    } catch (err) {
      this.isDownloading = false;
      console.error("[WA Downloader] Error generating zip archive:", err);
      if (typeof onProgress === "function") {
        onProgress({ status: "error", message: err.message || "ZIP generation failed." });
      }
    }
  },

  /**
   * Scans and downloads current visible WhatsApp Status / Story item
   */
  downloadActiveStatus: function () {
    const C = window.WAMonitor?.Constants;
    const selectors = C?.SELECTORS;

    const dialog = document.querySelector("div[role='dialog'], div._ak8l");
    if (!dialog) {
      alert("Please open a WhatsApp Status/Story first to download it.");
      return;
    }

    const video = dialog.querySelector("video");
    const img = dialog.querySelector("img[src*='blob:'], img[src*='whatsapp.net'], img");

    let mediaUrl = "";
    let isVideo = false;

    if (video && (video.src || video.currentSrc)) {
      mediaUrl = video.currentSrc || video.src;
      isVideo = true;
    } else if (img && img.src) {
      mediaUrl = img.src;
    }

    if (!mediaUrl) {
      alert("No active status video or image detected in viewer.");
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = isVideo ? "mp4" : "jpg";
    const filename = `WhatsApp_Status_${timestamp}.${ext}`;

    const MP = window.WAMonitor?.MediaParser;
    const triggerSave = (dataUrlOrBlob) => {
      let url = typeof dataUrlOrBlob === "string" ? dataUrlOrBlob : (dataUrlOrBlob ? URL.createObjectURL(dataUrlOrBlob) : mediaUrl);
      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "DOWNLOAD_FILE", url: url, filename: filename }, (res) => {
          if (chrome.runtime.lastError) {
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        });
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    };

    if (MP && typeof MP.convertBlobToBase64 === "function") {
      MP.convertBlobToBase64(mediaUrl, triggerSave, dialog, "", isVideo ? "VIDEO" : "IMAGE", isVideo ? "video/mp4" : "image/jpeg");
    } else {
      triggerSave(mediaUrl);
    }
  },

  /**
   * Stops an ongoing download/zipping task
   */
  cancel: function () {
    this.cancelDownload = true;
    this.isDownloading = false;
  }
};
