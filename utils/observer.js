/**
 * WhatsApp Web Message Monitor - DOM MutationObserver Engine
 * Namespace: window.WAMonitor.Observer
 * Responsible for detecting real-time DOM changes, chat switching, and message capturing.
 * Strictly scopes all active message extractions to #main to prevent merging chats.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.Observer = {
  mainObserver: null,
  sidebarObserver: null,
  headerObserver: null,
  processedMessageIds: new Set(),
  sidebarProcessedMap: new Map(), // chatName -> lastMessageText
  onMessageCapturedCallback: null,
  isInitialized: false,
  currentChatTitle: "",

  /**
   * Starts monitoring WhatsApp Web DOM
   */
  start: function (onMessageCaptured) {
    if (typeof onMessageCaptured === "function") {
      this.onMessageCapturedCallback = onMessageCaptured;
    }

    const H = window.WAMonitor.Helpers;
    H.log("Initializing DOM Observer engine...");

    // 1. Wait & Observe #main container (Active chat window)
    this.waitForMainContainer(() => {
      this.setupMainObserver();
    });

    // 2. Observe #pane-side container (Unopened chat list notifications)
    this.setupSidebarObserver();

    // 3. Attach Active Chat Switch Detector for Automatic Synchronization
    if (window.WAMonitor?.ChatDetector) {
      window.WAMonitor.ChatDetector.onChatChange((chatInfo) => {
        H.log(`Observer: Chat change detected for "${chatInfo.chatName}". Syncing active conversation...`);
        this.captureActiveChatMessages();
      });
    }
  },

  /**
   * Waits for WhatsApp Web `#main` container to mount in DOM
   */
  waitForMainContainer: function (callback) {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    const mainContainer = document.querySelector(C.SELECTORS.MAIN_CHAT_CONTAINER);
    if (mainContainer) {
      H.log("Main chat container found in DOM.");
      callback();
      return;
    }

    H.log("Waiting for WhatsApp Web main container (#main)...");

    const bodyObserver = new MutationObserver((mutations, obs) => {
      if (!H.isContextValid()) {
        obs.disconnect();
        return;
      }

      const el = document.querySelector(C.SELECTORS.MAIN_CHAT_CONTAINER);
      if (el) {
        obs.disconnect();
        H.log("#main container detected.");
        callback();
      }
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
  },

  /**
   * Captures and updates all messages when opening or clicking any chat
   * STRICTLY SCOPED to #main container ONLY
   */
  captureActiveChatMessages: function () {
    const C = window.WAMonitor.Constants;
    const P = window.WAMonitor.MessageParser;
    const H = window.WAMonitor.Helpers;

    const mainContainer = document.querySelector(C.SELECTORS.MAIN_CHAT_CONTAINER);
    if (!mainContainer) return;

    this.currentChatTitle = P.getChatName();
    if (!this.currentChatTitle || this.currentChatTitle === "Unknown Chat") return;

    // Query messages strictly inside #main container
    const messageNodes = mainContainer.querySelectorAll("div.message-in, div.message-out, div[data-id]");
    if (!messageNodes || messageNodes.length === 0) return;

    let capturedCount = 0;
    const allCapturedMessages = [];

    messageNodes.forEach((node) => {
      // Ensure node is contained strictly inside #main
      if (!mainContainer.contains(node)) return;

      // Skip inner sub-nodes if parent container is already a message wrapper
      if (node.parentElement && node.parentElement.closest("div.message-in, div.message-out, div[data-id^='true_'], div[data-id^='false_']")) {
        return;
      }

      const extractedMsg = P.parseMessage(node);
      if (!extractedMsg || !extractedMsg.messageId) return;

      // Add ID to cache
      this.processedMessageIds.add(extractedMsg.messageId);

      if (this.processedMessageIds.size > C.CONFIG.MAX_PROCESSED_IDS_CACHE) {
        const firstItem = this.processedMessageIds.values().next().value;
        this.processedMessageIds.delete(firstItem);
      }

      capturedCount++;
      allCapturedMessages.push(extractedMsg);

      // Trigger callback for all visible chat messages when opening the chat
      if (typeof this.onMessageCapturedCallback === "function") {
        this.onMessageCapturedCallback(extractedMsg);
      }

      // If attachment mediaUrl is pending, schedule async retry to grab loaded blob URL
      if (extractedMsg.attachment && extractedMsg.attachment.isPendingUrl) {
        this.scheduleMediaUrlRetry(node, extractedMsg);
      }
    });

    H.log(`Active chat "${this.currentChatTitle}": Extracted & printed all ${capturedCount} messages to console.`);

    // Trigger Chat Synchronization to n8n Webhook / Backend API
    if (allCapturedMessages.length > 0 && window.WAMonitor?.SyncManager) {
      const chatInfo = (window.WAMonitor.ChatDetector ? window.WAMonitor.ChatDetector.getActiveChatInfo() : null) || {
        chatName: this.currentChatTitle,
        phoneNumber: H.extractPhoneNumber(this.currentChatTitle) || "",
        chatId: H.generateFallbackChatId(this.currentChatTitle, "")
      };
      if (chatInfo && chatInfo.chatName && chatInfo.chatName !== "Unknown Chat") {
        window.WAMonitor.SyncManager.syncActiveChat(chatInfo, allCapturedMessages);
      }
    }
  },

  /**
   * Schedules async retries for media nodes whose blob URLs load after DOM insertion
   */
  scheduleMediaUrlRetry: function (node, initialMsg) {
    if (!node || !initialMsg || !initialMsg.messageId) return;

    const P = window.WAMonitor.MessageParser;
    const H = window.WAMonitor.Helpers;

    const delays = [350, 850, 1800];

    delays.forEach((delay) => {
      setTimeout(() => {
        if (!H.isContextValid() || !node.isConnected) return;

        const updatedMsg = P.parseMessage(node);
        if (updatedMsg && updatedMsg.attachment && updatedMsg.attachment.mediaUrl) {
          if (!initialMsg.attachment.mediaUrl || initialMsg.attachment.mediaUrl !== updatedMsg.attachment.mediaUrl) {
            H.log(`Media URL resolved after ${delay}ms for message:`, "info", updatedMsg.messageId);
            initialMsg.attachment.mediaUrl = updatedMsg.attachment.mediaUrl;
            initialMsg.attachment.thumbUrl = updatedMsg.attachment.thumbUrl || updatedMsg.attachment.mediaUrl;
            initialMsg.attachment.isPendingUrl = false;

            if (typeof this.onMessageCapturedCallback === "function") {
              this.onMessageCapturedCallback(updatedMsg);
            }
          }
        }
      }, delay);
    });
  },

  /**
   * Sets up MutationObserver on #main container
   */
  setupMainObserver: function () {
    const C = window.WAMonitor.Constants;
    const P = window.WAMonitor.MessageParser;
    const H = window.WAMonitor.Helpers;

    const mainElement = document.querySelector(C.SELECTORS.MAIN_CHAT_CONTAINER);
    if (!mainElement) return;

    this.currentChatTitle = P.getChatName();

    // Capture latest messages in currently open chat
    this.captureActiveChatMessages();

    if (this.mainObserver) {
      this.mainObserver.disconnect();
    }

    this.mainObserver = new MutationObserver((mutations) => {
      this.handleMainMutations(mutations);
    });

    this.mainObserver.observe(mainElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "style", "href", "data-src"]
    });

    this.isInitialized = true;
    H.log("Main Observer actively watching active chat (#main).");

    // Watch chat switches & click events
    this.setupChatSwitchWatcher();
    this.setupChatClickListener();
  },

  /**
   * Listens for clicks anywhere in sidebar (#pane-side)
   */
  setupChatClickListener: function () {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    const sidebarEl = document.querySelector(C.SELECTORS.SIDEBAR_CONTAINER);
    if (sidebarEl) {
      sidebarEl.addEventListener("click", () => {
        setTimeout(() => {
          if (H.isContextValid()) {
            this.captureActiveChatMessages();
          }
        }, 350);
      });
    }
  },

  /**
   * Watches header for chat title changes (user switching chats)
   */
  setupChatSwitchWatcher: function () {
    const C = window.WAMonitor.Constants;
    const P = window.WAMonitor.MessageParser;
    const H = window.WAMonitor.Helpers;
    const headerEl = document.querySelector(C.SELECTORS.CHAT_HEADER);

    this.currentChatTitle = P.getChatName();

    if (headerEl) {
      if (this.headerObserver) {
        this.headerObserver.disconnect();
      }

      this.headerObserver = new MutationObserver(() => {
        if (!H.isContextValid()) {
          this.stop();
          return;
        }

        const newTitle = P.getChatName();
        if (newTitle && newTitle !== "Unknown Chat") {
          this.currentChatTitle = newTitle;
          H.log(`Switched conversation to: "${newTitle}". Extracting chat messages...`);
          
          setTimeout(() => {
            this.captureActiveChatMessages();
          }, 300);
        }
      });

      this.headerObserver.observe(headerEl, { childList: true, subtree: true, characterData: true });
    }
  },

  /**
   * Processes added DOM nodes in #main STRICTLY
   */
  handleMainMutations: function (mutations) {
    const C = window.WAMonitor.Constants;
    const P = window.WAMonitor.MessageParser;
    const H = window.WAMonitor.Helpers;

    const mainContainer = document.querySelector(C.SELECTORS.MAIN_CHAT_CONTAINER);
    if (!mainContainer) return;

    try {
      if (!H.isContextValid()) {
        this.stop();
        return;
      }
    } catch (e) {
      this.stop();
      return;
    }

    for (const mutation of mutations) {
      let targetNodes = [];

      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) targetNodes.push(n);
        });
      } else if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
        targetNodes.push(mutation.target);
      }

      if (targetNodes.length === 0) continue;

      targetNodes.forEach((node) => {
        if (!mainContainer.contains(node)) return; // Strictly ignore nodes outside #main

        let messageNodes = [];
        const matchesSelector = (el) => el.matches && (el.matches("div.message-in") || el.matches("div.message-out") || el.matches("div[data-id]"));

        if (matchesSelector(node)) {
          messageNodes.push(node);
        } else {
          const closestMsg = node.closest ? node.closest("div.message-in, div.message-out, div[data-id]") : null;
          if (closestMsg) {
            messageNodes.push(closestMsg);
          } else if (node.querySelectorAll) {
            const matched = node.querySelectorAll("div.message-in, div.message-out, div[data-id]");
            messageNodes = Array.from(matched);
          }
        }

        messageNodes.forEach((msgNode) => {
          if (!mainContainer.contains(msgNode)) return;

          const extractedMsg = P.parseMessage(msgNode);
          if (!extractedMsg || !extractedMsg.messageId) return;

          const hasPendingMedia = extractedMsg.attachment && extractedMsg.attachment.isPendingUrl;

          if (this.processedMessageIds.has(extractedMsg.messageId) && !hasPendingMedia) {
            return;
          }

          if (!hasPendingMedia) {
            this.processedMessageIds.add(extractedMsg.messageId);

            if (this.processedMessageIds.size > C.CONFIG.MAX_PROCESSED_IDS_CACHE) {
              const firstItem = this.processedMessageIds.values().next().value;
              this.processedMessageIds.delete(firstItem);
            }
          }

          H.log(`New Real-time Message Captured [${extractedMsg.direction}]:`, "info", extractedMsg);

          if (typeof this.onMessageCapturedCallback === "function") {
            this.onMessageCapturedCallback(extractedMsg);
          }

          if (hasPendingMedia) {
            this.scheduleMediaUrlRetry(msgNode, extractedMsg);
          }
        });
      });
    }
  },

  /**
   * Sets up MutationObserver on left sidebar (#pane-side) for unopened chat notifications
   */
  setupSidebarObserver: function () {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    const sidebarEl = document.querySelector(C.SELECTORS.SIDEBAR_CONTAINER);
    if (!sidebarEl) {
      setTimeout(() => {
        if (H.isContextValid()) this.setupSidebarObserver();
      }, 1000);
      return;
    }

    this.seedSidebarState();

    if (this.sidebarObserver) {
      this.sidebarObserver.disconnect();
    }

    this.sidebarObserver = new MutationObserver((mutations) => {
      this.handleSidebarMutations(mutations);
    });

    this.sidebarObserver.observe(sidebarEl, {
      childList: true,
      subtree: true,
      characterData: true
    });

    H.log("Sidebar Observer actively watching unopened chat list (#pane-side).");
  },

  /**
   * Seeds initial sidebar previews into memory
   */
  seedSidebarState: function () {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    const rows = document.querySelectorAll(C.SELECTORS.SIDEBAR_ROW);
    rows.forEach((row) => {
      const titleSpan = row.querySelector("span[title]");
      const chatName = titleSpan ? H.cleanText(titleSpan.getAttribute("title") || titleSpan.textContent) : null;
      const lastMsgEl = row.querySelector("span._ak8l, span._ak7h, div._ak8l");
      const lastMsgText = lastMsgEl ? H.cleanText(lastMsgEl.textContent) : "";

      if (chatName && lastMsgText) {
        this.sidebarProcessedMap.set(chatName, lastMsgText);
      }
    });
  },

  /**
   * Handles sidebar mutations for unopened chats
   */
  handleSidebarMutations: function (mutations) {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    const sidebarEl = document.querySelector(C.SELECTORS.SIDEBAR_CONTAINER);
    if (!sidebarEl) return;

    rowsLoop: for (const mutation of mutations) {
      const targetNode = mutation.target;
      if (!(targetNode instanceof HTMLElement)) continue;
      if (!sidebarEl.contains(targetNode)) continue;

      const row = targetNode.closest(C.SELECTORS.SIDEBAR_ROW) || targetNode;
      const titleSpan = row.querySelector ? row.querySelector("span[title]") : null;
      const chatName = titleSpan ? H.cleanText(titleSpan.getAttribute("title") || titleSpan.textContent) : null;

      if (!chatName) continue;

      if (chatName === this.currentChatTitle) continue;

      const lastMsgEl = row.querySelector ? row.querySelector("span._ak8l, span._ak7h, div._ak8l") : null;
      const lastMsgText = lastMsgEl ? H.cleanText(lastMsgEl.textContent) : "";

      if (!lastMsgText) continue;

      const previousText = this.sidebarProcessedMap.get(chatName);
      if (previousText === lastMsgText) continue;

      this.sidebarProcessedMap.set(chatName, lastMsgText);

      const timeEl = row.querySelector ? row.querySelector(C.SELECTORS.SIDEBAR_TIMESTAMP) : null;
      const timestamp = timeEl ? H.cleanText(timeEl.textContent) : new Date().toLocaleTimeString();

      const incomingRecord = {
        direction: C.DIRECTION.INCOMING,
        senderName: chatName,
        phoneNumber: H.extractPhoneNumber(chatName) || "",
        chatName: chatName,
        message: lastMsgText,
        messageType: C.MESSAGE_TYPES.TEXT,
        timestamp: timestamp,
        chatId: `${chatName}@c.us`,
        messageId: H.generateFallbackHash(chatName, timestamp, lastMsgText, C.DIRECTION.INCOMING),
        capturedAt: new Date().toISOString()
      };

      H.log(`Unopened Sidebar Chat Notification Captured for "${chatName}":`, "info", incomingRecord);

      if (typeof this.onMessageCapturedCallback === "function") {
        this.onMessageCapturedCallback(incomingRecord);
      }
    }
  },

  /**
   * Stops all observers
   */
  stop: function () {
    if (this.mainObserver) {
      this.mainObserver.disconnect();
      this.mainObserver = null;
    }
    if (this.sidebarObserver) {
      this.sidebarObserver.disconnect();
      this.sidebarObserver = null;
    }
    if (this.headerObserver) {
      this.headerObserver.disconnect();
      this.headerObserver = null;
    }
    this.isInitialized = false;
  }
};
