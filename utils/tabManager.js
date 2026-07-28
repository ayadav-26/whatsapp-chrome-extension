/**
 * WhatsApp Web Message Monitor - Tab Manager Engine
 * Namespace: window.WAMonitor.TabManager / self.WAMonitor.TabManager
 * Centralized manager for finding, caching, reusing, and focusing WhatsApp Web tabs.
 * Prevents duplicate tabs and prevents infinite loop navigations.
 */

(function () {
  "use strict";

  const root = typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : globalThis);
  root.WAMonitor = root.WAMonitor || {};

  root.WAMonitor.TabManager = {
    cachedTabId: null,

    /**
     * Retrieves an existing WhatsApp Web tab or creates a new one only if none exists.
     */
    getValidWhatsAppTab: function (targetPhone, callback) {
      if (typeof chrome === "undefined" || !chrome.tabs) {
        if (typeof callback === "function") callback(null, new Error("chrome.tabs API not available."));
        return;
      }

      // 1. Try cached tab ID first
      if (this.cachedTabId !== null) {
        chrome.tabs.get(this.cachedTabId, (tab) => {
          if (!chrome.runtime.lastError && tab && tab.url && tab.url.includes("web.whatsapp.com")) {
            if (typeof callback === "function") callback(tab, false);
            return;
          }

          // Cached tab closed or invalid -> Reset cache and fallback to query
          this.cachedTabId = null;
          this.queryExistingWhatsAppTab(targetPhone, callback);
        });
        return;
      }

      // 2. Query open tabs matching web.whatsapp.com/*
      this.queryExistingWhatsAppTab(targetPhone, callback);
    },

    /**
     * Queries browser tabs matching web.whatsapp.com/*
     */
    queryExistingWhatsAppTab: function (targetPhone, callback) {
      chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
        if (chrome.runtime.lastError) {
          if (typeof callback === "function") callback(null, chrome.runtime.lastError);
          return;
        }

        if (tabs && tabs.length > 0) {
          // Reuse existing tab (isNewTab: false)
          const validTab = tabs.find(t => t.active) || tabs[0];
          this.cachedTabId = validTab.id;
          console.log(`[WA Monitor] Reusing existing WhatsApp Web tab [ID: ${validTab.id}]`);
          if (typeof callback === "function") callback(validTab, false);
        } else {
          // No existing tab found -> Create a new tab with target phone URL (isNewTab: true)
          const cleanPhone = (targetPhone || "").replace(/\D/g, "");
          const initialUrl = cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}` : "https://web.whatsapp.com/";
          
          console.log(`[WA Monitor] No existing WhatsApp tab found. Opening initial tab [${initialUrl}]...`);
          chrome.tabs.create({ url: initialUrl, active: true }, (newTab) => {
            if (newTab) {
              this.cachedTabId = newTab.id;
            }
            if (typeof callback === "function") callback(newTab, true);
          });
        }
      });
    },

    /**
     * Focuses/activates existing WhatsApp tab WITHOUT reloading URL if tab already exists
     */
    activateWhatsAppTab: function (targetPhone, callback) {
      this.getValidWhatsAppTab(targetPhone, (tab, isNewTab, err) => {
        if (err || !tab) {
          if (typeof callback === "function") callback(null, err || new Error("Could not resolve WhatsApp Web tab."));
          return;
        }

        if (!tab.active) {
          chrome.tabs.update(tab.id, { active: true }, (updatedTab) => {
            if (typeof callback === "function") callback(updatedTab || tab, isNewTab);
          });
        } else {
          if (typeof callback === "function") callback(tab, isNewTab);
        }
      });
    },

    /**
     * Clears cached tab ID
     */
    clearCache: function () {
      this.cachedTabId = null;
    }
  };
})();
