/**
 * WhatsApp Web Message Monitor - DOM Helper Utilities
 * Namespace: window.WAMonitor.DOMHelper
 * Handles element waiting via MutationObserver and React-compatible text insertion.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.DOMHelper = {
  /**
   * Waits for a DOM element matching selector to appear using MutationObserver
   */
  waitForElement: function (selector, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const H = window.WAMonitor.Helpers;
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }

      let timer = null;

      const observer = new MutationObserver(() => {
        if (H && !H.isContextValid()) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          reject(new Error("Extension context invalidated while waiting for element."));
          return;
        }

        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for element: ${selector}`));
      }, timeoutMs);
    });
  },

  /**
   * Inserts text into WhatsApp Web's contenteditable input box
   * Preserves line breaks, unicode, emojis, and triggers React state changes.
   */
  insertContentEditableText: function (inputElement, text) {
    if (!inputElement || typeof text !== "string") {
      throw new Error("Invalid input element or message text.");
    }

    inputElement.focus();

    // Select all existing content and clear
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);

    // Split by line breaks to insert preserving newlines
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 0) {
        document.execCommand("insertText", false, lines[i]);
      }
      if (i < lines.length - 1) {
        // Insert line break in contenteditable
        document.execCommand("insertLineBreak", false, null);
      }
    }

    // Dispatch input & change events for React state sync
    inputElement.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));
    inputElement.dispatchEvent(new Event("change", { bubbles: true }));

    return true;
  },

  /**
   * Waits for a DOM element matching selector to disappear (unmount)
   */
  waitForElementToDisappear: function (selector, timeoutMs = 10000) {
    return new Promise((resolve) => {
      const H = window.WAMonitor.Helpers;
      if (!document.querySelector(selector)) {
        resolve(true);
        return;
      }

      let timer = null;
      const observer = new MutationObserver(() => {
        if (H && !H.isContextValid()) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          resolve(false);
          return;
        }

        if (!document.querySelector(selector)) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          resolve(true);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      timer = setTimeout(() => {
        observer.disconnect();
        resolve(!document.querySelector(selector));
      }, timeoutMs);
    });
  },

  /**
   * Triggers a comprehensive MouseEvent click sequence for React components
   */
  triggerClick: function (element) {
    if (!element || !(element instanceof HTMLElement)) return false;

    // Resolve closest interactive parent if element is SVG or inner span
    const target = element.closest("div[role='button']") || 
                   element.closest("button") || 
                   element.closest("span[role='button']") || 
                   element.parentElement || 
                   element;

    try { target.focus(); } catch (e) {}

    try {
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      target.click();
      return true;
    } catch (e) {
      try {
        element.click();
        return true;
      } catch (err) {
        return false;
      }
    }
  }
};
