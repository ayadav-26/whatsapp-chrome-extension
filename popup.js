/**
 * WhatsApp Web Message Monitor & Sender - Popup Controller
 * Manages Monitor dashboard, Automatic Sender form, File Attachment picker, and Progress banners.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Tab elements
  const tabMonitorBtn = document.getElementById("tabMonitorBtn");
  const tabSendBtn = document.getElementById("tabSendBtn");
  const tabSyncBtn = document.getElementById("tabSyncBtn");
  const viewMonitor = document.getElementById("viewMonitor");
  const viewSend = document.getElementById("viewSend");
  const viewSync = document.getElementById("viewSync");

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

  // 1. Tab Navigation
  tabMonitorBtn.addEventListener("click", () => {
    tabMonitorBtn.classList.add("active");
    tabSendBtn.classList.remove("active");
    if (tabSyncBtn) tabSyncBtn.classList.remove("active");
    viewMonitor.classList.remove("hidden");
    viewSend.classList.add("hidden");
    if (viewSync) viewSync.classList.add("hidden");
  });

  tabSendBtn.addEventListener("click", () => {
    tabSendBtn.classList.add("active");
    tabMonitorBtn.classList.remove("active");
    if (tabSyncBtn) tabSyncBtn.classList.remove("active");
    viewSend.classList.remove("hidden");
    viewMonitor.classList.add("hidden");
    if (viewSync) viewSync.classList.add("hidden");
  });

  if (tabSyncBtn) {
    tabSyncBtn.addEventListener("click", () => {
      tabSyncBtn.classList.add("active");
      tabMonitorBtn.classList.remove("active");
      tabSendBtn.classList.remove("active");
      if (viewSync) viewSync.classList.remove("hidden");
      viewMonitor.classList.add("hidden");
      viewSend.classList.add("hidden");
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

      const syncedChats = res.whatsapp_synced_chats || {};
      const syncedMsgs = res.whatsapp_synced_messages || {};

      if (syncedChatsValEl) syncedChatsValEl.textContent = Object.keys(syncedChats).length;
      if (syncedMsgsValEl) syncedMsgsValEl.textContent = Object.keys(syncedMsgs).length;
    });
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

        if (lastMsg.attachment) {
          attachmentMetaRowEl.classList.remove("hidden");
          const sizeStr = lastMsg.attachment.size ? ` (${window.WAMonitor?.Helpers?.formatFileSize(lastMsg.attachment.size)})` : "";
          const fileName = lastMsg.attachment.fileName || "Media Attachment";
          
          if (lastMsg.attachment.mediaUrl) {
            attachmentMetaValEl.innerHTML = `<a href="${lastMsg.attachment.mediaUrl}" target="_blank" style="color: #00a884; text-decoration: underline;">🔗 ${fileName}${sizeStr}</a>`;
          } else {
            attachmentMetaValEl.textContent = `${fileName}${sizeStr}`;
          }
        } else {
          attachmentMetaRowEl.classList.add("hidden");
        }
      } else {
        emptyStateEl.classList.remove("hidden");
        messageDetailsEl.classList.add("hidden");
        lastTimeValEl.textContent = "--:--";
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

  // Check tab status
  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes("web.whatsapp.com")) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "GET_STATUS" }, (response) => {
          if (chrome.runtime.lastError) {
            statusTextEl.textContent = "Refresh Page";
          } else if (response && response.active) {
            statusTextEl.textContent = "Active";
          }
        });
      } else {
        statusTextEl.textContent = "Open WA Web";
      }
    });
  }
});
