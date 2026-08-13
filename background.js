/**
 * WhatsApp Web Message Monitor & Sender - Background Service Worker
 * Handles extension lifecycle, tab resolution via TabManager, chrome.downloads dispatch,
 * ArrayBuffer chunking (0x8000), and wa:download / DOWNLOAD_FILE protocol handlers.
 */

// Robust self-contained TabManager fallback
const TabManager = (typeof self !== "undefined" && self.WAMonitor?.TabManager) ? self.WAMonitor.TabManager : {
  cachedTabId: null,
  getValidWhatsAppTab: function (targetPhone, callback) {
    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const validTab = tabs.find((t) => t.active) || tabs[0];
        if (typeof callback === "function") callback(validTab, false);
      } else {
        const cleanPhone = (targetPhone || "").replace(/\D/g, "");
        const initialUrl = cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}` : "https://web.whatsapp.com/";
        chrome.tabs.create({ url: initialUrl, active: true }, (newTab) => {
          if (typeof callback === "function") callback(newTab, true);
        });
      }
    });
  },
  activateWhatsAppTab: function (targetPhone, callback) {
    this.getValidWhatsAppTab(targetPhone, (tab, isNewTab) => {
      if (tab && !tab.active) {
        chrome.tabs.update(tab.id, { active: true }, (updated) => {
          if (typeof callback === "function") callback(updated || tab, isNewTab);
        });
      } else {
        if (typeof callback === "function") callback(tab, isNewTab);
      }
    });
  }
};

chrome.runtime.onInstalled.addListener(() => {
  console.log("[WA Monitor] Background Service Worker installed.");

  chrome.storage.local.get(["whatsapp_messages", "totalCaptured"], (res) => {
    if (!res.whatsapp_messages) {
      chrome.storage.local.set({ whatsapp_messages: [] });
    }
    if (res.totalCaptured === undefined) {
      chrome.storage.local.set({ totalCaptured: 0 });
    }
  });
});

/**
 * ArrayBuffer -> Base64 helper with 0x8000 (32768) chunking
 * Prevents "Maximum call stack size exceeded" errors on large binary payloads
 */
function ab2b64(buf) {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Handle message send tasks, webhook dispatches, & file downloads
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) return false;

  // Action 1: Initiate WhatsApp Send Task
  if (request.action === "INITIATE_SEND") {
    const { countryCode, phoneNumber, message, attachment } = request.payload || {};

    const cleanCountry = (countryCode || "").replace(/\D/g, "");
    const cleanPhone = (phoneNumber || "").replace(/\D/g, "");
    const fullPhone = `${cleanCountry}${cleanPhone}`;

    if (!fullPhone) {
      sendResponse({ success: false, error: "Invalid phone number." });
      return true;
    }

    if (!message && (!attachment || !attachment.base64Data)) {
      sendResponse({ success: false, error: "Please enter a message or select an attachment." });
      return true;
    }

    const taskData = {
      fullPhone: fullPhone,
      phoneNumber: `+${fullPhone}`,
      message: message || "",
      attachment: attachment || null,
      status: "Activating WhatsApp Web...",
      createdAt: new Date().toISOString()
    };

    chrome.storage.local.set({ active_send_task: taskData }, () => {
      const TM = TabManager;
      if (TM) {
        TM.activateWhatsAppTab(fullPhone, (tab, isNewTab, err) => {
          if (err || !tab) {
            sendResponse({ success: false, error: err ? err.message : "WhatsApp Web tab not found." });
            return;
          }

          if (!isNewTab) {
            chrome.tabs.sendMessage(tab.id, { action: "EXECUTE_IN_PAGE_SEND", payload: taskData }, (resp) => {
              if (chrome.runtime.lastError) {
                console.warn("[WA Monitor] Message channel check:", chrome.runtime.lastError.message);
              }
            });
          }

          sendResponse({ success: true, message: isNewTab ? "Opening WhatsApp Web..." : "Reusing WhatsApp tab..." });
        });
      } else {
        sendResponse({ success: false, error: "TabManager module not loaded." });
      }
    });

    return true;
  }

  // Action 2: POST Webhook Payload
  if (request.action === "POST_WEBHOOK") {
    const { webhookUrl, payload } = request;
    if (!webhookUrl) {
      sendResponse({ success: false, error: "No Webhook URL provided." });
      return true;
    }

    fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Source": "WhatsApp-Web-Chrome-Extension"
      },
      body: JSON.stringify(payload)
    })
    .then((response) => {
      if (response.ok) {
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: `HTTP ${response.status}: ${response.statusText}` });
      }
    })
    .catch((err) => {
      sendResponse({ success: false, error: err?.message || "Network error or Webhook unreachable." });
    });

    return true;
  }

  // Action 3: Download File (Supports DOWNLOAD_FILE & wa:download protocols)
  if (request.action === "DOWNLOAD_FILE" || request.type === "wa:download") {
    const payload = request.payload || request;
    const { url, base64, arrayBuffer, filename, mime } = payload;

    if (!filename) {
      sendResponse({ success: false, ok: false, error: "Missing filename." });
      return true;
    }

    let finalUrl = url;

    if (!finalUrl) {
      let b64 = base64;
      if (!b64 && arrayBuffer) {
        b64 = ab2b64(arrayBuffer);
      }
      if (b64) {
        if (b64.startsWith("data:")) {
          finalUrl = b64;
        } else {
          finalUrl = `data:${mime || "application/octet-stream"};base64,${b64}`;
        }
      }
    }

    if (!finalUrl) {
      sendResponse({ success: false, ok: false, error: "Missing URL or Base64 data." });
      return true;
    }

    try {
      chrome.downloads.download(
        {
          url: finalUrl,
          filename: filename,
          saveAs: false,
          conflictAction: "uniquify"
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("[WA Monitor] Download error:", chrome.runtime.lastError.message);
            sendResponse({ success: false, ok: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, ok: true, downloadId: downloadId });
          }
        }
      );
    } catch (e) {
      sendResponse({ success: false, ok: false, error: e.message });
    }

    return true;
  }

  // Action 4: Logging
  if (request.type === "wa:log") {
    console.log("[WA Downloader]", request.message);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
