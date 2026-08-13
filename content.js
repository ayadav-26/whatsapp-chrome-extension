/**
 * WhatsApp Web Message Monitor & Sender - Main Content Script
 * Entry point injected into https://web.whatsapp.com/*
 * Executes 100% in-page automation without ever reloading WhatsApp Web.
 */

(function () {
  "use strict";

  const H = window.WAMonitor?.Helpers;
  const O = window.WAMonitor?.Observer;
  const S = window.WAMonitor?.Storage;
  const MS = window.WAMonitor?.MessageSender;

  if (!H || !O || !S) {
    console.error("[WA Monitor] Error: Required modules (Helpers, Observer, or Storage) not loaded.");
    return;
  }

  H.log("Content Script Loaded. Initializing WhatsApp Web Monitor & Sender...");

  /**
   * Callback invoked whenever a new message (incoming or outgoing) is captured
   */
  function handleCapturedMessage(messageData) {
    if (!H.isContextValid()) return;

    // Output extracted message object to console.log()
    console.log("[WA Monitor] Extracted Message:", messageData);

    // Save message to storage using isolated storage layer (whatsapp_messages array)
    S.saveMessage(messageData, (savedMsg, totalCount) => {
      try {
        if (H.isContextValid()) {
          const runtime = chrome.runtime;
          if (runtime && runtime.sendMessage) {
            runtime.sendMessage({
              type: "MESSAGE_CAPTURED",
              payload: savedMsg,
              totalCaptured: totalCount
            });
          }
        }
      } catch (e) {
        // Ignored
      }
    });
  }

  /**
   * Checks chrome.storage.local for any pending automatic send tasks (text or attachment)
   */
  function checkAndExecuteSendTask() {
    if (!H.isContextValid() || !MS) return;

    try {
      chrome.storage.local.get(["active_send_task"], (res) => {
        const task = res.active_send_task;
        if (!task || task.completed) return;

        // Loop Prevention: Max 2 execution attempts allowed per task
        task.attempts = (task.attempts || 0) + 1;
        const createdAt = new Date(task.createdAt || Date.now()).getTime();

        if (task.attempts > 2 || (task.inProgress && Date.now() - createdAt > 45000)) {
          H.log("Task attempt limit reached. Clearing task to prevent infinite loop.", "warn");
          task.completed = true;
          task.error = true;
          task.status = "Failed to send message: Application timed out.";
          chrome.storage.local.set({ active_send_task: task });
          return;
        }

        H.log("Found pending in-page send task:", "info", task);

        // Record current chat title before in-page navigation
        if (window.WAMonitor?.ChatNavigator) {
          window.WAMonitor.ChatNavigator.recordPreviousChat();
        }

        task.inProgress = true;
        chrome.storage.local.set({ active_send_task: task });

        MS.sendMessage(task.phoneNumber || task.fullPhone, task.message, task.attachment, (progress) => {
          if (!H.isContextValid()) return;

          chrome.storage.local.get(["active_send_task"], (latest) => {
            const currentTask = latest.active_send_task || task;
            currentTask.status = progress.status;
            currentTask.error = progress.error || false;

            if (progress.status === window.WAMonitor.Constants?.SENDER_STATUS?.SUCCESS || progress.error) {
              currentTask.completed = true;
              currentTask.completedAt = new Date().toISOString();

              // Restore previous conversation view after completion
              if (window.WAMonitor?.ChatNavigator) {
                setTimeout(() => {
                  window.WAMonitor.ChatNavigator.restorePreviousChat();
                }, 2500);
              }
            }

            chrome.storage.local.set({ active_send_task: currentTask });
          });
        }).catch((err) => {
          H.log("In-Page Send Task Error:", "error", err);
          task.completed = true;
          task.error = true;
          task.status = err.message || "Failed to send message.";
          chrome.storage.local.set({ active_send_task: task });
        });
      });
    } catch (e) {
      // Ignored
    }
  }

  // 1. Start DOM Observer engine for message monitoring
  O.start(handleCapturedMessage);

  // 2. Initialize In-Page Media Downloader Overlay UI
  if (window.WAMonitor?.MediaOverlay) {
    window.WAMonitor.MediaOverlay.init();
  }

  // 3. Check and execute any automated message/attachment send tasks
  setTimeout(checkAndExecuteSendTask, 1500);

  // ── WAMD Communication Bridge (Page Script <-> Content Script <-> Background) ──
  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || data.__from !== 'wamd:inpage') return;

    if (data.type === 'wa:download') {
      try {
        chrome.runtime.sendMessage(
          { type: 'wa:download', payload: data.payload },
          (res) => {
            try {
              window.postMessage({
                __from: 'wamd:content',
                type: 'wa:download:ack',
                id: data.id,
                res: res || { ok: false, error: chrome.runtime.lastError?.message || 'no response' }
              }, '*');
            } catch {}
          }
        );
      } catch (e) {
        window.postMessage({
          __from: 'wamd:content',
          type: 'wa:download:ack',
          id: data.id,
          res: { ok: false, error: String(e) }
        }, '*');
      }
      return;
    }

    try {
      chrome.runtime.sendMessage({ __from: 'wamd:content', payload: data });
    } catch {}
  });

  // Handle Background & Popup messages
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request && request.__to === 'wamd:content') {
        if (request.payload && request.payload.type === 'ping') {
          sendResponse({ ok: true, pong: true });
          return true;
        }
        try {
          window.postMessage(request.payload, '*');
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        return true;
      }

      if (!H.isContextValid()) return false;

      if (request.action === "EXECUTE_IN_PAGE_SEND") {
        checkAndExecuteSendTask();
        sendResponse({ received: true });
        return true;
      }

      if (request.action === "GET_AVAILABLE_CHATS") {
        const MD = window.WAMonitor?.MediaDownloader;
        if (MD) {
          const chats = MD.getAvailableChats();
          sendResponse({ success: true, chats: chats });
        } else {
          sendResponse({ success: false, error: "MediaDownloader module not loaded." });
        }
        return true;
      }

      if (request.action === "SCAN_CHAT_MEDIA") {
        const MD = window.WAMonitor?.MediaDownloader;
        if (MD) {
          if (typeof MD.scanActiveChatMediaAsync === "function") {
            MD.scanActiveChatMediaAsync(request.filters || {}, (items) => {
              sendResponse({ success: true, mediaItems: items, count: items.length });
            });
          } else {
            const items = MD.scanActiveChatMedia(request.filters || {});
            sendResponse({ success: true, mediaItems: items, count: items.length });
          }
        } else {
          sendResponse({ success: false, error: "MediaDownloader module not loaded." });
        }
        return true;
      }

      if (request.action === "DOWNLOAD_MEDIA_ZIP") {
        const MD = window.WAMonitor?.MediaDownloader;
        if (MD) {
          MD.downloadAsZip(request.mediaItems || [], request.options || {}, (progress) => {
            try {
              if (chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                  type: "MEDIA_DOWNLOAD_PROGRESS",
                  payload: progress
                });
              }
            } catch (e) {}
          });
          sendResponse({ success: true, started: true });
        } else {
          sendResponse({ success: false, error: "MediaDownloader module not loaded." });
        }
        return true;
      }

      if (request.action === "START_DEEP_SCAN") {
        const DS = window.WAMonitor?.DeepScanner;
        if (DS) {
          DS.start(request.options || {}, (progress) => {
            try {
              if (chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                  type: "DEEP_SCAN_PROGRESS",
                  payload: progress
                });
              }
            } catch (e) {}
          }, (result) => {
            try {
              if (chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                  type: "DEEP_SCAN_COMPLETED",
                  payload: result
                });
              }
            } catch (e) {}
          });
          sendResponse({ success: true, started: true });
        } else {
          sendResponse({ success: false, error: "DeepScanner module not loaded." });
        }
        return true;
      }

      if (request.action === "DOWNLOAD_ACTIVE_STATUS") {
        const MD = window.WAMonitor?.MediaDownloader;
        if (MD) {
          MD.downloadActiveStatus();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "MediaDownloader module not loaded." });
        }
        return true;
      }

      if (request.action === "GET_STATUS") {
        S.getMessages((messages) => {
          sendResponse({
            active: O.isInitialized,
            totalCaptured: messages.length
          });
        });
        return true;
      }

      if (request.action === "TRIGGER_SEND_CHECK") {
        checkAndExecuteSendTask();
        sendResponse({ received: true });
        return true;
      }

      if (request.action === "SYNC_ACTIVE_CHAT") {
        if (window.WAMonitor?.SyncManager && window.WAMonitor?.ChatDetector) {
          const chatInfo = window.WAMonitor.ChatDetector.getActiveChatInfo();
          const mainContainer = document.querySelector("#main");

          if (chatInfo && mainContainer) {
            const messageNodes = mainContainer.querySelectorAll("div.message-in, div.message-out, div[data-id]");
            const messages = [];

            messageNodes.forEach((node) => {
              if (node.parentElement && node.parentElement.closest("div.message-in, div.message-out, div[data-id^='true_'], div[data-id^='false_']")) {
                return;
              }
              const msg = window.WAMonitor.MessageParser.parseMessage(node);
              if (msg && msg.messageId) messages.push(msg);
            });

            window.WAMonitor.SyncManager.syncActiveChat(chatInfo, messages, true);
            sendResponse({ success: true, message: `Synchronized ${messages.length} messages for chat "${chatInfo.chatName}".` });
          } else {
            sendResponse({ success: false, error: "No active conversation rendered in WhatsApp Web." });
          }
        } else {
          sendResponse({ success: false, error: "SyncManager or ChatDetector module not loaded." });
        }
        return true;
      }

      if (request.action === "GET_SYNC_STATUS") {
        S.getSyncSettings((settings) => {
          S.getSyncedCache(({ syncedMessages, syncedChats, lastSyncTime }) => {
            sendResponse({
              active: O.isInitialized,
              webhookUrl: settings.webhookUrl,
              syncEnabled: settings.syncEnabled,
              syncedChatsCount: Object.keys(syncedChats).length,
              syncedMessagesCount: Object.keys(syncedMessages).length,
              lastSyncTime: lastSyncTime
            });
          });
        });
        return true;
      }

      if (request.action === "SAVE_SYNC_SETTINGS") {
        S.saveSyncSettings(request.payload || {}, (success) => {
          sendResponse({ success: success });
        });
        return true;
      }

      return false;
    });
  }
})();

