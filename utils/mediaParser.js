/**
 * WhatsApp Web Message Monitor - Media Parser Engine
 * Namespace: window.WAMonitor.MediaParser
 * Extracts structured media metadata (mediaType, fileName, mimeType, caption, thumbnail status)
 * from WhatsApp Web DOM message elements.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.MediaParser = {
  /**
   * Infers MIME type based on media type and file extension
   */
  inferMimeType: function (mediaType, fileName) {
    const ext = (fileName || "").split(".").pop().toLowerCase();

    const mimeMap = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      webm: "video/webm",
      mp3: "audio/mpeg",
      ogg: "audio/ogg",
      opus: "audio/opus",
      wav: "audio/wav",
      m4a: "audio/mp4",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
      zip: "application/zip",
      rar: "application/vnd.rar"
    };

    if (mimeMap[ext]) return mimeMap[ext];

    switch (mediaType) {
      case "IMAGE":
        return "image/jpeg";
      case "VIDEO":
        return "video/mp4";
      case "AUDIO":
      case "VOICE_NOTE":
        return "audio/ogg";
      case "DOCUMENT":
        return "application/pdf";
      case "STICKER":
        return "image/webp";
      default:
        return "application/octet-stream";
    }
  },

  /**
   * Extracts media metadata from a message element and attachment details
   */
  extractMediaMetadata: function (node, messageType, attachmentDetails, messageContent) {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    if (!node || !attachmentDetails) return null;

    const fileName = attachmentDetails.fileName || "attachment";
    const mediaType = messageType || C.MESSAGE_TYPES.UNKNOWN;
    const mimeType = this.inferMimeType(mediaType, fileName);

    let caption = "";
    if (messageContent && typeof messageContent === "string" && !messageContent.startsWith("[")) {
      caption = messageContent;
    }

    const mediaUrl = attachmentDetails.mediaUrl || "";
    const thumbUrl = attachmentDetails.thumbUrl || "";

    const thumbnailAvailable = !!(thumbUrl || mediaUrl);
    const isDownloaded = mediaUrl.startsWith("blob:") || mediaUrl.startsWith("http");

    return {
      mediaType: mediaType,
      fileName: H.cleanText(fileName),
      mimeType: mimeType,
      caption: caption,
      thumbnailAvailable: thumbnailAvailable,
      mediaUrl: mediaUrl,
      thumbUrl: thumbUrl,
      isDownloaded: isDownloaded,
      note: "Chrome Extension extracts DOM-rendered media metadata; full resolution binary files are downloaded on-demand by WhatsApp Web."
    };
  },

  /**
   * Captures a frame from a <video> or <img> element onto an offscreen canvas and returns Base64 data URL
   */
  convertElementToCanvasBase64: function (element) {
    if (!element || !(element instanceof HTMLElement)) return null;

    try {
      let targetEl = element;
      if (element.tagName !== "VIDEO" && element.tagName !== "IMG") {
        targetEl = element.querySelector("video") || element.querySelector("img");
      }
      if (!targetEl) return null;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      if (targetEl.tagName === "VIDEO") {
        const video = targetEl;
        const width = video.videoWidth || video.clientWidth || 320;
        const height = video.videoHeight || video.clientHeight || 240;
        if (width === 0 || height === 0) return null;

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", 0.85);
      } else if (targetEl.tagName === "IMG") {
        const img = targetEl;
        const width = img.naturalWidth || img.clientWidth || 320;
        const height = img.naturalHeight || img.clientHeight || 320;
        if (width === 0 || height === 0) return null;

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", 0.85);
      }
    } catch (e) {
      return null;
    }
    return null;
  },

  /**
   * Dispatches a request to Main World injected.js to extract CDN download metadata (directPath, mediaKey, encFilehash, filehash, cdnUrl)
   */
  fetchMediaCdnMetadata: function (messageId, callback) {
    if (!messageId) {
      if (typeof callback === "function") callback(null);
      return;
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let handled = false;

    const handler = (event) => {
      if (!event.data || event.data.source !== "WA_MONITOR_MAIN_WORLD") return;
      if (event.data.requestId === requestId) {
        handled = true;
        window.removeEventListener("message", handler);
        if (event.data.success && event.data.cdnMetadata) {
          if (typeof callback === "function") callback(event.data.cdnMetadata);
        } else {
          if (typeof callback === "function") callback(null);
        }
      }
    };

    window.addEventListener("message", handler);

    window.postMessage({
      source: "WA_MONITOR_CONTENT_SCRIPT",
      action: "FETCH_MEDIA_METADATA",
      requestId: requestId,
      messageId: messageId
    }, "*");

  },

  /**
   * Requests Store.Msg media enumeration list for active/specified chat from injected.js
   */
  getStoreMediaList: function (chatId, callback) {
    const requestId = `req_store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let handled = false;

    const handler = (event) => {
      if (!event.data || event.data.source !== "WA_MONITOR_MAIN_WORLD") return;
      if (event.data.requestId === requestId) {
        handled = true;
        window.removeEventListener("message", handler);
        if (event.data.success && Array.isArray(event.data.mediaList)) {
          if (typeof callback === "function") callback(event.data.mediaList);
        } else {
          if (typeof callback === "function") callback([]);
        }
      }
    };

    window.addEventListener("message", handler);

    window.postMessage({
      source: "WA_MONITOR_CONTENT_SCRIPT",
      action: "GET_MEDIA_LIST",
      requestId: requestId,
      chatId: chatId || ""
    }, "*");

    setTimeout(() => {
      if (!handled) {
        window.removeEventListener("message", handler);
        if (typeof callback === "function") callback([]);
      }
    }, 4000);
  },

  /**
   * Requests direct CDN download + HKDF AES-CBC decryption for directPath + mediaKey
   */
  downloadDirect: function (directPath, mediaKey, type, mimeType, callback) {
    if (!directPath || !mediaKey) {
      if (typeof callback === "function") callback(null);
      return;
    }

    const requestId = `req_direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let handled = false;

    const handler = (event) => {
      if (!event.data || event.data.source !== "WA_MONITOR_MAIN_WORLD") return;
      if (event.data.requestId === requestId) {
        handled = true;
        window.removeEventListener("message", handler);
        if (event.data.success && event.data.base64Data) {
          if (typeof callback === "function") callback(event.data.base64Data);
        } else {
          if (typeof callback === "function") callback(null);
        }
      }
    };

    window.addEventListener("message", handler);

    window.postMessage({
      source: "WA_MONITOR_CONTENT_SCRIPT",
      action: "DOWNLOAD_MEDIA_DIRECT",
      requestId: requestId,
      directPath: directPath,
      mediaKey: mediaKey,
      type: type || "image",
      mimeType: mimeType || ""
    }, "*");

    const isHeavy = (type === "video" || type === "document" || type === "VIDEO" || type === "DOCUMENT");
    setTimeout(() => {
      if (!handled) {
        window.removeEventListener("message", handler);
        if (typeof callback === "function") callback(null);
      }
    }, isHeavy ? 90000 : 30000);
  },

  /**
   * Dispatches a request to Main World injected.js script to extract raw decrypted media Base64 from WhatsApp Web internal Store
   */
  fetchMainWorldMedia: function (messageId, mediaUrl, mediaType, mimeType, callback) {
    if (typeof mediaType === "function") {
      callback = mediaType;
      mediaType = "";
      mimeType = "";
    } else if (typeof mimeType === "function") {
      callback = mimeType;
      mimeType = "";
    }

    if (!messageId && !mediaUrl) {
      if (typeof callback === "function") callback(null);
      return;
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let handled = false;

    const handler = (event) => {
      if (!event.data || event.data.source !== "WA_MONITOR_MAIN_WORLD") return;
      if (event.data.requestId === requestId) {
        handled = true;
        window.removeEventListener("message", handler);
        if (event.data.success && event.data.base64Data) {
          if (typeof callback === "function") callback(event.data.base64Data);
        } else {
          if (typeof callback === "function") callback(null);
        }
      }
    };

    window.addEventListener("message", handler);

    window.postMessage({
      source: "WA_MONITOR_CONTENT_SCRIPT",
      action: "FETCH_MAIN_WORLD_MEDIA",
      requestId: requestId,
      messageId: messageId || "",
      mediaUrl: mediaUrl || "",
      mediaType: mediaType || "",
      mimeType: mimeType || ""
    }, "*");

    // Safety timeout (120000ms / 2 minutes limit for Main World bridge response to allow full video decryption/reassembly)
    const isHeavy = (mediaType === "VIDEO" || mediaType === "DOCUMENT" || mediaType === "video" || mediaType === "document");
    const timeoutMs = isHeavy ? 120000 : 30000;

    setTimeout(() => {
      if (!handled) {
        window.removeEventListener("message", handler);
        if (typeof callback === "function") callback(null);
      }
    }, timeoutMs);
  },

  /**
   * Converts a blob: URL or DOM media element to a Base64 Data URL string
   */
  convertBlobToBase64: function (blobUrl, callback, node, messageId, mediaType, mimeType) {
    const isVideo = (mediaType === "VIDEO" || mediaType === "video" || mediaType === "ptv");
    const isAudio = (mediaType === "AUDIO" || mediaType === "audio" || mediaType === "VOICE_NOTE" || mediaType === "ptt");
    const isImageDataUrl = (s) => typeof s === "string" && s.startsWith("data:image/");

    const tryCanvasFallback = () => {
      if (!isVideo && node) {
        const canvasBase64 = this.convertElementToCanvasBase64(node);
        if (canvasBase64) { if (typeof callback === "function") callback(canvasBase64); return; }
      }
      if (node && node.querySelector) {
        const img = node.querySelector("img");
        if (img && img.src && img.src.startsWith("data:")) {
          if (typeof callback === "function") callback(img.src); return;
        }
      }
      if (typeof callback === "function") callback(null);
    };

    // For VIDEO — always go straight to Main World HKDF+AES-CBC decryptor.
    // Never try to fetch the thumbnail blob URL — it's just a JPEG poster image.
    if (isVideo) {
      this.fetchMainWorldMedia(messageId, blobUrl || "", mediaType, mimeType, (res) => {
        if (res && !isImageDataUrl(res)) { if (typeof callback === "function") callback(res); }
        else { if (typeof callback === "function") callback(null); }
      });
      return;
    }

    // For data: URLs (images, audio already decoded)
    if (blobUrl && typeof blobUrl === "string" && blobUrl.startsWith("data:")) {
      if (typeof callback === "function") callback(blobUrl);
      return;
    }

    // For non-video blob:/http: URLs — try direct fetch first
    if (blobUrl && typeof blobUrl === "string" && (blobUrl.startsWith("blob:") || blobUrl.startsWith("http:") || blobUrl.startsWith("https:"))) {
      fetch(blobUrl)
        .then((r) => r.blob())
        .then((blob) => {
          if (blob && blob.size > 200) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result;
              if (res && typeof res === "string" && res.length > 200) {
                if (typeof callback === "function") callback(res);
              } else {
                this.fetchMainWorldMedia(messageId, blobUrl, mediaType, mimeType, (mwRes) => {
                  if (mwRes) callback(mwRes); else tryCanvasFallback();
                });
              }
            };
            reader.onerror = () => {
              this.fetchMainWorldMedia(messageId, blobUrl, mediaType, mimeType, (mwRes) => {
                if (mwRes) callback(mwRes); else tryCanvasFallback();
              });
            };
            reader.readAsDataURL(blob);
          } else {
            this.fetchMainWorldMedia(messageId, blobUrl, mediaType, mimeType, (mwRes) => {
              if (mwRes) callback(mwRes); else tryCanvasFallback();
            });
          }
        })
        .catch(() => {
          this.fetchMainWorldMedia(messageId, blobUrl, mediaType, mimeType, (mwRes) => {
            if (mwRes) callback(mwRes); else tryCanvasFallback();
          });
        });
      return;
    }

    // Final: Main World extraction
    this.fetchMainWorldMedia(messageId, blobUrl || "", mediaType, mimeType, (res) => {
      if (res) { if (typeof callback === "function") callback(res); }
      else tryCanvasFallback();
    });
  }
};

