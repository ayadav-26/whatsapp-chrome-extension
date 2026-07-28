/**
 * WhatsApp Web Message Monitor - Storage Layer
 * Namespace: window.WAMonitor.Storage
 * Isolated storage module handling chrome.storage.local persistence.
 * Deduplicates stored messages array while keeping lastCapturedMessage active.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.Storage = {
  /**
   * Saves a captured message object to chrome.storage.local
   * Deduplicates against stored array using messageId
   */
  saveMessage: function (messageObject, callback) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    if (!H.isContextValid()) {
      return;
    }

    if (!messageObject || !messageObject.messageId) {
      return;
    }

    try {
      const storage = chrome.storage;
      if (!storage || !storage.local) return;

      storage.local.get([C.STORAGE_KEYS.MESSAGES, C.STORAGE_KEYS.TOTAL_CAPTURED], (res) => {
        let messagesList = res[C.STORAGE_KEYS.MESSAGES] || [];

        // Deduplication check against stored array
        const existingIndex = messagesList.findIndex((msg) => msg.messageId === messageObject.messageId);

        if (existingIndex !== -1) {
          const existing = messagesList[existingIndex];
          const mediaUrlResolved = (!existing.attachment?.mediaUrl && messageObject.attachment?.mediaUrl);
          const chatIdResolved = (!existing.chatId && messageObject.chatId);

          if (mediaUrlResolved || chatIdResolved) {
            messagesList[existingIndex] = messageObject;
            storage.local.set({
              [C.STORAGE_KEYS.MESSAGES]: messagesList,
              [C.STORAGE_KEYS.LAST_CAPTURED]: messageObject
            }, () => {
              if (typeof callback === "function") {
                callback(messageObject, messagesList.length);
              }
            });
            return;
          }

          // Update lastCapturedMessage so Popup UI displays active chat preview, without duplicating array
          storage.local.set({ [C.STORAGE_KEYS.LAST_CAPTURED]: messageObject }, () => {
            if (typeof callback === "function") {
              callback(messageObject, messagesList.length);
            }
          });
          return;
        }

        // Append new unique message
        messagesList.push(messageObject);
        const newTotal = messagesList.length;

        storage.local.set({
          [C.STORAGE_KEYS.MESSAGES]: messagesList,
          [C.STORAGE_KEYS.TOTAL_CAPTURED]: newTotal,
          [C.STORAGE_KEYS.LAST_CAPTURED]: messageObject
        }, () => {
          H.log(`Saved new message to storage. Total stored: ${newTotal}`);
          if (typeof callback === "function") {
            callback(messageObject, newTotal);
          }
        });
      });
    } catch (e) {
      H.log("Error saving to chrome.storage.local:", "error", e);
    }
  },

  /**
   * Retrieves all stored messages array
   */
  getMessages: function (callback) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    if (!H.isContextValid() || typeof callback !== "function") return;

    try {
      chrome.storage.local.get([C.STORAGE_KEYS.MESSAGES], (res) => {
        callback(res[C.STORAGE_KEYS.MESSAGES] || []);
      });
    } catch (e) {
      H.log("Error reading messages from storage:", "error", e);
    }
  },

  /**
   * Gets Webhook URL and Sync Enabled settings from storage
   */
  getSyncSettings: function (callback) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    if (!H.isContextValid() || typeof callback !== "function") return;

    try {
      chrome.storage.local.get([C.STORAGE_KEYS.WEBHOOK_URL, C.STORAGE_KEYS.SYNC_ENABLED], (res) => {
        let webhookUrl = res[C.STORAGE_KEYS.WEBHOOK_URL];
        if (!webhookUrl || typeof webhookUrl !== "string" || webhookUrl.includes("localhost")) {
          webhookUrl = C.SYNC_DEFAULTS.DEFAULT_WEBHOOK_URL;
          chrome.storage.local.set({ [C.STORAGE_KEYS.WEBHOOK_URL]: webhookUrl });
        }
        const syncEnabled = res[C.STORAGE_KEYS.SYNC_ENABLED] !== undefined ? res[C.STORAGE_KEYS.SYNC_ENABLED] : C.SYNC_DEFAULTS.DEFAULT_SYNC_ENABLED;

        callback({ webhookUrl, syncEnabled });
      });
    } catch (e) {
      callback({
        webhookUrl: C.SYNC_DEFAULTS.DEFAULT_WEBHOOK_URL,
        syncEnabled: C.SYNC_DEFAULTS.DEFAULT_SYNC_ENABLED
      });
    }
  },

  /**
   * Saves Webhook URL and Sync Enabled settings
   */
  saveSyncSettings: function (settings, callback) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    if (!H.isContextValid()) return;

    const payload = {};
    if (settings.webhookUrl !== undefined) payload[C.STORAGE_KEYS.WEBHOOK_URL] = settings.webhookUrl;
    if (settings.syncEnabled !== undefined) payload[C.STORAGE_KEYS.SYNC_ENABLED] = !!settings.syncEnabled;

    chrome.storage.local.set(payload, () => {
      H.log("Sync settings saved successfully:", "info", payload);
      if (typeof callback === "function") callback(true);
    });
  },

  /**
   * Retrieves synced messages map and synced chats map
   */
  getSyncedCache: function (callback) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    if (!H.isContextValid() || typeof callback !== "function") return;

    chrome.storage.local.get([C.STORAGE_KEYS.SYNCED_MESSAGES, C.STORAGE_KEYS.SYNCED_CHATS, C.STORAGE_KEYS.LAST_SYNC_TIME], (res) => {
      callback({
        syncedMessages: res[C.STORAGE_KEYS.SYNCED_MESSAGES] || {},
        syncedChats: res[C.STORAGE_KEYS.SYNCED_CHATS] || {},
        lastSyncTime: res[C.STORAGE_KEYS.LAST_SYNC_TIME] || null
      });
    });
  },

  /**
   * Marks array of message IDs as synced in local storage
   */
  markMessagesSynced: function (messageIds, callback) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    if (!H.isContextValid() || !Array.isArray(messageIds) || messageIds.length === 0) {
      if (typeof callback === "function") callback(0);
      return;
    }

    chrome.storage.local.get([C.STORAGE_KEYS.SYNCED_MESSAGES], (res) => {
      const syncedMap = res[C.STORAGE_KEYS.SYNCED_MESSAGES] || {};
      const now = new Date().toISOString();

      messageIds.forEach((id) => {
        if (id) syncedMap[id] = now;
      });

      chrome.storage.local.set({
        [C.STORAGE_KEYS.SYNCED_MESSAGES]: syncedMap,
        [C.STORAGE_KEYS.LAST_SYNC_TIME]: now
      }, () => {
        if (typeof callback === "function") callback(Object.keys(syncedMap).length);
      });
    });
  },

  /**
   * Marks a chat ID as synced in local storage
   */
  markChatSynced: function (chatId, chatInfo, callback) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    if (!H.isContextValid() || !chatId) return;

    chrome.storage.local.get([C.STORAGE_KEYS.SYNCED_CHATS], (res) => {
      const syncedChats = res[C.STORAGE_KEYS.SYNCED_CHATS] || {};
      syncedChats[chatId] = {
        ...chatInfo,
        lastSyncedAt: new Date().toISOString()
      };

      chrome.storage.local.set({ [C.STORAGE_KEYS.SYNCED_CHATS]: syncedChats }, () => {
        if (typeof callback === "function") callback(syncedChats);
      });
    });
  }
};
