/**
 * WhatsApp Web Message Monitor - Chat Navigator Engine
 * Namespace: window.WAMonitor.ChatNavigator
 * Fast, 100% in-page SPA chat navigation without page reloads.
 * Combines App Boot Waiting, Anchor Link SPA Dispatch, and Search Bar DOM Automation.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.ChatNavigator = {
  previousChatName: "",

  /**
   * Records active conversation title prior to automation
   */
  recordPreviousChat: function () {
    const P = window.WAMonitor.MessageParser;
    if (P && typeof P.getChatName === "function") {
      const current = P.getChatName();
      if (current && current !== "Unknown Chat") {
        this.previousChatName = current;
      }
    }
  },

  /**
   * Attempts to switch back to the previous conversation in sidebar if available
   */
  restorePreviousChat: function () {
    if (!this.previousChatName) return;

    const C = window.WAMonitor.Constants;
    const D = window.WAMonitor.DOMHelper;
    const targetName = this.previousChatName;

    const rows = document.querySelectorAll(C.SELECTORS.SIDEBAR_ROW);
    for (const row of rows) {
      const titleSpan = row.querySelector("span[title]");
      if (titleSpan && (titleSpan.getAttribute("title") === targetName || titleSpan.textContent.includes(targetName))) {
        window.WAMonitor.Helpers?.log(`Restoring previous conversation view: "${targetName}"`);
        if (D && D.triggerClick) {
          D.triggerClick(row);
        } else {
          try { row.click(); } catch (e) {}
        }
        break;
      }
    }

    this.previousChatName = "";
  },

  /**
   * Waits for WhatsApp Web application root layout (#app, #side, or QR code) to finish initial boot
   */
  waitForAppReady: function (timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const C = window.WAMonitor.Constants;
      const H = window.WAMonitor.Helpers;

      if (document.querySelector(C.SELECTORS.CHAT_INPUT) || document.querySelector("#side") || document.querySelector("#pane-side")) {
        resolve(true);
        return;
      }

      if (document.querySelector(C.SELECTORS.QR_CODE_CANVAS)) {
        reject(new Error("WhatsApp Web is not logged in. Please scan QR code first."));
        return;
      }

      let timer = null;
      const observer = new MutationObserver(() => {
        if (!H.isContextValid()) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          reject(new Error("Extension context invalidated."));
          return;
        }

        if (document.querySelector(C.SELECTORS.QR_CODE_CANVAS)) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          reject(new Error("WhatsApp Web is not logged in. Please scan QR code first."));
          return;
        }

        if (document.querySelector(C.SELECTORS.CHAT_INPUT) || document.querySelector("#side") || document.querySelector("#pane-side")) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          resolve(true);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error("WhatsApp Web initial boot timed out. Please scan QR code or check internet."));
      }, timeoutMs);
    });
  },

  /**
   * Navigates to a phone number 100% IN-PAGE without triggering page reloads.
   */
  navigateToPhoneInPage: async function (fullPhone) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;
    const D = window.WAMonitor.DOMHelper;

    const cleanPhone = (fullPhone || "").replace(/\D/g, "");
    if (!cleanPhone) {
      throw new Error("Invalid phone number for in-page navigation.");
    }

    H.log(`Navigating in-page to phone [${cleanPhone}]...`);

    // 1. Wait for WhatsApp Web application root layout to finish boot
    await this.waitForAppReady(15000);

    // 2. Check if target chat is already open in #main
    const activeHeader = document.querySelector(C.SELECTORS.CHAT_TITLE);
    if (activeHeader && activeHeader.textContent.includes(cleanPhone.slice(-8))) {
      const existingInput = document.querySelector(C.SELECTORS.CHAT_INPUT);
      if (existingInput) return { ready: true, inputElement: existingInput };
    }

    // STRATEGY 1: In-Page Anchor Link Click
    try {
      let navLink = document.getElementById("wa-monitor-spa-link");
      if (!navLink) {
        navLink = document.createElement("a");
        navLink.id = "wa-monitor-spa-link";
        navLink.style.display = "none";
        document.body.appendChild(navLink);
      }
      navLink.href = `https://web.whatsapp.com/send?phone=${cleanPhone}`;
      navLink.click();
      
      // Sync history pushState
      window.history.pushState({}, "", `/send?phone=${cleanPhone}`);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    } catch (e) {
      H.log("Strategy 1 anchor click error:", "warn", e);
    }

    // Fast check (1.8 seconds) if chat opened via Strategy 1
    try {
      const state1 = await this.waitForChatReady(1800);
      if (state1 && state1.inputElement) {
        return state1;
      }
    } catch (e) {
      H.log("Strategy 1 wait timed out, initiating Strategy 2 (Search Bar DOM Trigger)...", "info");
    }

    // STRATEGY 2: WhatsApp Search Bar / New Chat DOM Automation
    try {
      // Locate Search Trigger / Icon / Input Box
      let searchTrigger = document.querySelector("span[data-icon='search']") || 
                          document.querySelector("button[aria-label*='Search']") || 
                          document.querySelector("div[title*='Search']") ||
                          document.querySelector(C.SELECTORS.SEARCH_INPUT);

      if (searchTrigger) {
        D.triggerClick(searchTrigger);
        await new Promise((res) => setTimeout(res, 300));
      }

      // Find Search Input Box
      let searchInput = document.querySelector(C.SELECTORS.SEARCH_INPUT) || 
                        document.querySelector("#side div[contenteditable='true']") ||
                        document.querySelector("div[contenteditable='true'][data-tab='3']");

      if (searchInput) {
        D.insertContentEditableText(searchInput, cleanPhone);
        await new Promise((res) => setTimeout(res, 800));

        // Find and click matching search result item
        let resultRow = document.querySelector(C.SELECTORS.SEARCH_RESULT_ROW) ||
                        document.querySelector("#pane-side div[role='listitem']") ||
                        document.querySelector("div[data-testid='cell-frame-container']");

        if (resultRow) {
          D.triggerClick(resultRow);
          await new Promise((res) => setTimeout(res, 500));
        }
      }
    } catch (e) {
      H.log("Strategy 2 Search Bar error:", "warn", e);
    }

    // Final Chat Ready Wait (15s timeout limit)
    return await this.waitForChatReady(15000);
  },

  /**
   * Waits until WhatsApp Web loads the chat conversation or detects an error modal
   */
  waitForChatReady: function (timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const C = window.WAMonitor.Constants;
      const H = window.WAMonitor.Helpers;

      const inputEl = document.querySelector(C.SELECTORS.CHAT_INPUT);
      if (inputEl) {
        resolve({ ready: true, inputElement: inputEl });
        return;
      }

      if (document.querySelector(C.SELECTORS.QR_CODE_CANVAS)) {
        reject(new Error("WhatsApp Web is not logged in. Please scan QR code first."));
        return;
      }

      let timer = null;

      const observer = new MutationObserver(() => {
        if (!H.isContextValid()) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          reject(new Error("Extension context invalidated."));
          return;
        }

        if (document.querySelector(C.SELECTORS.QR_CODE_CANVAS)) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          reject(new Error("WhatsApp Web is not logged in. Please scan QR code first."));
          return;
        }

        const modalEl = document.querySelector(C.SELECTORS.INVALID_NUMBER_MODAL);
        if (modalEl) {
          const modalText = modalEl.textContent || "";
          if (modalText.toLowerCase().includes("invalid") || modalText.toLowerCase().includes("not on whatsapp") || modalText.includes("url")) {
            observer.disconnect();
            if (timer) clearTimeout(timer);
            this.dismissInvalidModal(modalEl);
            reject(new Error("Phone number is invalid or not registered on WhatsApp."));
            return;
          }
        }

        const inputFound = document.querySelector(C.SELECTORS.CHAT_INPUT);
        if (inputFound) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          resolve({ ready: true, inputElement: inputFound });
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout (${Math.round(timeoutMs / 1000)}s) loading chat. Please verify phone number format and internet.`));
      }, timeoutMs);
    });
  },

  /**
   * Automatically dismisses invalid phone number dialog popup
   */
  dismissInvalidModal: function (modalEl) {
    if (!modalEl) return;
    const okBtn = modalEl.querySelector("button");
    if (okBtn) {
      try { okBtn.click(); } catch (e) {}
    }
  }
};
