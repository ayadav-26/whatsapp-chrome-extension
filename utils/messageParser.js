/**
 * WhatsApp Web Message Monitor - DOM Message Parser Engine
 * Namespace: window.WAMonitor.MessageParser
 * Strictly converts WhatsApp Web DOM elements into structured JSON schemas.
 * Extracts text, media type, and media links (blob URLs) for incoming/outgoing attachments.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.MessageParser = {
  /**
   * Reads active Chat Name from header
   */
  getChatName: function () {
    const C = window.WAMonitor.Constants;
    const headerTitleEl = document.querySelector(C.SELECTORS.CHAT_TITLE);
    
    if (headerTitleEl) {
      return window.WAMonitor.Helpers.cleanText(headerTitleEl.getAttribute("title") || headerTitleEl.textContent);
    }
    return "Unknown Chat";
  },

  /**
   * Detects Message Content Type based on DOM elements
   */
  detectMessageType: function (node) {
    const C = window.WAMonitor.Constants;

    if (node.querySelector(C.SELECTORS.MEDIA_STICKER)) {
      return C.MESSAGE_TYPES.STICKER;
    }
    if (node.querySelector(C.SELECTORS.MEDIA_VOICE_NOTE)) {
      return C.MESSAGE_TYPES.VOICE_NOTE;
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
   * Extracts text content or media descriptor from DOM node
   */
  extractMessageContent: function (node, type) {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    const textEl = node.querySelector(C.SELECTORS.TEXT_CONTENT);
    let text = textEl ? H.cleanText(textEl.textContent) : "";

    if (!text) {
      const copyableEl = node.querySelector(".copyable-text");
      if (copyableEl) {
        text = H.cleanText(copyableEl.textContent);
      }
    }

    if (text) {
      return text;
    }

    switch (type) {
      case C.MESSAGE_TYPES.IMAGE:
        return "[Image]";
      case C.MESSAGE_TYPES.VIDEO:
        return "[Video]";
      case C.MESSAGE_TYPES.AUDIO:
        return "[Audio]";
      case C.MESSAGE_TYPES.VOICE_NOTE:
        return "[Voice Note]";
      case C.MESSAGE_TYPES.DOCUMENT:
        const docEl = node.querySelector(C.SELECTORS.MEDIA_DOCUMENT) || node.querySelector("span[title]");
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
   * Helper to extract valid image URL from img tags or inline CSS background-image
   */
  getMediaUrlFromNode: function (node) {
    if (!node || !(node instanceof HTMLElement)) return "";

    // 1. Try standard <img> elements (checking src, data-src)
    const imgEls = node.querySelectorAll("img");
    for (const img of imgEls) {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      if (src && !src.startsWith("data:image/gif;base64,R0lGODlh")) {
        return src;
      }
    }

    // 2. Try elements with inline background-image style
    const bgEls = node.querySelectorAll("[style*='background-image'], [style*='background:']");
    for (const el of bgEls) {
      const styleStr = el.getAttribute("style") || "";
      const bgMatch = styleStr.match(/url\(["']?(.*?)["']?\)/i);
      if (bgMatch && bgMatch[1] && !bgMatch[1].startsWith("data:image/gif;base64,R0lGODlh")) {
        return bgMatch[1];
      }
    }

    // 3. Try <video> poster or src
    const videoEl = node.querySelector("video");
    if (videoEl) {
      const videoSrc = videoEl.getAttribute("src") || videoEl.querySelector("source")?.getAttribute("src") || videoEl.getAttribute("poster") || "";
      if (videoSrc) return videoSrc;
    }

    // 4. Try <audio> src
    const audioEl = node.querySelector("audio");
    if (audioEl) {
      const audioSrc = audioEl.getAttribute("src") || audioEl.querySelector("source")?.getAttribute("src") || "";
      if (audioSrc) return audioSrc;
    }

    // 5. Try <a> download/blob links
    const linkEl = node.querySelector("a[href*='blob:'], a[href*='whatsapp.net'], a[href]");
    if (linkEl) {
      const href = linkEl.getAttribute("href") || "";
      if (href && !href.startsWith("javascript:")) return href;
    }

    return "";
  },

  /**
   * Extracts media attachment details (mediaUrl, thumbUrl, fileName, fileType) from DOM node
   */
  extractAttachmentDetails: function (node, type) {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    if (type === C.MESSAGE_TYPES.TEXT || type === C.MESSAGE_TYPES.UNKNOWN) {
      return null;
    }

    let mediaUrl = "";
    let thumbUrl = "";
    let fileName = "";

    // 1. Image & Sticker Media
    if (type === C.MESSAGE_TYPES.IMAGE || type === C.MESSAGE_TYPES.STICKER) {
      mediaUrl = this.getMediaUrlFromNode(node);
      thumbUrl = mediaUrl;

      const imgEl = node.querySelector("img");
      fileName = (imgEl ? imgEl.getAttribute("alt") : "") || (type === C.MESSAGE_TYPES.STICKER ? "sticker.webp" : "image.jpg");
    }

    // 2. Video Media
    else if (type === C.MESSAGE_TYPES.VIDEO) {
      const videoEl = node.querySelector("video");
      if (videoEl) {
        mediaUrl = videoEl.getAttribute("src") || videoEl.querySelector("source")?.getAttribute("src") || "";
      }
      thumbUrl = this.getMediaUrlFromNode(node);
      if (!mediaUrl) mediaUrl = thumbUrl;
      fileName = "video.mp4";
    }

    // 3. Audio / Voice Note Media
    else if (type === C.MESSAGE_TYPES.AUDIO || type === C.MESSAGE_TYPES.VOICE_NOTE) {
      mediaUrl = this.getMediaUrlFromNode(node);
      fileName = type === C.MESSAGE_TYPES.VOICE_NOTE ? "voice_note.opus" : "audio.mp3";
    }

    // 4. Document Media
    else if (type === C.MESSAGE_TYPES.DOCUMENT) {
      const docEl = node.querySelector(C.SELECTORS.MEDIA_DOCUMENT) || node.querySelector("span[title]");
      if (docEl) {
        fileName = docEl.getAttribute("title") || docEl.textContent || "document.pdf";
      }
      mediaUrl = this.getMediaUrlFromNode(node);
      if (!fileName) fileName = "document.pdf";
    }

    if (!mediaUrl && !fileName) return null;

    const isPendingUrl = (!mediaUrl || mediaUrl.trim() === "");

    return {
      fileName: H.cleanText(fileName) || "attachment",
      fileType: type,
      mediaUrl: mediaUrl,
      thumbUrl: thumbUrl,
      isPendingUrl: isPendingUrl
    };
  },

  /**
   * Main entry point to parse a message element from active chat window (#main)
   */
  parseMessage: function (messageElement) {
    if (!messageElement || !(messageElement instanceof HTMLElement)) {
      return null;
    }

    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    // 1. Resolve full data-id attribute and direction classes by walking up parent tree to #main
    let fullDataId = "";
    let isParentOutgoing = false;
    let isParentIncoming = false;

    const mainContainer = document.querySelector(C.SELECTORS.MAIN_CHAT_CONTAINER);
    let curr = messageElement;

    while (curr && curr !== document.body && curr !== mainContainer) {
      if (curr.getAttribute) {
        const attr = curr.getAttribute("data-id") || "";
        if (attr) {
          if (attr.includes("true_") || attr.startsWith("true_") || attr.includes("_true_")) {
            if (!fullDataId || !fullDataId.includes("true_")) fullDataId = attr;
            isParentOutgoing = true;
          } else if (attr.includes("false_") || attr.startsWith("false_") || attr.includes("_false_")) {
            if (!fullDataId) fullDataId = attr;
            isParentIncoming = true;
          } else if (!fullDataId) {
            fullDataId = attr;
          }
        }
      }

      if (curr.classList) {
        const classStr = Array.from(curr.classList).join(" ").toLowerCase();
        if (classStr.includes("message-out") || classStr.includes("outgoing")) {
          isParentOutgoing = true;
        }
        if (classStr.includes("message-in") || classStr.includes("incoming")) {
          isParentIncoming = true;
        }
      }

      curr = curr.parentElement;
    }

    if (!fullDataId && messageElement.querySelectorAll) {
      const descDataId = messageElement.querySelector("[data-id]");
      if (descDataId) fullDataId = descDataId.getAttribute("data-id") || "";
    }

    const parsedDataId = H.parseDataId(fullDataId);

    // 2. Chat & Contact Details & Timestamp PrePlainText
    const chatName = this.getChatName();
    const copyableTextEl = messageElement.querySelector(C.SELECTORS.COPYABLE_TEXT_CONTAINER) || messageElement.closest(C.SELECTORS.COPYABLE_TEXT_CONTAINER);
    const preText = copyableTextEl ? copyableTextEl.getAttribute("data-pre-plain-text") : (messageElement.getAttribute ? messageElement.getAttribute("data-pre-plain-text") : null);
    const preTextData = H.parsePrePlainText(preText);

    // 3. Determine Direction (INCOMING vs OUTGOING) using all gathered signals
    const hasOutgoingIcons = !!messageElement.querySelector(C.SELECTORS.OUTGOING_ICONS) || !!messageElement.closest(C.SELECTORS.OUTGOING_ICONS);
    const hasOutgoingJid = parsedDataId.isOutgoing === true || fullDataId.includes("true_") || fullDataId.startsWith("true_");
    const hasIncomingJid = parsedDataId.isIncoming === true || fullDataId.includes("false_") || fullDataId.startsWith("false_");

    // Smart 1-on-1 Chat Heuristic: In a chat named "Roshan SSI", if preTextData sender is "Akash", it is ME (Outgoing)
    const isSenderDifferentFromChat = preTextData.senderName && chatName && chatName !== "Unknown Chat" &&
                                      preTextData.senderName.toLowerCase().trim() !== chatName.toLowerCase().trim();

    let isOutgoing = false;
    if (isParentOutgoing || hasOutgoingJid || hasOutgoingIcons || isSenderDifferentFromChat) {
      isOutgoing = true;
    } else if (isParentIncoming || hasIncomingJid) {
      isOutgoing = false;
    }

    const direction = isOutgoing ? C.DIRECTION.OUTGOING : C.DIRECTION.INCOMING;

    let senderName = "Unknown";
    let receiverName = chatName;

    if (direction === C.DIRECTION.OUTGOING) {
      senderName = "Me";
      receiverName = chatName;
    } else {
      receiverName = "Me";
      senderName = preTextData.senderName;
      if (!senderName || senderName === "Me" || senderName === "You") {
        const groupSenderEl = messageElement.querySelector(C.SELECTORS.GROUP_SENDER_NAME);
        if (groupSenderEl) {
          senderName = H.cleanText(groupSenderEl.textContent);
        }
      }
      if (!senderName || senderName === "Me" || senderName === "You") {
        senderName = chatName;
      }
    }

    // 5. Phone Number Extraction & Header Secondary Inspection
    let phoneNumber = H.extractPhoneNumber(parsedDataId.chatId);
    if (!phoneNumber) {
      phoneNumber = H.extractPhoneNumber(chatName) || H.extractPhoneNumber(senderName);
    }
    if (!phoneNumber) {
      // Check active chat header subtext / status span for phone number
      const headerSubtextEl = document.querySelector("#main header span[title*='+'], #main header div span[title], #main header div._ak8q, #main header span._ao3e");
      if (headerSubtextEl) {
        phoneNumber = H.extractPhoneNumber(headerSubtextEl.getAttribute("title") || headerSubtextEl.textContent);
      }
    }
    if (!phoneNumber) {
      phoneNumber = "";
    }

    // 6. Timestamp extraction
    let timestamp = preTextData.timestamp;
    if (!timestamp) {
      const timeEl = messageElement.querySelector(C.SELECTORS.TIMESTAMP);
      timestamp = timeEl ? H.cleanText(timeEl.textContent) : new Date().toLocaleTimeString();
    }

    // 7. Type & Content & Attachment & Media Metadata Details
    const messageType = this.detectMessageType(messageElement);
    const messageContent = this.extractMessageContent(messageElement, messageType);
    const attachmentDetails = this.extractAttachmentDetails(messageElement, messageType);

    let mediaMetadata = null;
    if (attachmentDetails && window.WAMonitor.MediaParser) {
      mediaMetadata = window.WAMonitor.MediaParser.extractMediaMetadata(messageElement, messageType, attachmentDetails, messageContent);
    }

    // 8. ID & Hash Resolution (Ensuring valid chatId)
    const rawChatId = parsedDataId.chatId || "";
    const chatId = rawChatId || H.generateFallbackChatId(chatName, phoneNumber);
    const rawMessageId = parsedDataId.messageId || fullDataId;
    const finalMessageId = rawMessageId ? rawMessageId : H.generateFallbackHash(chatId, timestamp, messageContent, direction);

    // 9. Build Schema strictly matching requirements
    if (direction === C.DIRECTION.INCOMING) {
      return {
        direction: C.DIRECTION.INCOMING,
        senderName: senderName,
        phoneNumber: phoneNumber,
        chatName: chatName,
        message: messageContent,
        messageType: messageType,
        attachment: attachmentDetails,
        mediaMetadata: mediaMetadata,
        timestamp: timestamp,
        chatId: chatId,
        messageId: finalMessageId,
        capturedAt: new Date().toISOString(),
        status: C.STATUS.NEW
      };
    } else {
      return {
        direction: C.DIRECTION.OUTGOING,
        senderName: "Me",
        receiverName: receiverName,
        phoneNumber: phoneNumber,
        chatName: chatName,
        message: messageContent,
        messageType: messageType,
        attachment: attachmentDetails,
        mediaMetadata: mediaMetadata,
        timestamp: timestamp,
        chatId: chatId,
        messageId: finalMessageId,
        capturedAt: new Date().toISOString(),
        status: C.STATUS.SENT
      };
    }
  },

  /**
   * Parses left sidebar row for unopened/inactive chat notifications
   */
  parseSidebarRow: function (rowElement) {
    if (!rowElement || !(rowElement instanceof HTMLElement)) {
      return null;
    }

    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;

    const titleSpans = rowElement.querySelectorAll("span[title]");
    let chatName = "";
    if (titleSpans.length > 0) {
      chatName = H.cleanText(titleSpans[0].getAttribute("title") || titleSpans[0].textContent);
    } else {
      const altTitle = rowElement.querySelector("span[dir='auto']");
      chatName = altTitle ? H.cleanText(altTitle.textContent) : "";
    }

    if (!chatName) return null;

    const lastMsgEl = rowElement.querySelector("span._ak8l, span._ak7h, div._ak8l");
    const lastMsgText = lastMsgEl ? H.cleanText(lastMsgEl.textContent) : "";

    const timeEl = rowElement.querySelector(C.SELECTORS.SIDEBAR_TIMESTAMP);
    const timestamp = timeEl ? H.cleanText(timeEl.textContent) : new Date().toLocaleTimeString();

    return {
      direction: C.DIRECTION.INCOMING,
      senderName: chatName,
      phoneNumber: H.extractPhoneNumber(chatName) || "",
      chatName: chatName,
      message: lastMsgText || "[Media]",
      messageType: C.MESSAGE_TYPES.TEXT,
      attachment: null,
      timestamp: timestamp,
      chatId: `${chatName}@c.us`,
      messageId: H.generateFallbackHash(chatName, timestamp, lastMsgText, C.DIRECTION.INCOMING),
      capturedAt: new Date().toISOString()
    };
  }
};
