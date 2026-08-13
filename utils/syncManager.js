/**
 * WhatsApp Web Message Monitor - Chat Synchronization Manager
 * Namespace: window.WAMonitor.SyncManager
 * Responsible for compiling structured payloads (chat, messages, media),
 * deduplicating against local storage cache, and POSTing to n8n Webhook / Backend API.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.SyncManager = {
  isSyncing: false,
  pendingSyncQueue: [],
  debounceTimer: null,

  /**
   * Main entry point to synchronize messages for an active conversation
   */
  syncActiveChat: function (chatInfo, messagesList, forceResync = false) {
    const H = window.WAMonitor.Helpers;
    const S = window.WAMonitor.Storage;

    if (!H.isContextValid()) return;

    if (!chatInfo || !Array.isArray(messagesList) || messagesList.length === 0) {
      H.log("SyncManager: No active chat info or messages available to sync.", "warn");
      return;
    }

    // Check if Sync is enabled in settings
    S.getSyncSettings((settings) => {
      if (!settings.syncEnabled) {
        H.log("SyncManager: Auto-sync is currently disabled in extension settings.");
        return;
      }

      if (!settings.webhookUrl || typeof settings.webhookUrl !== "string" || !settings.webhookUrl.trim()) {
        H.log("SyncManager: Webhook URL is not configured.", "warn");
        return;
      }

      S.getSyncedCache(({ syncedMessages, syncedChats }) => {
        // Filter out messages that have already been synchronized
        const newMessagesToSync = messagesList.filter((msg) => {
          if (!msg || !msg.messageId) return false;
          if (forceResync) return true;
          return !syncedMessages[msg.messageId];
        });

        const isChatAlreadySynced = !!syncedChats[chatInfo.chatId];

        if (newMessagesToSync.length === 0 && isChatAlreadySynced && !forceResync) {
          H.log(`SyncManager: All ${messagesList.length} messages in chat "${chatInfo.chatName}" are already synchronized.`);
          return;
        }

        const messagesToProcess = (newMessagesToSync.length > 0 || forceResync) ? (forceResync ? messagesList : newMessagesToSync) : messagesList.slice(-5);

        H.log(`SyncManager: Synchronizing chat "${chatInfo.chatName}" (${messagesToProcess.length} messages) to Webhook...`);

        this.processBatchSync(chatInfo, messagesToProcess, settings.webhookUrl);
      });
    });
  },

  /**
   * Compiles payload schema and posts to n8n Webhook
   */
  processBatchSync: function (chatInfo, messagesList, webhookUrl) {
    const H = window.WAMonitor.Helpers;
    const S = window.WAMonitor.Storage;

    // 1. Build messages array and media metadata array
    const payloadMessages = [];
    const payloadMedia = [];
    const syncedMessageIds = [];

    messagesList.forEach((msg) => {
      if (!msg || !msg.messageId) return;

      syncedMessageIds.push(msg.messageId);

      // Clean message representation
      payloadMessages.push({
        messageId: msg.messageId,
        direction: msg.direction || "INCOMING",
        senderName: msg.senderName || "Unknown",
        receiverName: msg.receiverName || chatInfo.chatName,
        phoneNumber: msg.phoneNumber || chatInfo.phoneNumber || "",
        messageType: msg.messageType || "TEXT",
        text: msg.message || "",
        timestamp: msg.timestamp || new Date().toLocaleTimeString(),
        status: msg.status || "NEW"
      });

      // Extract media object if media type or attachment is present
      const isMedia = (msg.messageType && ["IMAGE", "VIDEO", "AUDIO", "VOICE_NOTE", "DOCUMENT", "STICKER"].includes(msg.messageType)) || !!msg.attachment;
      if (isMedia && msg.messageType !== "TEXT" && msg.messageType !== "UNKNOWN") {
        const att = msg.attachment || {};
        payloadMedia.push({
          messageId: msg.messageId,
          mediaType: att.fileType || msg.messageType || "IMAGE",
          fileName: att.fileName || (msg.messageType === "IMAGE" ? "image.jpg" : (msg.messageType === "VIDEO" ? "video.mp4" : "attachment")),
          mimeType: msg.mediaMetadata?.mimeType || (window.WAMonitor?.MediaParser?.inferMimeType(msg.messageType, att.fileName) || "application/octet-stream"),
          caption: msg.mediaMetadata?.caption || (msg.message && !msg.message.startsWith("[") ? msg.message : ""),
          thumbnailAvailable: !!(att.thumbUrl || att.mediaUrl),
          mediaUrl: att.mediaUrl || "",
          thumbUrl: att.thumbUrl || "",
          base64Data: "",
          directPath: "",
          mediaKey: "",
          encFilehash: "",
          filehash: "",
          fileSize: 0,
          cdnUrl: "",
          isDownloaded: !!(att.mediaUrl && (att.mediaUrl.startsWith("blob:") || att.mediaUrl.startsWith("http"))),
          timestamp: msg.timestamp || new Date().toLocaleTimeString(),
          sender: msg.senderName || "Unknown",
          domNode: msg.domNode || null
        });
      }
    });

    // 2. Asynchronously extract CDN download metadata and convert blob URLs / DOM elements to Base64
    const MP = window.WAMonitor.MediaParser;
    const blobPromises = payloadMedia.map((m) => {
      return new Promise((resolve) => {
        const primaryUrl = m.mediaUrl;
        const fallbackUrl = m.thumbUrl;
        const domNode = m.domNode;
        const isVideo = (m.mediaType === "VIDEO" || m.mediaType === "video");

        const fetchCdnMeta = (next) => {
          if (MP && MP.fetchMediaCdnMetadata && m.messageId) {
            MP.fetchMediaCdnMetadata(m.messageId, (cdnMeta) => {
              if (cdnMeta) {
                m.directPath = cdnMeta.directPath || "";
                m.mediaKey = cdnMeta.mediaKey || "";
                m.encFilehash = cdnMeta.encFilehash || "";
                m.filehash = cdnMeta.filehash || "";
                m.fileSize = cdnMeta.fileSize || 0;
                m.cdnUrl = cdnMeta.cdnUrl || "";
              }
              next();
            });
          } else {
            next();
          }
        };

        fetchCdnMeta(() => {
          const attemptConvert = (url, node, next) => {
            if (MP && MP.convertBlobToBase64) {
              MP.convertBlobToBase64(url, (base64) => {
                if (base64 && (!isVideo || !base64.startsWith("data:image/"))) {
                  m.base64Data = base64;
                  resolve();
                } else {
                  next();
                }
              }, node, m.messageId, m.mediaType, m.mimeType);
            } else {
              next();
            }
          };

          attemptConvert(primaryUrl, domNode, () => {
            if (!isVideo) {
              attemptConvert(fallbackUrl, domNode, () => {
                if (domNode && MP && MP.convertElementToCanvasBase64) {
                  const canvasBase64 = MP.convertElementToCanvasBase64(domNode);
                  if (canvasBase64) {
                    m.base64Data = canvasBase64;
                  }
                }
                resolve();
              });
            } else {
              resolve();
            }
          });
        });
      });
    });

    Promise.all(blobPromises).then(() => {
      // Clean up domNode reference before JSON stringifying payload
      payloadMedia.forEach((m) => {
        delete m.domNode;
      });
      // 3. Generate structured payload matching n8n / PostgreSQL schema
      const syncPayload = {
        chat: {
          phoneNumber: chatInfo.phoneNumber || "",
          chatName: chatInfo.chatName || "Unknown Chat",
          chatId: chatInfo.chatId || `${chatInfo.chatName}@c.us`
        },
        messages: payloadMessages,
        media: payloadMedia,
        syncedAt: new Date().toISOString(),
        source: "whatsapp_web_chrome_extension",
        version: "1.3.0"
      };

      // 4. Post payload to n8n Webhook
      this.postPayloadToWebhook(webhookUrl, syncPayload, (success, errorMsg) => {
        if (success) {
          H.log(`SyncManager: Successfully synchronized ${payloadMessages.length} messages and ${payloadMedia.length} media items.`);
          S.markMessagesSynced(syncedMessageIds);
          S.markChatSynced(syncPayload.chat.chatId, syncPayload.chat);
        } else {
          H.log(`SyncManager: Synchronization failed for chat "${chatInfo.chatName}":`, "error", errorMsg);
        }
      });
    });
  },

  /**
   * Performs HTTP POST to the configured n8n Webhook endpoint via Background Service Worker (bypasses CORS)
   */
  postPayloadToWebhook: function (webhookUrl, payload, callback) {
    const H = window.WAMonitor.Helpers;

    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: "POST_WEBHOOK",
          webhookUrl: webhookUrl,
          payload: payload
        }, (res) => {
          if (chrome.runtime.lastError) {
            // Direct fetch fallback if runtime channel fails
            this.directFetchFallback(webhookUrl, payload, callback);
          } else if (res && res.success) {
            if (typeof callback === "function") callback(true, null);
          } else {
            const err = res ? res.error : "Webhook call failed.";
            if (typeof callback === "function") callback(false, err);
          }
        });
      } else {
        this.directFetchFallback(webhookUrl, payload, callback);
      }
    } catch (e) {
      this.directFetchFallback(webhookUrl, payload, callback);
    }
  },

  /**
   * Direct fetch fallback
   */
  directFetchFallback: function (webhookUrl, payload, callback) {
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
          if (typeof callback === "function") callback(true, null);
        } else {
          if (typeof callback === "function") callback(false, `HTTP ${response.status}: ${response.statusText}`);
        }
      })
      .catch((err) => {
        if (typeof callback === "function") callback(false, err?.message || "Network error or Webhook unreachable.");
      });
  },

  /**
   * Synchronizes a single real-time message as it arrives
   */
  syncSingleMessage: function (chatInfo, messageData) {
    if (!chatInfo || !messageData) return;
    this.syncActiveChat(chatInfo, [messageData], false);
  }
};
