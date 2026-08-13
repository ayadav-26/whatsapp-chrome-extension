/**
 * WhatsApp Web Message Monitor & Sender - Popup Controller
 * Manages Monitor dashboard, Automatic Sender form, File Attachment picker, and Progress banners.
 */

document.addEventListener("DOMContentLoaded", () => {

  // ═══════════════════════════════════════════════════════
  //  JS TOOLTIP ENGINE
  //  Uses position:fixed + viewport clamping so the tooltip
  //  is NEVER clipped by the popup window edge.
  // ═══════════════════════════════════════════════════════
  const waTooltip = document.getElementById("wa-tooltip");
  let ttHideTimer = null;
  const GAP = 8;       // pixels between trigger and tooltip
  const MARGIN = 6;    // min distance from popup edge

  function positionAndShow(trigger) {
    if (!waTooltip) return;
    const text = trigger.getAttribute("data-tooltip");
    if (!text) return;

    clearTimeout(ttHideTimer);
    waTooltip.textContent = text;
    waTooltip.classList.remove("visible", "arrow-up", "arrow-down");

    // Temporarily make it invisible but measurable
    waTooltip.style.visibility = "hidden";
    waTooltip.style.display = "block";

    const rect  = trigger.getBoundingClientRect();
    const ttW   = waTooltip.offsetWidth;
    const ttH   = waTooltip.offsetHeight;
    const vpW   = document.documentElement.clientWidth;
    const vpH   = document.documentElement.clientHeight;

    // Try to place BELOW the trigger first
    let top  = rect.bottom + GAP;
    let arrowClass = "arrow-up";

    // If it would overflow the bottom, place ABOVE
    if (top + ttH + MARGIN > vpH) {
      top = rect.top - ttH - GAP;
      arrowClass = "arrow-down";
    }

    // Horizontally: center on trigger, then clamp
    let left = rect.left + rect.width / 2 - ttW / 2;
    if (left < MARGIN)              left = MARGIN;
    if (left + ttW > vpW - MARGIN)  left = vpW - ttW - MARGIN;

    waTooltip.style.top  = Math.round(top)  + "px";
    waTooltip.style.left = Math.round(left) + "px";
    waTooltip.classList.add(arrowClass);

    waTooltip.style.visibility = "";
    // small rAF so transition fires
    requestAnimationFrame(() => waTooltip.classList.add("visible"));
  }

  function hideTooltip() {
    if (!waTooltip) return;
    waTooltip.classList.remove("visible");
    ttHideTimer = setTimeout(() => {
      waTooltip.style.display = "none";
    }, 160);
  }

  // Attach to every element that carries a data-tooltip attribute
  document.querySelectorAll("[data-tooltip]").forEach(el => {
    el.addEventListener("mouseenter", () => positionAndShow(el));
    el.addEventListener("mouseleave",  hideTooltip);
    el.addEventListener("click",       hideTooltip);
    el.addEventListener("focus",       () => positionAndShow(el));
    el.addEventListener("blur",        hideTooltip);
  });
  // ═══════════════════════════════════════════════════════

  // Tab elements
  // Tab elements
  const tabMonitorBtn = document.getElementById("tabMonitorBtn");
  const tabDownloaderBtn = document.getElementById("tabDownloaderBtn");
  const tabSendBtn = document.getElementById("tabSendBtn");
  const tabSyncBtn = document.getElementById("tabSyncBtn");
  const viewMonitor = document.getElementById("viewMonitor");
  const viewDownloader = document.getElementById("viewDownloader");
  const viewSend = document.getElementById("viewSend");
  const viewSync = document.getElementById("viewSync");

  // Media Downloader Elements
  const dlScannedCountEl = document.getElementById("dlScannedCount");
  const dlSelectedCountEl = document.getElementById("dlSelectedCount");
  const dlClosedBanner = document.getElementById("dlClosedBanner");
  const dlFilterImg = document.getElementById("dlFilterImg");
  const dlFilterVid = document.getElementById("dlFilterVid");
  const dlFilterAud = document.getElementById("dlFilterAud");
  const dlFilterDoc = document.getElementById("dlFilterDoc");
  const dlStartDate = document.getElementById("dlStartDate");
  const dlEndDate = document.getElementById("dlEndDate");
  const dlTargetChat = document.getElementById("dlTargetChat");
  const dlFilenameTpl = document.getElementById("dlFilenameTpl");
  const dlDeepScanToggle = document.getElementById("dlDeepScanToggle");
  const dlProgressCard = document.getElementById("dlProgressCard");
  const dlProgressStatus = document.getElementById("dlProgressStatus");
  const dlProgressPercent = document.getElementById("dlProgressPercent");
  const dlProgressFill = document.getElementById("dlProgressFill");
  const dlScanBtn = document.getElementById("dlScanBtn");
  const dlZipBtn = document.getElementById("dlZipBtn");
  const dlStatusBtn = document.getElementById("dlStatusBtn");
  const dlEmptyState = document.getElementById("dlEmptyState");
  const dlGalleryGrid = document.getElementById("dlGalleryGrid");

  let scannedMediaItems = [];

  // Sync elements
  const webhookUrlInput = document.getElementById("webhookUrlInput");
  const syncEnableToggle = document.getElementById("syncEnableToggle");
  const saveSyncSettingsBtn = document.getElementById("saveSyncSettingsBtn");
  const syncActiveNowBtn = document.getElementById("syncActiveNowBtn");
  const syncFeedbackBanner = document.getElementById("syncFeedbackBanner");
  const syncFeedbackText = document.getElementById("syncFeedbackText");
  const syncedChatsValEl = document.getElementById("syncedChatsVal");
  const syncedMsgsValEl = document.getElementById("syncedMsgsVal");

  // Dashboard elements
  const totalCountEl = document.getElementById("totalCount");
  const lastTimeValEl = document.getElementById("lastTimeVal");
  const emptyStateEl = document.getElementById("emptyState");
  const messageDetailsEl = document.getElementById("messageDetails");
  const directionBadgeEl = document.getElementById("directionBadge");
  const typeValEl = document.getElementById("typeVal");
  const senderValEl = document.getElementById("senderVal");
  const chatValEl = document.getElementById("chatVal");
  const phoneValEl = document.getElementById("phoneVal");
  const msgValEl = document.getElementById("msgVal");
  const attachmentMetaRowEl = document.getElementById("attachmentMetaRow");
  const attachmentMetaValEl = document.getElementById("attachmentMetaVal");
  const statusTextEl = document.getElementById("statusText");
  const clearBtn = document.getElementById("clearBtn");

  // Form elements
  const sendForm = document.getElementById("sendForm");
  const countryCodeInput = document.getElementById("countryCode");
  const phoneNumberInput = document.getElementById("phoneNumber");
  const messageTextInput = document.getElementById("messageText");
  const attachmentPicker = document.getElementById("attachmentPicker");
  const dropArea = document.getElementById("dropArea");
  const filePreviewCard = document.getElementById("filePreviewCard");
  const fileNameVal = document.getElementById("fileNameVal");
  const fileSizeVal = document.getElementById("fileSizeVal");
  const removeFileBtn = document.getElementById("removeFileBtn");
  const submitSendBtn = document.getElementById("submitSendBtn");
  const progressBanner = document.getElementById("progressBanner");
  const progressText = document.getElementById("progressText");

  // Attachment state
  let selectedAttachment = null;

  // Helper to hide all view panels
  function hideAllViews() {
    viewMonitor.classList.add("hidden");
    if (viewDownloader) viewDownloader.classList.add("hidden");
    viewSend.classList.add("hidden");
    if (viewSync) viewSync.classList.add("hidden");

    tabMonitorBtn.classList.remove("active");
    if (tabDownloaderBtn) tabDownloaderBtn.classList.remove("active");
    tabSendBtn.classList.remove("active");
    if (tabSyncBtn) tabSyncBtn.classList.remove("active");
  }

  // 1. Tab Navigation
  tabMonitorBtn.addEventListener("click", () => {
    hideAllViews();
    tabMonitorBtn.classList.add("active");
    viewMonitor.classList.remove("hidden");
  });

  if (tabDownloaderBtn) {
    tabDownloaderBtn.addEventListener("click", () => {
      hideAllViews();
      tabDownloaderBtn.classList.add("active");
      viewDownloader.classList.remove("hidden");
      populateTargetChats();
      if (scannedMediaItems.length === 0) {
        scanActiveChatMedia();
      }
    });
  }

  tabSendBtn.addEventListener("click", () => {
    hideAllViews();
    tabSendBtn.classList.add("active");
    viewSend.classList.remove("hidden");
  });

  if (tabSyncBtn) {
    tabSyncBtn.addEventListener("click", () => {
      hideAllViews();
      tabSyncBtn.classList.add("active");
      if (viewSync) viewSync.classList.remove("hidden");
      refreshSyncStats();
    });
  }


  // Load Sync Settings
  function loadSyncSettings() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(["whatsapp_sync_webhook_url", "whatsapp_sync_enabled", "whatsapp_synced_chats", "whatsapp_synced_messages"], (res) => {
      let savedUrl = res.whatsapp_sync_webhook_url;
      if (!savedUrl || savedUrl.includes("localhost")) {
        savedUrl = "https://ai-workflow.smartsight.in/webhook/whatsapp-sync";
      }
      if (webhookUrlInput) webhookUrlInput.value = savedUrl;
      if (syncEnableToggle) syncEnableToggle.checked = res.whatsapp_sync_enabled !== undefined ? res.whatsapp_sync_enabled : true;

      // Only show sync counts when WA Web is confirmed open
      // (waWebIsOpen is set by the tab check at the bottom)
      // We still read the values but only render them after the WA check runs
      const syncedChats = res.whatsapp_synced_chats || {};
      const syncedMsgs  = res.whatsapp_synced_messages || {};

      // Store in module-level vars so updateSyncCounts() can use them
      _syncedChatsCount = Object.keys(syncedChats).length;
      _syncedMsgsCount  = Object.keys(syncedMsgs).length;

      updateSyncCounts();
    });
  }

  // Cached sync counts (set by loadSyncSettings, rendered by updateSyncCounts)
  let _syncedChatsCount = 0;
  let _syncedMsgsCount  = 0;

  function updateSyncCounts() {
    if (waWebIsOpen) {
      // Show real counts
      if (syncedChatsValEl) syncedChatsValEl.textContent = _syncedChatsCount;
      if (syncedMsgsValEl)  syncedMsgsValEl.textContent  = _syncedMsgsCount;
    } else {
      // WA Web not open — show 0 to avoid misleading numbers
      if (syncedChatsValEl) syncedChatsValEl.textContent = 0;
      if (syncedMsgsValEl)  syncedMsgsValEl.textContent  = 0;
    }
  }

  function refreshSyncStats() {
    loadSyncSettings();
  }

  // Save Sync Settings
  if (saveSyncSettingsBtn) {
    saveSyncSettingsBtn.addEventListener("click", () => {
      const webhookUrl = webhookUrlInput ? webhookUrlInput.value.trim() : "";
      const syncEnabled = syncEnableToggle ? syncEnableToggle.checked : true;

      if (!webhookUrl) {
        alert("Please enter a valid n8n Webhook URL.");
        return;
      }

      chrome.storage.local.set({
        whatsapp_sync_webhook_url: webhookUrl,
        whatsapp_sync_enabled: syncEnabled
      }, () => {
        if (syncFeedbackBanner) {
          syncFeedbackBanner.className = "progress-banner";
          syncFeedbackBanner.classList.remove("hidden");
          if (syncFeedbackText) syncFeedbackText.textContent = "Sync settings saved successfully!";
          setTimeout(() => syncFeedbackBanner.classList.add("hidden"), 3000);
        }
      });
    });
  }

  // Sync Active Chat Now Button Handler
  if (syncActiveNowBtn) {
    syncActiveNowBtn.addEventListener("click", () => {
      syncActiveNowBtn.disabled = true;
      if (syncFeedbackBanner) {
        syncFeedbackBanner.className = "progress-banner";
        syncFeedbackBanner.classList.remove("hidden");
        if (syncFeedbackText) syncFeedbackText.textContent = "Initiating active chat sync...";
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes("web.whatsapp.com")) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "SYNC_ACTIVE_CHAT" }, (response) => {
            syncActiveNowBtn.disabled = false;
            if (chrome.runtime.lastError || !response || !response.success) {
              if (syncFeedbackBanner) {
                syncFeedbackBanner.className = "progress-banner progress-error";
                if (syncFeedbackText) syncFeedbackText.textContent = response?.error || "Failed to trigger sync. Make sure WhatsApp Web is loaded.";
              }
            } else {
              if (syncFeedbackBanner) {
                syncFeedbackBanner.className = "progress-banner";
                if (syncFeedbackText) syncFeedbackText.textContent = response.message || "Active chat synchronized successfully!";
                setTimeout(() => {
                  refreshSyncStats();
                  syncFeedbackBanner.classList.add("hidden");
                }, 3000);
              }
            }
          });
        } else {
          syncActiveNowBtn.disabled = false;
          if (syncFeedbackBanner) {
            syncFeedbackBanner.className = "progress-banner progress-error";
            if (syncFeedbackText) syncFeedbackText.textContent = "Please open WhatsApp Web tab to sync active conversation.";
          }
        }
      });
    });
  }

  loadSyncSettings();

  // 2. Refreshes Dashboard UI from storage
  function refreshDashboard() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(["whatsapp_messages", "totalCaptured", "lastCapturedMessage"], (res) => {
      const messages = res.whatsapp_messages || [];
      const total = res.totalCaptured !== undefined ? res.totalCaptured : messages.length;

      totalCountEl.textContent = total;

      const lastMsg = res.lastCapturedMessage || (messages.length > 0 ? messages[messages.length - 1] : null);
      const lastTimeDisplayEl = document.getElementById("lastTimeDisplay");

      if (lastMsg) {
        emptyStateEl.classList.add("hidden");
        messageDetailsEl.classList.remove("hidden");

        const isIncoming = lastMsg.direction === "INCOMING";
        directionBadgeEl.textContent = lastMsg.direction || "INCOMING";
        directionBadgeEl.className = `badge ${isIncoming ? "badge-incoming" : "badge-outgoing"}`;

        typeValEl.textContent = lastMsg.messageType || "TEXT";
        senderValEl.textContent = isIncoming ? (lastMsg.senderName || "Unknown") : `Me ➔ ${lastMsg.receiverName || lastMsg.chatName}`;
        chatValEl.textContent = lastMsg.chatName || "Unknown";
        phoneValEl.textContent = lastMsg.phoneNumber || "Not Available";
        msgValEl.textContent = lastMsg.message || "";
        lastTimeValEl.textContent = lastMsg.timestamp || "--:--";
        if (lastTimeDisplayEl) lastTimeDisplayEl.textContent = lastMsg.timestamp || "";

        if (lastMsg.attachment) {
          attachmentMetaRowEl.classList.remove("hidden");
          const sizeStr = lastMsg.attachment.size ? ` (${window.WAMonitor?.Helpers?.formatFileSize(lastMsg.attachment.size)})` : "";
          const fileName = lastMsg.attachment.fileName || "Media Attachment";

          if (lastMsg.attachment.mediaUrl) {
            attachmentMetaValEl.innerHTML = `<a href="${lastMsg.attachment.mediaUrl}" target="_blank" style="color:var(--accent,#00c896);text-decoration:none;display:inline-flex;align-items:center;gap:5px;">🔗 ${fileName}${sizeStr}</a>`;
          } else {
            attachmentMetaValEl.textContent = `📎 ${fileName}${sizeStr}`;
          }
        } else {
          attachmentMetaRowEl.classList.add("hidden");
        }
      } else {
        emptyStateEl.classList.remove("hidden");
        messageDetailsEl.classList.add("hidden");
        lastTimeValEl.textContent = "--:--";
        if (lastTimeDisplayEl) lastTimeDisplayEl.textContent = "";
      }
    });
  }

  // 3. Monitor active send task progress banner
  function checkSendTaskProgress() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(["active_send_task"], (res) => {
      const task = res.active_send_task;
      if (!task) {
        progressBanner.classList.add("hidden");
        submitSendBtn.disabled = false;
        return;
      }

      const createdTime = new Date(task.createdAt || Date.now()).getTime();
      const isStale = Date.now() - createdTime > 25000; // Auto-expire task if older than 25 seconds

      if (task.completed || task.error || isStale) {
        if (task.error) {
          progressBanner.className = "progress-banner progress-error";
          progressBanner.classList.remove("hidden");
          progressText.textContent = task.status || "Failed to send message.";
        } else {
          progressBanner.classList.add("hidden");
        }
        submitSendBtn.disabled = false;
      } else {
        progressBanner.classList.remove("hidden");
        progressBanner.className = "progress-banner";
        progressText.textContent = task.status || "Processing...";
        submitSendBtn.disabled = true;
      }
    });
  }

  // Initial loads
  refreshDashboard();
  checkSendTaskProgress();

  // Listen for storage updates
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.whatsapp_messages || changes.totalCaptured || changes.lastCapturedMessage) {
        refreshDashboard();
      }
      if (changes.active_send_task) {
        checkSendTaskProgress();
      }
    });
  }

  // 4. File Attachment Picker Handler
  attachmentPicker.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check File Size (Max 100MB)
    const MAX_SIZE = 104857600;
    if (file.size > MAX_SIZE) {
      alert(`File size (${(file.size / 1048576).toFixed(1)}MB) exceeds maximum limit of 100MB.`);
      attachmentPicker.value = "";
      return;
    }

    const H = window.WAMonitor?.Helpers;
    const formattedSize = H ? H.formatFileSize(file.size) : `${(file.size / 1024).toFixed(1)} KB`;

    fileNameVal.textContent = file.name;
    fileSizeVal.textContent = formattedSize;

    // Read File as Base64 DataURL
    const reader = new FileReader();
    reader.onload = (evt) => {
      selectedAttachment = {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        size: file.size,
        base64Data: evt.target.result
      };

      dropArea.classList.add("hidden");
      filePreviewCard.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  // Remove File Button Handler
  removeFileBtn.addEventListener("click", () => {
    selectedAttachment = null;
    attachmentPicker.value = "";
    filePreviewCard.classList.add("hidden");
    dropArea.classList.remove("hidden");
  });

  // 5. Form Submit Handler
  sendForm.addEventListener("submit", (e) => {
    e.preventDefault();

    let countryCode = countryCodeInput.value.trim();
    let phoneNumber = phoneNumberInput.value.trim();
    let messageText = messageTextInput.value;

    const cleanCountry = countryCode.replace(/\D/g, "");
    const cleanPhone = phoneNumber.replace(/\D/g, "");

    if (!cleanCountry) {
      alert("Please enter a valid Country Code (e.g. +91).");
      return;
    }
    if (!cleanPhone) {
      alert("Please enter a valid Phone Number.");
      return;
    }

    if ((!messageText || messageText.trim() === "") && !selectedAttachment) {
      alert("Please enter a message or select an attachment file.");
      return;
    }

    submitSendBtn.disabled = true;
    progressBanner.className = "progress-banner";
    progressBanner.classList.remove("hidden");
    progressText.textContent = "Opening WhatsApp...";

    chrome.runtime.sendMessage({
      action: "INITIATE_SEND",
      payload: {
        countryCode: `+${cleanCountry}`,
        phoneNumber: cleanPhone,
        message: messageText,
        attachment: selectedAttachment
      }
    }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        progressBanner.className = "progress-banner progress-error";
        progressText.textContent = response?.error || "Failed to initiate tab navigation.";
        submitSendBtn.disabled = false;
      } else {
        progressText.textContent = response.message || "Opening WhatsApp Chat...";
      }
    });
  });

  // Clear Storage Action
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to clear stored message history?")) {
        chrome.storage.local.remove(["whatsapp_messages", "totalCaptured", "lastCapturedMessage", "active_send_task"], () => {
          refreshDashboard();
          progressBanner.classList.add("hidden");
          submitSendBtn.disabled = false;
        });
      }
    });
  }

  /**
   * Safely dispatches a message to a Chrome tab, capturing chrome.runtime.lastError cleanly
   * to eliminate unhandled promise rejections ("Could not establish connection").
   */
  function safeSendTabMessage(tabId, message, callback) {
    if (typeof chrome === "undefined" || !chrome.tabs || !tabId) {
      if (typeof callback === "function") callback(null, { message: "Chrome tabs API unavailable" });
      return;
    }
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          if (typeof callback === "function") callback(null, err);
        } else {
          if (typeof callback === "function") callback(response, null);
        }
      });
    } catch (e) {
      if (typeof callback === "function") callback(null, e);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  MEDIA DOWNLOADER PRO ENGINE HANDLERS (WPPConnect + Inpage App Bridge)
  // ═══════════════════════════════════════════════════════

  async function runInMain(tabId, func, ...args) {
    if (!chrome.scripting) return null;
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args,
      world: 'MAIN'
    });
    return result;
  }

  async function injectFile(tabId, file) {
    if (!chrome.scripting) return;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file],
      world: 'MAIN'
    });
  }

  async function ensureInjected(tabId) {
    const hasWpp = await runInMain(tabId, () => !!window.WPP).catch(() => false);
    if (!hasWpp) {
      await injectFile(tabId, 'lib/wppconnect-wa-wrapped.js').catch((e) => console.warn('Vendor inject:', e.message));
    }

    const appLoaded = await runInMain(tabId, () => !!window.__WAMD_APP_LOADED__).catch(() => false);
    if (!appLoaded) {
      await injectFile(tabId, 'inpage/app.js').catch((e) => console.warn('App inject:', e.message));
    }
  }

  async function sendToPage(cmd, payload) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url || !tab.url.includes("web.whatsapp.com")) {
      throw new Error("Please open WhatsApp Web tab");
    }

    await ensureInjected(tab.id);

    return new Promise((resolve, reject) => {
      const handler = (msg) => {
        if (msg?.__from === 'wamd:content') {
          const p = msg.payload;
          if (p?.type === 'inpage:resp' && p?.cmd === cmd) {
            chrome.runtime.onMessage.removeListener(handler);
            resolve(p.payload);
          } else if (p?.type === 'inpage:error' && p?.cmd === cmd) {
            chrome.runtime.onMessage.removeListener(handler);
            reject(new Error(p.error || "Execution error"));
          }
        }
      };

      chrome.runtime.onMessage.addListener(handler);

      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(handler);
        reject(new Error(`Timeout waiting for command ${cmd}`));
      }, 60000);

      chrome.tabs.sendMessage(tab.id, {
        __to: 'wamd:content',
        payload: { __from: 'wamd:inpage', type: 'popup:cmd', cmd, payload }
      });
    });
  }

  function getSelectedCategories() {
    const cats = [];
    if (dlFilterImg && dlFilterImg.checked) cats.push("IMAGE");
    if (dlFilterVid && dlFilterVid.checked) cats.push("VIDEO");
    if (dlFilterAud && dlFilterAud.checked) cats.push("AUDIO");
    if (dlFilterDoc && dlFilterDoc.checked) cats.push("DOCUMENT");
    return cats;
  }

  async function populateTargetChats() {
    if (!chrome.tabs || !dlTargetChat) return;
    const loader = document.getElementById("contactLoader");
    try {
      if (loader) loader.classList.remove("hidden");
      const currentVal = dlTargetChat.value || "ACTIVE";
      if (!dlTargetChat.options || dlTargetChat.options.length <= 2) {
        dlTargetChat.innerHTML = `
          <option value="LOADING" disabled selected>⏳ Fetching contacts from WhatsApp Web...</option>
          <option value="ACTIVE">Currently Active Chat (Default)</option>
          <option value="ALL">All Available Chats (Bulk)</option>
        `;
      }

      const chatList = await sendToPage('listChats').catch(() => []);
      if (Array.isArray(chatList) && chatList.length > 0) {
        dlTargetChat.innerHTML = `
          <option value="ACTIVE">Currently Active Chat (Default)</option>
          <option value="ALL">All Available Chats (Bulk)</option>
        `;
        chatList.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = `Contact: ${c.name || c.id}`;
          dlTargetChat.appendChild(opt);
        });
        dlTargetChat.value = currentVal === "LOADING" ? "ACTIVE" : currentVal;
      } else {
        dlTargetChat.innerHTML = `
          <option value="ACTIVE">Currently Active Chat (Default)</option>
          <option value="ALL">All Available Chats (Bulk)</option>
        `;
      }
    } catch (_) {
      dlTargetChat.innerHTML = `
        <option value="ACTIVE">Currently Active Chat (Default)</option>
        <option value="ALL">All Available Chats (Bulk)</option>
      `;
    } finally {
      if (loader) loader.classList.add("hidden");
    }
  }

  async function scanActiveChatMedia(bypassDeepScan = false) {
    if (!chrome.tabs) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.includes("web.whatsapp.com")) {
        if (dlClosedBanner) dlClosedBanner.classList.remove("hidden");
        return;
      }
      if (dlClosedBanner) dlClosedBanner.classList.add("hidden");

      if (dlProgressCard) dlProgressCard.classList.remove("hidden");
      if (dlProgressStatus) dlProgressStatus.textContent = "Connecting to WhatsApp Web...";
      if (dlProgressPercent) dlProgressPercent.textContent = "0%";
      if (dlProgressFill) dlProgressFill.style.width = "0%";

      const isDeepScan = (bypassDeepScan !== true) && dlDeepScanToggle && dlDeepScanToggle.checked;

      // 1. Get Chat List to find active/selected chat
      const chatList = await sendToPage('listChats').catch(() => []);
      const selectedChat = dlTargetChat ? dlTargetChat.value : "ACTIVE";

      let targetChatId = "";
      if (selectedChat === "ACTIVE" || !selectedChat) {
        targetChatId = chatList[0]?.id || "";
      } else {
        const found = chatList.find(c => c.name === selectedChat || c.id === selectedChat);
        targetChatId = found ? found.id : selectedChat;
      }

      // Populate chat dropdown if empty
      if (dlTargetChat && chatList.length > 0) {
        const currentVal = dlTargetChat.value || "ACTIVE";
        dlTargetChat.innerHTML = `
          <option value="ACTIVE">Currently Active Chat (Default)</option>
          <option value="ALL">All Available Chats (Bulk)</option>
        `;
        chatList.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = `Contact: ${c.name || c.id}`;
          dlTargetChat.appendChild(opt);
        });
        dlTargetChat.value = currentVal;
      }

      // 2. Perform Deep Scan / Load More if toggled
      if (isDeepScan && targetChatId) {
        if (dlProgressStatus) dlProgressStatus.textContent = "Loading chat history (Deep Scan)...";
        for (let i = 1; i <= 5; i++) {
          if (dlProgressStatus) dlProgressStatus.textContent = `[${i}/5] Loading more messages...`;
          if (dlProgressPercent) dlProgressPercent.textContent = `${i * 15}%`;
          if (dlProgressFill) dlProgressFill.style.width = `${i * 15}%`;
          await sendToPage('loadMore', { selectedChatId: targetChatId }).catch(() => {});
        }
      }

      // 3. Get Stats & Media Items
      if (dlProgressStatus) dlProgressStatus.textContent = "Fetching chat media items...";
      const stats = await sendToPage('getStats', { selectedChatId: targetChatId }).catch(() => null);

      // Fallback: also request SCAN_CHAT_MEDIA from DOM/store hybrid
      safeSendTabMessage(tab.id, { action: "SCAN_CHAT_MEDIA", filters: { categories: getSelectedCategories() } }, (res, err) => {
        scannedMediaItems = res?.mediaItems || [];
        renderMediaGallery(scannedMediaItems);
        if (dlProgressCard) {
          setTimeout(() => dlProgressCard.classList.add("hidden"), 1000);
        }
      });
    } catch (e) {
      console.warn("[WA Downloader] Scan error:", e);
      if (dlProgressStatus) dlProgressStatus.textContent = e.message || "Error scanning chat.";
      setTimeout(() => dlProgressCard.classList.add("hidden"), 2500);
    }
  }

  function renderMediaGallery(items) {
    if (dlScannedCountEl) dlScannedCountEl.textContent = items.length;
    if (dlSelectedCountEl) dlSelectedCountEl.textContent = items.length;

    if (!items || items.length === 0) {
      if (dlEmptyState) dlEmptyState.classList.remove("hidden");
      if (dlGalleryGrid) dlGalleryGrid.classList.add("hidden");
      return;
    }

    if (dlEmptyState) dlEmptyState.classList.add("hidden");
    if (dlGalleryGrid) {
      dlGalleryGrid.classList.remove("hidden");
      dlGalleryGrid.innerHTML = "";

      items.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "media-card-item";

        let badgeClass = "badge-doc";
        let iconSvg = `📄`;
        if (item.mediaCategory === "IMAGE") { badgeClass = "badge-img"; iconSvg = "📷"; }
        else if (item.mediaCategory === "VIDEO") { badgeClass = "badge-vid"; iconSvg = "📹"; }
        else if (item.mediaCategory === "AUDIO") { badgeClass = "badge-aud"; iconSvg = "🎵"; }

        let thumbHtml = `<span style="font-size:24px;">${iconSvg}</span>`;
        if (item.thumbUrl || (item.mediaCategory === "IMAGE" && item.mediaUrl)) {
          thumbHtml = `<img src="${item.thumbUrl || item.mediaUrl}" alt="preview">`;
        }

        card.innerHTML = `
          <div class="media-thumb-box">${thumbHtml}</div>
          <div class="media-item-info">
            <span class="media-badge ${badgeClass}">${item.mediaCategory}</span>
            <span class="media-item-name" title="${item.fileName}">${item.fileName}</span>
            <span class="media-item-sub">${item.senderName} • ${item.timestamp || "Today"}</span>
          </div>
          <button class="btn-card-download" data-index="${index}">⬇️ Save File</button>
        `;

        const saveBtn = card.querySelector(".btn-card-download");
        saveBtn.onclick = () => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
              const tpl = dlFilenameTpl ? dlFilenameTpl.value : "";
              safeSendTabMessage(tabs[0].id, {
                action: "DOWNLOAD_MEDIA_ZIP",
                mediaItems: [item],
                options: { filenameTemplate: tpl, zipName: `${item.fileName}.zip` }
              }, (res, err) => {
                if (err) {
                  alert("Could not communicate with WhatsApp Web. Please refresh the WhatsApp Web tab (F5).");
                }
              });
            }
          });
        };

        dlGalleryGrid.appendChild(card);
      });
    }
  }

  async function startZipDownload() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.includes("web.whatsapp.com")) {
        alert("Please switch to WhatsApp Web tab.");
        return;
      }

      if (dlProgressCard) dlProgressCard.classList.remove("hidden");
      if (dlProgressStatus) dlProgressStatus.textContent = "Downloading & Encoding ZIP archive...";
      if (dlProgressPercent) dlProgressPercent.textContent = "10%";
      if (dlProgressFill) dlProgressFill.style.width = "10%";

      const chatList = await sendToPage('listChats').catch(() => []);
      const selectedChat = dlTargetChat ? dlTargetChat.value : "ACTIVE";

      let targetChatId = "";
      if (selectedChat === "ACTIVE" || !selectedChat) {
        targetChatId = chatList[0]?.id || "";
      } else {
        const found = chatList.find(c => c.name === selectedChat || c.id === selectedChat);
        targetChatId = found ? found.id : selectedChat;
      }

      // Trigger full in-page download via WPPConnect & LruMediaStore / MediaBlobCache
      const categories = getSelectedCategories().map(c => c.toLowerCase());
      const res = await sendToPage('download', {
        selectedChatId: targetChatId,
        types: categories.length > 0 ? categories : ['image', 'video', 'audio', 'document', 'sticker'],
        naming: { useDate: true, includeSenderName: true, captionSuffix: true },
        pack: { saveAsZip: true, pro: true, deepScan: dlDeepScanToggle ? dlDeepScanToggle.checked : true }
      });

      if (dlProgressStatus) dlProgressStatus.textContent = `Completed! Saved ${res?.count || 0} media files.`;
      if (dlProgressPercent) dlProgressPercent.textContent = "100%";
      if (dlProgressFill) dlProgressFill.style.width = "100%";

      setTimeout(() => {
        if (dlProgressCard) dlProgressCard.classList.add("hidden");
      }, 3500);
    } catch (e) {
      console.warn("[WA Downloader] ZIP Download Error:", e);
      // Fallback to legacy zip download if in-page command failed
      if (scannedMediaItems && scannedMediaItems.length > 0) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        safeSendTabMessage(tab.id, {
          action: "DOWNLOAD_MEDIA_ZIP",
          mediaItems: scannedMediaItems,
          options: { filenameTemplate: dlFilenameTpl ? dlFilenameTpl.value : "" }
        }, (r, err) => {});
      } else {
        if (dlProgressStatus) dlProgressStatus.textContent = e.message || "Error starting download.";
      }
    }
  }

  // Attach Media Downloader Pro event listeners
  if (dlScanBtn) dlScanBtn.addEventListener("click", scanActiveChatMedia);
  if (dlZipBtn) dlZipBtn.addEventListener("click", startZipDownload);
  if (dlStatusBtn) {
    dlStatusBtn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          safeSendTabMessage(tabs[0].id, { action: "DOWNLOAD_ACTIVE_STATUS" }, (res, err) => {
            if (err) {
              alert("Could not communicate with WhatsApp Web. Please refresh the WhatsApp Web tab (F5).");
            }
          });
        }
      });
    });
  }

  [dlFilterImg, dlFilterVid, dlFilterAud, dlFilterDoc, dlStartDate, dlEndDate, dlTargetChat].forEach((el) => {
    if (el) el.addEventListener("change", scanActiveChatMedia);
  });

  // Listen for progress updates from content script
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "MEDIA_DOWNLOAD_PROGRESS") {
        const p = msg.payload || {};
        if (dlProgressCard) dlProgressCard.classList.remove("hidden");
        if (dlProgressStatus) dlProgressStatus.textContent = p.message || p.status || "Downloading...";
        if (dlProgressPercent) dlProgressPercent.textContent = `${p.percent || 0}%`;
        if (dlProgressFill) dlProgressFill.style.width = `${p.percent || 0}%`;

        if (p.status === "completed") {
          setTimeout(() => {
            if (dlProgressCard) dlProgressCard.classList.add("hidden");
          }, 3500);
        }
      }

      if (msg.type === "DEEP_SCAN_PROGRESS") {
        const p = msg.payload || {};
        if (dlProgressStatus) dlProgressStatus.textContent = `Deep scanning chat... (${p.scrollCount}/${p.maxScrolls})`;
        if (dlProgressPercent) dlProgressPercent.textContent = `${p.percent}%`;
        if (dlProgressFill) dlProgressFill.style.width = `${p.percent}%`;
      }

      if (msg.type === "DEEP_SCAN_COMPLETED") {
        scanActiveChatMedia(true);
      }
    });
  }


  // ── Theme Toggle ──────────────────────────────────────
  const themBtn = document.getElementById("themBtn");
  const THEME_KEY = "wa_monitor_theme";

  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
  }

  // Load saved theme
  try {
    const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
    applyTheme(savedTheme);
  } catch (e) { /* ignore */ }

  if (themBtn) {
    themBtn.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-mode");
      try { localStorage.setItem(THEME_KEY, isLight ? "light" : "dark"); } catch (e) { /* ignore */ }
    });
  }

  // ── WA Web Status Check ──────────────────────────────
  let waWebIsOpen = false;

  function updateStatusBadge(isActive) {
    const badge = document.getElementById("statusBadge");
    if (!badge) return;
    if (isActive) {
      badge.className = "status-badge status-active";
      statusTextEl.textContent = "Active";
    } else {
      badge.className = "status-badge status-inactive";
      statusTextEl.textContent = "Open WA Web";
    }
  }

  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const isWATab = tab && tab.url && tab.url.includes("web.whatsapp.com");

      if (isWATab) {
        waWebIsOpen = true;
        updateStatusBadge(true);
        updateWAWebBanner();
        updateSyncCounts();

        // Inject inpage engine and load contacts into target dropdown
        ensureInjected(tab.id).then(() => {
          populateTargetChats();
        }).catch(() => {
          populateTargetChats();
        });
      } else {
        waWebIsOpen = false;
        updateStatusBadge(false);
        updateWAWebBanner();
        updateSyncCounts();
      }
    });
  } else {
    updateStatusBadge(false);
    updateWAWebBanner();
    updateSyncCounts();
  }

  function updateWAWebBanner() {
    // Monitor tab banner
    const monBanner  = document.getElementById("waClosedBanner");
    // Sync tab banner
    const syncBanner = document.getElementById("syncClosedBanner");

    if (!waWebIsOpen) {
      if (monBanner)  monBanner.classList.remove("hidden");
      if (syncBanner) syncBanner.classList.remove("hidden");
    } else {
      if (monBanner)  monBanner.classList.add("hidden");
      if (syncBanner) syncBanner.classList.add("hidden");
    }
  }
});
