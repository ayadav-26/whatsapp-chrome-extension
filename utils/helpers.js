/**
 * WhatsApp Web Message Monitor - Helper Utilities
 * Namespace: window.WAMonitor.Helpers
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.Helpers = {
  /**
   * Safely verifies if Chrome Extension context is valid
   */
  isContextValid: function () {
    try {
      return typeof chrome !== "undefined" && chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  },

  /**
   * Formatted logging helper
   */
  log: function (msg, type = "info", data = null) {
    const prefix = window.WAMonitor.Constants?.CONFIG?.LOG_PREFIX || "[WA Monitor]";
    const time = new Date().toLocaleTimeString();

    if (type === "error") {
      console.error(`${prefix} [${time}]`, msg, data || "");
    } else if (type === "warn") {
      console.warn(`${prefix} [${time}]`, msg, data || "");
    } else {
      if (data) {
        console.log(`${prefix} [${time}] ${msg}`, data);
      } else {
        console.log(`${prefix} [${time}] ${msg}`);
      }
    }
  },

  /**
   * Clean text string
   */
  cleanText: function (str) {
    if (!str || typeof str !== "string") return "";
    return str.replace(/\s+/g, " ").trim();
  },

  /**
   * Extract phone number from JID string (e.g. 919876543210@c.us) or text string
   */
  extractPhoneNumber: function (str) {
    if (!str || typeof str !== "string") return "";

    // 1. Direct JID match: e.g. 919876543210@c.us
    const jidMatch = str.match(/(\d{7,15})@(?:c\.us|s\.whatsapp\.net)/);
    if (jidMatch) {
      return `+${jidMatch[1]}`;
    }

    // 2. Standard formatted phone match: e.g. +91 98765 43210 or +1 (123) 456-7890
    const phoneMatch = str.match(/\+?\d{1,4}[-.\s()]?\d{2,4}[-.\s()]?\d{2,4}[-.\s()]?\d{2,4}/);
    if (phoneMatch) {
      const rawDigits = phoneMatch[0].replace(/\D/g, "");
      if (rawDigits.length >= 7 && rawDigits.length <= 15) {
        return `+${rawDigits}`;
      }
    }

    // 3. Fallback raw digits match: e.g. 919876543210
    const rawDigitsMatch = str.match(/\b\d{7,15}\b/);
    if (rawDigitsMatch) {
      return `+${rawDigitsMatch[0]}`;
    }

    return "";
  },

  /**
   * Generates clean fallback chatId when data-id JID is missing
   */
  generateFallbackChatId: function (chatName, phoneNumber) {
    if (phoneNumber) {
      const digits = phoneNumber.replace(/\D/g, "");
      if (digits) return `${digits}@c.us`;
    }

    if (chatName && typeof chatName === "string" && chatName !== "Unknown Chat") {
      const sanitized = chatName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
      if (sanitized) return `${sanitized}@c.us`;
    }

    return "unknown_chat@c.us";
  },

  /**
   * Parse data-id attribute string
   */
  parseDataId: function (dataId) {
    if (!dataId || typeof dataId !== "string") {
      return { isIncoming: null, isOutgoing: null, chatId: null, messageId: null };
    }

    const isOutgoing = dataId.startsWith("true_") || dataId.includes("_true_") || dataId.startsWith("true");
    const isIncoming = dataId.startsWith("false_") || dataId.includes("_false_") || dataId.startsWith("false");

    const parts = dataId.split("_");
    let chatId = null;
    let messageId = dataId;

    if (parts.length >= 3) {
      chatId = parts[1];
      messageId = parts.slice(2).join("_");
    }

    return {
      isIncoming: isIncoming ? true : (isOutgoing ? false : null),
      isOutgoing: isOutgoing ? true : (isIncoming ? false : null),
      chatId: chatId,
      messageId: messageId
    };
  },

  /**
   * Parse data-pre-plain-text string
   */
  parsePrePlainText: function (preText) {
    if (!preText || typeof preText !== "string") {
      return { timestamp: null, senderName: null };
    }

    const regex = /\[(.*?)\]\s*(.*?):?$/;
    const match = preText.trim().match(regex);

    if (match) {
      return {
        timestamp: match[1] ? match[1].trim() : null,
        senderName: match[2] ? match[2].replace(/:$/, "").trim() : null
      };
    }

    return { timestamp: null, senderName: null };
  },

  /**
   * Generate deterministic unique hash when messageId is not available
   */
  generateFallbackHash: function (chatId, timestamp, message, direction) {
    const rawString = `${chatId || "chat"}_${timestamp || "time"}_${direction || "dir"}_${message || "msg"}`;

    let hash = 0x811c9dc5;
    for (let i = 0; i < rawString.length; i++) {
      hash ^= rawString.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    const hexHash = (hash >>> 0).toString(16);
    return `hash_${hexHash}_${rawString.length}`;
  },

  /**
   * Converts a Base64 DataURL back into a native browser File object
   */
  base64ToFile: function (base64Data, fileName, fileType) {
    if (!base64Data || typeof base64Data !== "string") {
      throw new Error("Invalid base64 data for file reconstruction.");
    }

    const arr = base64Data.split(",");
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = fileType || (mimeMatch ? mimeMatch[1] : "application/octet-stream");
    const bstr = atob(arr[1] || arr[0]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new File([u8arr], fileName || "attachment", { type: mime });
  },

  /**
   * Formats byte count into human-readable string (e.g. 125678 -> "122.7 KB")
   */
  formatFileSize: function (bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  },

  /**
   * Determines file category (IMAGE, VIDEO, DOCUMENT, AUDIO)
   */
  getFileCategory: function (fileType, fileName) {
    const type = (fileType || "").toLowerCase();
    const ext = (fileName || "").split(".").pop().toLowerCase();
    const L = window.WAMonitor.Constants?.ATTACHMENT_LIMITS;

    if (type.startsWith("image/") || (L && L.IMAGE_EXTENSIONS.includes(ext))) {
      return "IMAGE";
    }
    if (type.startsWith("video/") || (L && L.VIDEO_EXTENSIONS.includes(ext))) {
      return "VIDEO";
    }
    if (type.startsWith("audio/") || (L && L.AUDIO_EXTENSIONS.includes(ext))) {
      return "AUDIO";
    }
    return "DOCUMENT";
  }
};
