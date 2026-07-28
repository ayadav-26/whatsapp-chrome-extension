/**
 * WhatsApp Web Message Monitor - Active Chat Detector Engine
 * Namespace: window.WAMonitor.ChatDetector
 * Responsible for detecting active conversation switches, verifying full DOM render,
 * and extracting active chat identity (chatName, phoneNumber, chatId).
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.ChatDetector = {
  currentChatId: null,
  currentChatName: "",
  chatChangeCallbacks: [],
  isObserving: false,
  headerObserver: null,

  /**
   * Extracts clean chat info (chatName, phoneNumber, chatId) from active #main header
   */
  getActiveChatInfo: function () {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;
    const P = window.WAMonitor.MessageParser;

    const chatName = P.getChatName();
    if (!chatName || chatName === "Unknown Chat") {
      return null;
    }

    // Secondary inspection: extract phone number from header subtitle / status text
    let phoneNumber = H.extractPhoneNumber(chatName) || "";
    if (!phoneNumber) {
      const headerSubtextEl = document.querySelector("#main header span[title*='+'], #main header div span[title], #main header div._ak8q, #main header span._ao3e");
      if (headerSubtextEl) {
        phoneNumber = H.extractPhoneNumber(headerSubtextEl.getAttribute("title") || headerSubtextEl.textContent) || "";
      }
    }

    const chatId = H.generateFallbackChatId(chatName, phoneNumber);

    return {
      chatName: chatName,
      phoneNumber: phoneNumber,
      chatId: chatId,
      detectedAt: new Date().toISOString()
    };
  },

  /**
   * Subscribes a callback to active chat change events
   */
  onChatChange: function (callback) {
    if (typeof callback === "function") {
      this.chatChangeCallbacks.push(callback);
    }
    this.initObserver();
  },

  /**
   * Initializes chat detector watching for active chat switches
   */
  initObserver: function () {
    if (this.isObserving) return;

    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    const checkAndNotifyChatSwitch = () => {
      if (!H.isContextValid()) return;

      const newActiveInfo = this.getActiveChatInfo();
      if (newActiveInfo && newActiveInfo.chatName && newActiveInfo.chatName !== "Unknown Chat") {
        if (newActiveInfo.chatName !== this.currentChatName || newActiveInfo.chatId !== this.currentChatId) {
          const oldChat = this.currentChatName;
          this.currentChatId = newActiveInfo.chatId;
          this.currentChatName = newActiveInfo.chatName;

          H.log(`ChatDetector: Conversation switched from "${oldChat || 'None'}" to "${newActiveInfo.chatName}" (${newActiveInfo.chatId})`);

          this.waitForChatRender(newActiveInfo, (readyInfo) => {
            this.chatChangeCallbacks.forEach((cb) => {
              try {
                cb(readyInfo);
              } catch (e) {
                H.log("ChatChange Callback Error:", "error", e);
              }
            });
          });
        }
      }
    };

    // Initial check
    const activeInfo = this.getActiveChatInfo();
    if (activeInfo) {
      this.currentChatId = activeInfo.chatId;
      this.currentChatName = activeInfo.chatName;
    }

    // Observe DOM container (#app or body) to catch header replacements on chat switch
    const targetContainer = document.querySelector(C.SELECTORS.APP_ROOT) || document.body;
    if (targetContainer) {
      if (this.headerObserver) this.headerObserver.disconnect();

      this.headerObserver = new MutationObserver(() => {
        checkAndNotifyChatSwitch();
      });

      this.headerObserver.observe(targetContainer, { childList: true, subtree: true });
      this.isObserving = true;
      H.log("ChatDetector: Container observer attached to WhatsApp Web app container.");
    }

    // Backup poller (every 1.5 seconds) to catch silent chat switches
    setInterval(() => {
      checkAndNotifyChatSwitch();
    }, 1500);
  },

  /**
   * Waits until the new chat messages have rendered in DOM before triggering sync
   */
  waitForChatRender: function (chatInfo, callback) {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    const mainContainer = document.querySelector(C.SELECTORS.MAIN_CHAT_CONTAINER);
    if (!mainContainer) {
      if (typeof callback === "function") callback(chatInfo);
      return;
    }

    let attempts = 0;
    const maxAttempts = 15; // Max ~3 seconds wait

    const checkRender = () => {
      attempts++;
      const messageNodes = mainContainer.querySelectorAll("div.message-in, div.message-out, div[data-id]");
      if ((messageNodes && messageNodes.length > 0) || attempts >= maxAttempts) {
        H.log(`ChatDetector: Chat render ready for "${chatInfo.chatName}" after ${attempts * 200}ms.`);
        if (typeof callback === "function") callback(chatInfo);
      } else {
        setTimeout(checkRender, 200);
      }
    };

    setTimeout(checkRender, 250);
  }
};
