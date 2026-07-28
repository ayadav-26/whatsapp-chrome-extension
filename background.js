/**
 * WhatsApp Web Message Monitor & Sender - Background Service Worker
 * Handles extension lifecycle, tab resolution via TabManager, and chrome.tabs.sendMessage dispatch.
 * Reuses existing tabs with zero reloads; opens initial tab cleanly if WhatsApp is closed.
 */

// Import TabManager module in Service Worker
try {
  importScripts("utils/tabManager.js");
} catch (e) {
  console.error("[WA Monitor] Error importing tabManager.js:", e);
}

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

// Handle send task initiation from Popup UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

    // Save pending send task to storage
    chrome.storage.local.set({ active_send_task: taskData }, () => {
      const TM = self.WAMonitor?.TabManager;
      if (TM) {
        // Activate/focus WhatsApp tab
        TM.activateWhatsAppTab(fullPhone, (tab, isNewTab, err) => {
          if (err || !tab) {
            sendResponse({ success: false, error: err ? err.message : "WhatsApp Web tab not found." });
            return;
          }

          // If tab was already open, trigger in-page sending via content script
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

    return true; // Keep async channel open
  }

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

    return true; // Async response
  }
});
