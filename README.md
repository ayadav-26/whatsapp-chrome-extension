# WhatsApp Web Message Monitor - Chrome Extension (Manifest V3)

A modular, production-ready Chrome Extension (Manifest V3) designed to detect and extract incoming WhatsApp Web (`https://web.whatsapp.com/*`) messages in real time using DOM `MutationObserver`.

---

## 🚀 Features (Phase 1)

- **Manifest V3 Compliant**: Uses modern Chrome extension standards.
- **Realtime DOM Detection**: Employs `MutationObserver` to instantly capture incoming messages without inefficient polling loops.
- **Rich Message Extraction**: Extracts details for every incoming message:
  - `senderName`
  - `phoneNumber` (if available)
  - `chatName`
  - `message` (Text content or media description)
  - `messageType` (`Text`, `Image`, `Video`, `Audio`, `Document`, `Sticker`, `Contact`)
  - `timestamp`
  - `incoming` (`true`)
- **Deduplication Engine**: Uses an in-memory `Set` cache of message IDs (`data-id`) to ignore duplicate mutations.
- **Startup Protection**: Prevents reprocessing old existing messages when the page loads or when switching between chat conversations.
- **Modern Extension Popup**: Provides a clean UI dashboard displaying active monitoring status, captured count, and live preview of the last received message.

---

## 📂 Project Structure

```
whatsapp-monitor-extension/
│
├── manifest.json         # Manifest V3 metadata & script bindings
├── background.js          # Service worker for extension lifecycle & future API communication
├── content.js             # Entry content script orchestrating observer and output logic
├── popup.html             # Popup interface HTML
├── popup.css              # Dark mode styling matching WhatsApp theme
├── popup.js               # Popup logic & chrome.storage state sync
├── utils/
│   ├── constants.js       # Centralized selectors, message types, and system constants
│   ├── helpers.js         # Phone extraction, timestamp parsing, and logger helpers
│   ├── parser.js          # DOM extraction engine (parses raw HTML elements into JSON)
│   └── observer.js        # DOM MutationObserver engine with deduplication & chat-switch handling
└── README.md              # Documentation & installation guide
```

---

## 📦 How to Install & Load in Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** using the toggle switch in the top right corner.
3. Click the **Load unpacked** button.
4. Select the project directory:
   `C:\Users\ayadav\Desktop\Chrome Extension`
5. Navigate to [https://web.whatsapp.com](https://web.whatsapp.com) in your browser.
6. Open Chrome Developer Tools (**F12** or **Right Click → Inspect** → **Console** tab).
7. Look for initialization log:
   `[WA Monitor] [12:00:00 PM] Content Script Loaded. Initializing WhatsApp Web Monitor...`

---

## 🔍 Output Format

Whenever a NEW incoming message arrives in WhatsApp Web, the extension outputs the extracted data to the browser console:

```javascript
{
    senderName: "John Doe",
    phoneNumber: "+15551234567",
    chatName: "John Doe",
    message: "Hey! Let's sync on the project today.",
    messageType: "Text",
    timestamp: "11:45 AM",
    incoming: true
}
```

---

## 🏗️ Architecture & Module Explanation

### 1. `manifest.json`
Specifies Manifest V3 configuration, restricting permissions strictly to `https://web.whatsapp.com/*` and sequentially loading content utility scripts.

### 2. `utils/constants.js`
Houses WhatsApp Web DOM selectors (`#main`, `.message-in`, `.copyable-text`, etc.) and supported message type enums. Centralizing selectors allows fast updates if WhatsApp changes internal class names.

### 3. `utils/helpers.js`
Provides standalone utility functions for phone number regex extraction, `data-pre-plain-text` timestamp parsing, string sanitization, and uniform formatted logging.

### 4. `utils/parser.js`
The parser converts DOM elements into structured JSON data. It isolates DOM parsing logic so replacing `console.log()` with HTTP `fetch()` API calls can be done seamlessly without touching observer logic.

### 5. `utils/observer.js`
Manages the DOM `MutationObserver`. It waits for `#main` to mount, seeds initial old messages to prevent duplicate triggers on page load or chat switches, and processes newly added nodes in real time.

### 6. `content.js`
Main content script orchestrator. Initializes the observer engine and formats the captured message object for `console.log()` and storage sync.

### 7. `background.js`
Service worker managing extension lifecycle events and serving as the future dispatch point for sending captured messages to external backends.

---

## 🔮 Future Integration (Phase 2 Ready)

To forward messages to a backend API (e.g. Spring Boot / PostgreSQL / WebSocket):
In `content.js` or `background.js`, simply update the dispatch function:

```javascript
// Replace console.log(outputObject) with:
fetch("http://localhost:8080/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(outputObject)
}).catch(err => console.error("API Error:", err));
```
