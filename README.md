# WhatsApp Web Message Monitor & Media Downloader Pro (Manifest V3)

A production-grade, privacy-focused Chrome Extension (Manifest V3) designed to extract, send, sync, and bulk-download media files (Photos, Videos, Audio/Voice Notes, Documents, Stickers, and Status Stories) from WhatsApp Web (`https://web.whatsapp.com/*`) as a locally compiled `.zip` archive.

---

## 🚀 Key Features

### 📦 Bulk Media Downloader & ZIP Export (WA Media Downloader Pro)
- **Local ZIP Archive Creation**: Packages all selected media files into a single `.zip` file generated client-side using `JSZip` and native browser `CompressionStream`. 100% offline & private.
- **Smart Category Filtering**: Filter by Photos (📷), Videos (📹), Audio/Voice Notes (🎵), Documents (📄), and Stickers (🏷️).
- **Date Range Filter**: Select From Date and To Date to download media strictly within a desired date window.
- **Custom Filename Formatting**: Choose custom naming templates (e.g. `{Date}_{ChatName}_{Sender}_{FileName}`, `{ChatName}_{Index}`, `{Date}_{Time}_{Sender}_{Type}_{Index}`).
- **Deep Scan Engine**: Programmatically auto-scrolls chat history upward to discover and load older historical media files.
- **Status / Story Downloader**: One-click download button for active WhatsApp Status/Story videos and photos.

### 🎨 In-Page WhatsApp Web Overlay UI
- **Header Download Button**: Floating `📥 Download Media (ZIP)` button embedded directly in the active WhatsApp header bar.
- **Quick Hover Buttons**: Individual download button overlay on message media elements for single-file downloading.
- **In-Page Download Modal**: Convenient modal dialog inside WhatsApp Web to trigger ZIP generation without opening the extension popup toolbar.

### ⚡ Message Monitoring & API Webhook Sync
- **Realtime DOM Observer**: High-performance `MutationObserver` captures incoming and outgoing messages in real time.
- **Automatic Message & Attachment Sender**: Automated sending of text messages and media attachments without reloading WhatsApp Web.
- **n8n / Webhook Sync**: Syncs chat conversations automatically to n8n or custom backend endpoints.

---

## 📂 Project Structure

```
whatsapp-chrome-extension/
│
├── manifest.json            # Manifest V3 configuration & permission bindings
├── background.js             # Service worker handling chrome.downloads & message dispatch
├── content.js                # Main content script orchestrator
├── injected.js               # Main World script accessing decrypted WhatsApp Store media
├── popup.html                # Popup dashboard interface HTML (Monitor, Downloader Pro, Send, Sync)
├── popup.css                 # WhatsApp dark/light theme tokens & downloader styling
├── popup.js                  # Popup controller & chrome.storage state sync
│
├── utils/
│   ├── jszip.min.js          # Client-side ZIP archive compiler with DEFLATE & CRC-32
│   ├── mediaDownloader.js    # Core media scanner, blob fetcher, & ZIP bundler
│   ├── deepScanner.js        # Automated chat auto-scroll engine for historical media
│   ├── mediaOverlay.js       # In-page header button, hover downloaders, & status overlay
│   ├── mediaParser.js       # Media type inference & decrypted Store media extractor
│   ├── messageParser.js     # DOM message structure parsing engine
│   ├── constants.js          # Selectors, categories, storage keys, & filename templates
│   ├── helpers.js            # Logging & context validator helpers
│   ├── chatDetector.js       # Active chat context detector
│   ├── syncManager.js        # Webhook sync engine
│   └── observer.js           # Realtime MutationObserver message listener
└── README.md                 # Documentation & installation guide
```

---

## 📦 How to Install & Load in Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle switch in the top right corner).
3. Click the **Load unpacked** button.
4. Select the project directory:
   `C:\Users\ayadav\Desktop\Chrome Extension`
5. Open [https://web.whatsapp.com](https://web.whatsapp.com) and select any conversation.
6. Look for the floating **📥 Download Media (ZIP)** button in the WhatsApp Web header bar or open the extension popup toolbar!

