/**
 * WhatsApp Web Message Monitor - DOM Parser Engine
 * Namespace: window.WAMonitor.Parser
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.Parser = {
  /**
   * Reads the current active Chat Name from the WhatsApp Web header
   */
  getChatName: function () {
    const C = window.WAMonitor.Constants;
    const headerTitleEl = document.querySelector(C.SELECTORS.CHAT_TITLE) || 
                          document.querySelector(C.SELECTORS.CHAT_TITLE_ALT);
    
    if (headerTitleEl) {
      return window.WAMonitor.Helpers.cleanText(headerTitleEl.getAttribute("title") || headerTitleEl.textContent);
    }
    return "Unknown Chat";
  },

  /**
   * Determines message content type based on DOM structure
   */
  detectMessageType: function (node) {
    const C = window.WAMonitor.Constants;

    if (node.querySelector(C.SELECTORS.MEDIA_STICKER)) {
      return C.MESSAGE_TYPES.STICKER;
    }
    if (node.querySelector(C.SELECTORS.MEDIA_IMAGE)) {
      return C.MESSAGE_TYPES.IMAGE;
    }
    if (node.querySelector(C.SELECTORS.MEDIA_VIDEO)) {
      return C.MESSAGE_TYPES.VIDEO;
    }
    if (node.querySelector(C.SELECTORS.MEDIA_AUDIO)) {
      return C.MESSAGE_TYPES.AUDIO;
    }
    if (node.querySelector(C.SELECTORS.MEDIA_DOCUMENT)) {
      return C.MESSAGE_TYPES.DOCUMENT;
    }
    if (node.querySelector(C.SELECTORS.MEDIA_CONTACT)) {
      return C.MESSAGE_TYPES.CONTACT;
    }
    if (node.querySelector(C.SELECTORS.TEXT_CONTENT)) {
      return C.MESSAGE_TYPES.TEXT;
    }

    return C.MESSAGE_TYPES.UNKNOWN;
  },

  /**
   * Extracts text body or caption from message node
   */
  extractMessageContent: function (node, type) {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    // Check for selectable copyable text element
    const textEl = node.querySelector(C.SELECTORS.TEXT_CONTENT);
    let text = textEl ? H.cleanText(textEl.textContent) : "";

    if (!text) {
      // Fallback: check inside any copyable-text element
      const copyableEl = node.querySelector(".copyable-text");
      if (copyableEl) {
        text = H.cleanText(copyableEl.textContent);
      }
    }

    if (text) {
      return text;
    }

    // Fallback descriptors for media types if no text caption exists
    switch (type) {
      case C.MESSAGE_TYPES.IMAGE:
        return "[Image]";
      case C.MESSAGE_TYPES.VIDEO:
        return "[Video]";
      case C.MESSAGE_TYPES.AUDIO:
        return "[Audio / Voice Note]";
      case C.MESSAGE_TYPES.DOCUMENT:
        const docEl = node.querySelector(C.SELECTORS.MEDIA_DOCUMENT);
        const docTitle = docEl ? docEl.getAttribute("title") || docEl.textContent : "";
        return docTitle ? `[Document: ${H.cleanText(docTitle)}]` : "[Document]";
      case C.MESSAGE_TYPES.STICKER:
        return "[Sticker]";
      case C.MESSAGE_TYPES.CONTACT:
        return "[Contact Card]";
      default:
        return H.cleanText(node.textContent) || "[Empty Message]";
    }
  },

  /**
   * Main entry point to parse a message wrapper DOM Element
   * Returns a structured object or null if invalid
   */
  parseMessage: function (messageElement) {
    if (!messageElement || !(messageElement instanceof HTMLElement)) {
      return null;
    }

    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    // 1. Identify Data ID attribute & Direction (Incoming vs Outgoing)
    const targetIdEl = messageElement.getAttribute("data-id") ? messageElement : (messageElement.querySelector("[data-id]") || messageElement);
    const dataId = targetIdEl.getAttribute("data-id") || messageElement.getAttribute("data-id") || "";
    
    const ancestorWithDataId = messageElement.closest("[data-id]");
    const fullDataId = dataId || (ancestorWithDataId ? ancestorWithDataId.getAttribute("data-id") : "");

    const parsedDataId = H.parseDataId(fullDataId);

    // Check for outgoing status checkmarks (msg-check, msg-dblcheck, msg-time) which ONLY exist on outgoing messages
    const hasOutgoingIcons = !!messageElement.querySelector("span[data-icon='msg-check'], span[data-icon='msg-dblcheck'], span[data-icon='msg-time'], span[data-icon='msg-dblcheck-ack']");

    const hasOutgoingClass = messageElement.classList.contains(C.SELECTORS.MESSAGE_OUTGOING_CLASS) || 
                             !!messageElement.querySelector("." + C.SELECTORS.MESSAGE_OUTGOING_CLASS) ||
                             !!messageElement.closest("." + C.SELECTORS.MESSAGE_OUTGOING_CLASS);

    const hasIncomingClass = messageElement.classList.contains(C.SELECTORS.MESSAGE_INCOMING_CLASS) || 
                             !!messageElement.querySelector("." + C.SELECTORS.MESSAGE_INCOMING_CLASS) ||
                             !!messageElement.closest("." + C.SELECTORS.MESSAGE_INCOMING_CLASS);

    let isIncoming = false;

    // Strict Evaluation Priority: Outgoing signs FIRST, then Incoming signs
    if (hasOutgoingIcons || hasOutgoingClass || parsedDataId.isOutgoing === true) {
      isIncoming = false;
    } else if (hasIncomingClass || parsedDataId.isIncoming === true) {
      isIncoming = true;
    } else {
      isIncoming = false; // Default to false if uncertain
    }

    // 2. Extract Active Chat Name
    const chatName = this.getChatName();

    // 3. Inspect copyable-text container for timestamp & pre-plain-text
    const copyableTextEl = messageElement.querySelector(C.SELECTORS.COPYABLE_TEXT_CONTAINER);
    const preText = copyableTextEl ? copyableTextEl.getAttribute("data-pre-plain-text") : null;
    const preTextData = H.parsePrePlainText(preText);

    // 4. Determine Sender Name
    let senderName = preTextData.senderName;

    // If senderName is not found in preText (e.g. group chat DOM structure), look for group sender span
    if (!senderName) {
      const groupSenderEl = messageElement.querySelector(C.SELECTORS.GROUP_SENDER_NAME);
      if (groupSenderEl) {
        senderName = H.cleanText(groupSenderEl.textContent);
      }
    }

    // Fallback: If personal chat, senderName is the chatName
    if (!senderName || senderName === "") {
      senderName = chatName;
    }

    // 5. Determine Phone Number
    let phoneNumber = H.extractPhoneNumber(parsedDataId.chatId);
    if (!phoneNumber) {
      phoneNumber = H.extractPhoneNumber(senderName);
    }
    if (!phoneNumber) {
      phoneNumber = H.extractPhoneNumber(chatName) || "";
    }

    // 6. Timestamp extraction
    let timestamp = preTextData.timestamp;
    if (!timestamp) {
      const timeEl = messageElement.querySelector(C.SELECTORS.TIMESTAMP);
      timestamp = timeEl ? H.cleanText(timeEl.textContent) : new Date().toLocaleTimeString();
    }

    // 7. Message Type & Content
    const messageType = this.detectMessageType(messageElement);
    const messageContent = this.extractMessageContent(messageElement, messageType);

    // 8. Build output format
    return {
      senderName: senderName,
      phoneNumber: phoneNumber,
      chatName: chatName,
      message: messageContent,
      messageType: messageType,
      timestamp: timestamp,
      incoming: isIncoming,
      chatId: parsedDataId.chatId || "",
      messageId: parsedDataId.messageId || dataId
    };
  },

  /**
   * Parses a single row from the left sidebar (#pane-side) for inactive chats
   */
  parseSidebarRow: function (rowElement) {
    if (!rowElement || !(rowElement instanceof HTMLElement)) {
      return null;
    }

    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    // Chat Name / Contact Title
    const titleSpans = rowElement.querySelectorAll("span[title]");
    let chatName = "";
    if (titleSpans.length > 0) {
      chatName = H.cleanText(titleSpans[0].getAttribute("title") || titleSpans[0].textContent);
    } else {
      const altTitle = rowElement.querySelector("span[dir='auto']");
      chatName = altTitle ? H.cleanText(altTitle.textContent) : "";
    }

    if (!chatName) return null;

    // Message Preview Text
    let messageText = "";
    if (titleSpans.length > 1) {
      messageText = H.cleanText(titleSpans[1].getAttribute("title") || titleSpans[1].textContent);
    }

    if (!messageText) {
      const previewEl = rowElement.querySelector("div._ak7w span, div._ak72 span, span._ak8l, div._ak7h span");
      messageText = previewEl ? H.cleanText(previewEl.getAttribute("title") || previewEl.textContent) : "";
    }

    if (!messageText) {
      const allSpans = rowElement.querySelectorAll("span[dir='auto'], span[dir='ltr']");
      for (const span of allSpans) {
        const txt = H.cleanText(span.textContent);
        if (txt && txt !== chatName && !txt.match(/^\d{1,2}:\d{2}/)) {
          messageText = txt;
          break;
        }
      }
    }

    // Timestamp
    const timeEl = rowElement.querySelector(C.SELECTORS.SIDEBAR_TIMESTAMP);
    const timestamp = timeEl ? H.cleanText(timeEl.textContent) : new Date().toLocaleTimeString();

    // Phone Number
    const phoneNumber = H.extractPhoneNumber(chatName) || "";

    return {
      senderName: chatName,
      phoneNumber: phoneNumber,
      chatName: chatName,
      message: messageText || "[New Message Notification]",
      messageType: C.MESSAGE_TYPES.TEXT,
      timestamp: timestamp,
      incoming: true,
      source: "sidebar"
    };
  }
};
