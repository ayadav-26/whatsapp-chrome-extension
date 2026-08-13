/**
 * WhatsApp Web Media Downloader Pro - In-Page Overlay Engine
 * Namespace: window.WAMonitor.MediaOverlay
 * Injects floating action bar, quick download buttons, status downloader overlay,
 * and an in-page modal dialog directly inside web.whatsapp.com.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.MediaOverlay = {
  isInitialized: false,

  /**
   * Initializes overlay injections and DOM mutation observers for UI elements
   */
  init: function () {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.injectStyles();
    this.startObserver();
  },

  /**
   * Injects CSS styles for overlay components into document head
   */
  injectStyles: function () {
    if (document.getElementById("wa-media-downloader-styles")) return;

    const style = document.createElement("style");
    style.id = "wa-media-downloader-styles";
    style.textContent = `
      /* Header Download Button */
      .wa-dl-header-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(135deg, #00a884, #008f6f);
        color: #ffffff;
        border: none;
        border-radius: 20px;
        padding: 6px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        margin-left: 10px;
        box-shadow: 0 2px 8px rgba(0, 168, 132, 0.3);
        transition: all 0.2s ease;
        z-index: 99;
      }
      .wa-dl-header-btn:hover {
        background: linear-gradient(135deg, #00c49a, #00a884);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 168, 132, 0.4);
      }

      /* Hover Download Button on Messages */
      .wa-dl-hover-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(11, 20, 26, 0.85);
        color: #00a884;
        border: 1px solid rgba(0, 168, 132, 0.4);
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
        z-index: 10;
      }
      .message-in:hover .wa-dl-hover-btn,
      .message-out:hover .wa-dl-hover-btn {
        opacity: 1;
      }
      .wa-dl-hover-btn:hover {
        transform: scale(1.1);
        background: #00a884;
        color: #ffffff;
      }

      /* Status Downloader Overlay Button */
      .wa-dl-status-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #00a884;
        color: #ffffff;
        border: none;
        border-radius: 30px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* In-Page Modal Container */
      .wa-dl-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(11, 20, 26, 0.85);
        backdrop-filter: blur(4px);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .wa-dl-modal {
        background: #111b21;
        border: 1px solid #222d34;
        border-radius: 16px;
        width: 480px;
        max-width: 90vw;
        padding: 24px;
        color: #e9edef;
        box-shadow: 0 16px 40px rgba(0,0,0,0.6);
        font-family: Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif;
      }
      .wa-dl-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #222d34;
        padding-bottom: 14px;
        margin-bottom: 16px;
      }
      .wa-dl-modal-title {
        font-size: 18px;
        font-weight: 700;
        color: #00a884;
      }
      .wa-dl-modal-close {
        background: none;
        border: none;
        color: #8696a0;
        font-size: 20px;
        cursor: pointer;
      }
      .wa-dl-filter-row {
        display: flex;
        gap: 12px;
        margin-bottom: 14px;
      }
      .wa-dl-checkbox-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #d1d7db;
        cursor: pointer;
      }
      .wa-dl-btn-primary {
        width: 100%;
        background: #00a884;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 12px;
      }
      .wa-dl-progress-bar-bg {
        height: 6px;
        background: #202c33;
        border-radius: 3px;
        overflow: hidden;
        margin-top: 12px;
      }
      .wa-dl-progress-bar-fill {
        height: 100%;
        width: 0%;
        background: #00a884;
        transition: width 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  },

  /**
   * Monitors WhatsApp Web DOM for active header and message renders
   */
  startObserver: function () {
    const checkAndInject = () => {
      this.injectHeaderButton();
      this.injectHoverButtons();
      this.injectStatusButton();
    };

    setInterval(checkAndInject, 2000);
    checkAndInject();
  },

  /**
   * Injects header download button into active chat header
   */
  injectHeaderButton: function () {
    const header = document.querySelector("#main header");
    if (!header || header.querySelector(".wa-dl-header-btn")) return;

    const toolbar = header.querySelector("div[role='toolbar'], div._ak6r") || header;

    const btn = document.createElement("button");
    btn.className = "wa-dl-header-btn";
    btn.innerHTML = `<span>📥</span> <span>Download Media (ZIP)</span>`;
    btn.onclick = (e) => {
      e.stopPropagation();
      this.openModal();
    };

    toolbar.appendChild(btn);
  },

  /**
   * Injects single-click download buttons on media message items
   */
  injectHoverButtons: function () {
    const mediaNodes = document.querySelectorAll("#main div.message-in, #main div.message-out");

    mediaNodes.forEach((node) => {
      if (node.querySelector(".wa-dl-hover-btn")) return;

      const hasMedia = node.querySelector("img, video, audio, span[data-icon='document']");
      if (!hasMedia) return;

      // Ensure relative positioning
      const innerWrapper = node.querySelector("div[class*='_am'] , div[class*='_ak']") || node;
      if (window.getComputedStyle(innerWrapper).position === "static") {
        innerWrapper.style.position = "relative";
      }

      const btn = document.createElement("button");
      btn.className = "wa-dl-hover-btn";
      btn.title = "Download this media file";
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

      btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();

        const parsedMsg = window.WAMonitor?.MessageParser ? window.WAMonitor.MessageParser.parseMessage(node) : null;
        if (!parsedMsg) return;

        const attachment = parsedMsg.attachmentDetails || {};
        const mediaItem = {
          id: parsedMsg.messageId,
          chatName: parsedMsg.chatName || "Chat",
          senderName: parsedMsg.senderName || "Sender",
          messageType: parsedMsg.messageType || "IMAGE",
          fileName: attachment.fileName || "media_file",
          mediaUrl: attachment.mediaUrl || attachment.thumbUrl || "",
          mimeType: parsedMsg.mediaMetadata?.mimeType || "application/octet-stream",
          timestamp: parsedMsg.timestamp || "",
          node: node
        };

        if (window.WAMonitor?.MediaDownloader) {
          window.WAMonitor.MediaDownloader.downloadSingleItem(mediaItem);
        }
      };

      innerWrapper.appendChild(btn);
    });
  },

  /**
   * Injects status downloader button when WhatsApp status story modal is active
   */
  injectStatusButton: function () {
    const dialog = document.querySelector("div[role='dialog'], div._ak8l");
    const existingBtn = document.querySelector(".wa-dl-status-btn");

    if (dialog && (dialog.querySelector("video") || dialog.querySelector("img"))) {
      if (!existingBtn) {
        const btn = document.createElement("button");
        btn.className = "wa-dl-status-btn";
        btn.innerHTML = `<span>⬇️</span> <span>Save Status</span>`;
        btn.onclick = () => {
          if (window.WAMonitor?.MediaDownloader) {
            window.WAMonitor.MediaDownloader.downloadActiveStatus();
          }
        };
        document.body.appendChild(btn);
      }
    } else {
      if (existingBtn) existingBtn.remove();
    }
  },

  /**
   * Opens in-page modal dialog for ZIP media download
   */
  openModal: function () {
    if (document.querySelector(".wa-dl-modal-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "wa-dl-modal-overlay";

    const MD = window.WAMonitor?.MediaDownloader;
    const availableChats = MD ? MD.getAvailableChats() : [];
    let chatOptionsHtml = `<option value="ACTIVE">Currently Active Chat (Default)</option>`;
    availableChats.forEach((chat) => {
      chatOptionsHtml += `<option value="${chat}">Contact: ${chat}</option>`;
    });

    overlay.innerHTML = `
      <div class="wa-dl-modal">
        <div class="wa-dl-modal-header">
          <div class="wa-dl-modal-title">📥 WA Media Downloader Pro</div>
          <button class="wa-dl-modal-close" id="wa-dl-close-btn">&times;</button>
        </div>

        <div style="font-size: 13px; color: #8696a0; margin-bottom: 8px;">Target Conversation:</div>
        <select id="wa-modal-chat-target" style="width:100%; background:#1e2d38; color:#e9edef; border:1px solid #2a3f50; border-radius:8px; padding:8px; font-size:12px; margin-bottom:12px; outline:none;">
          ${chatOptionsHtml}
        </select>

        <div style="font-size: 13px; color: #8696a0; margin-bottom: 8px;">Select media types to bundle into ZIP:</div>

        <div class="wa-dl-filter-row">
          <label class="wa-dl-checkbox-label"><input type="checkbox" id="wa-cb-img" checked> 📷 Photos</label>
          <label class="wa-dl-checkbox-label"><input type="checkbox" id="wa-cb-vid" checked> 📹 Videos</label>
          <label class="wa-dl-checkbox-label"><input type="checkbox" id="wa-cb-aud" checked> 🎵 Audio</label>
          <label class="wa-dl-checkbox-label"><input type="checkbox" id="wa-cb-doc" checked> 📄 Documents</label>
        </div>

        <div style="margin-bottom: 14px;">
          <label class="wa-dl-checkbox-label">
            <input type="checkbox" id="wa-cb-deep-scan"> 🔍 Deep Scan (Auto-scroll chat to discover older media)
          </label>
        </div>

        <div id="wa-dl-status-label" style="font-size: 13px; color: #00a884; font-weight: 600; min-height: 18px;">Ready to scan</div>

        <div class="wa-dl-progress-bar-bg">
          <div class="wa-dl-progress-bar-fill" id="wa-dl-progress-fill"></div>
        </div>

        <button class="wa-dl-btn-primary" id="wa-dl-start-btn">Download Chat Media as ZIP</button>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("wa-dl-close-btn").onclick = () => overlay.remove();
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    const startBtn = document.getElementById("wa-dl-start-btn");
    const statusLabel = document.getElementById("wa-dl-status-label");
    const progressFill = document.getElementById("wa-dl-progress-fill");

    startBtn.onclick = () => {
      const categories = [];
      if (document.getElementById("wa-cb-img").checked) categories.push("IMAGE");
      if (document.getElementById("wa-cb-vid").checked) categories.push("VIDEO");
      if (document.getElementById("wa-cb-aud").checked) categories.push("AUDIO");
      if (document.getElementById("wa-cb-doc").checked) categories.push("DOCUMENT");

      const deepScan = document.getElementById("wa-cb-deep-scan").checked;
      const targetChat = document.getElementById("wa-modal-chat-target").value;

      startBtn.disabled = true;
      startBtn.style.opacity = "0.6";

      const executeDownload = () => {
        const MD = window.WAMonitor?.MediaDownloader;
        if (!MD) {
          statusLabel.textContent = "Error: MediaDownloader module not loaded.";
          startBtn.disabled = false;
          return;
        }

        const items = MD.scanActiveChatMedia({ categories: categories, targetChat: targetChat });
        if (items.length === 0) {
          statusLabel.textContent = "No media files found matching selected criteria.";
          progressFill.style.width = "0%";
          startBtn.disabled = false;
          startBtn.style.opacity = "1";
          return;
        }

        MD.downloadAsZip(items, {}, (progress) => {
          progressFill.style.width = `${progress.percent || 0}%`;
          statusLabel.textContent = progress.message || progress.status || "";

          if (progress.status === "completed" || progress.status === "error" || progress.status === "cancelled") {
            startBtn.disabled = false;
            startBtn.style.opacity = "1";
            if (progress.status === "completed") {
              setTimeout(() => overlay.remove(), 2500);
            }
          }
        });
      };

      if (deepScan && window.WAMonitor?.DeepScanner) {
        statusLabel.textContent = "Deep scanning chat history for older media...";
        window.WAMonitor.DeepScanner.start({ maxScrolls: 15 }, (p) => {
          progressFill.style.width = `${p.percent / 2}%`;
          statusLabel.textContent = `Deep scanning chat... (${p.scrollCount}/${p.maxScrolls})`;
        }, () => {
          executeDownload();
        });
      } else {
        executeDownload();
      }
    };
  }
};

