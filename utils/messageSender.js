/**
 * WhatsApp Web Message Monitor - Message Sender Engine
 * Namespace: window.WAMonitor.MessageSender
 * Handles text typing, media attachment uploading, caption insertion, and send execution.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.MessageSender = {
  /**
   * Executes automatic message typing / attachment upload and sending workflow
   */
  sendMessage: async function (phoneNumber, messageText, attachmentData, progressCallback) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;
    const D = window.WAMonitor.DOMHelper;
    const N = window.WAMonitor.ChatNavigator;
    const AU = window.WAMonitor.AttachmentUploader;
    const S = window.WAMonitor.Storage;
    const P = window.WAMonitor.MessageParser;

    const reportProgress = (statusMsg, isError = false) => {
      H.log(`Sender Progress: ${statusMsg}`);
      if (typeof progressCallback === "function") {
        progressCallback({ status: statusMsg, error: isError });
      }
    };

    try {
      // 1. Validation
      reportProgress(C.SENDER_STATUS.VALIDATING);
      if (!phoneNumber || typeof phoneNumber !== "string") {
        throw new Error("Phone number is required.");
      }

      const hasAttachment = !!(attachmentData && attachmentData.base64Data);
      const hasText = !!(messageText && messageText.trim() !== "");

      if (!hasText && !hasAttachment) {
        throw new Error("Please provide message text or an attachment.");
      }

      if (hasAttachment && AU) {
        const val = AU.validateAttachment(attachmentData);
        if (!val.valid) {
          throw new Error(val.error);
        }
      }

      // 2. In-Page SPA Chat Navigation (Zero Page Reloads)
      reportProgress(C.SENDER_STATUS.LOADING_CHAT);
      const chatReadyState = await N.navigateToPhoneInPage(phoneNumber);

      // 3. ATTACHMENT FLOW
      if (hasAttachment && AU) {
        reportProgress(C.SENDER_STATUS.UPLOADING_ATTACHMENT);
        await AU.uploadAttachment(attachmentData);

        reportProgress(C.SENDER_STATUS.PREPARING_PREVIEW);
        await this.delay(500);

        // Add Caption if message text is provided
        if (hasText) {
          reportProgress(C.SENDER_STATUS.ADDING_CAPTION);
          let captionInput = document.querySelector(C.SELECTORS.PREVIEW_CAPTION_INPUT);
          if (!captionInput) {
            captionInput = await D.waitForElement(C.SELECTORS.PREVIEW_CAPTION_INPUT, 4000).catch(() => null);
          }
          if (captionInput) {
            D.insertContentEditableText(captionInput, messageText);
            await this.delay(400);
          }
        }

        // Locate and Click Preview Send Button
        reportProgress(C.SENDER_STATUS.SENDING);
        await this.delay(400);

        let previewSendBtn = document.querySelector(C.SELECTORS.PREVIEW_SEND_BTN);
        if (!previewSendBtn) {
          const region = document.querySelector("div[role='region']") || document.querySelector("div._ak7w");
          if (region) {
            previewSendBtn = region.querySelector("span[data-icon='send']") || 
                             region.querySelector("div[role='button']") || 
                             region.querySelector("button");
          }
        }

        if (!previewSendBtn) {
          previewSendBtn = document.querySelector("span[data-icon='send']") || document.querySelector(C.SELECTORS.SEND_BUTTON);
        }

        if (previewSendBtn) {
          D.triggerClick(previewSendBtn);
        }

        // Fallback: Dispatch Enter key on caption input if present
        const captionInput = document.querySelector(C.SELECTORS.PREVIEW_CAPTION_INPUT);
        if (captionInput) {
          try {
            captionInput.dispatchEvent(new KeyboardEvent("keydown", {
              key: "Enter",
              keyCode: 13,
              code: "Enter",
              which: 13,
              bubbles: true
            }));
          } catch (e) {}
        }

        // Verify Success: Media preview modal MUST disappear from DOM
        const modalDisappeared = await D.waitForElementToDisappear(C.SELECTORS.MEDIA_PREVIEW_MODAL, 6000);

        if (!modalDisappeared) {
          // Second attempt if modal is still open
          H.log("Media preview modal still visible. Retrying send button click...", "warn");
          const retryBtn = document.querySelector("span[data-icon='send']") || document.querySelector(C.SELECTORS.PREVIEW_SEND_BTN);
          if (retryBtn) {
            D.triggerClick(retryBtn);
          }
          
          const secondAttemptClosed = await D.waitForElementToDisappear(C.SELECTORS.MEDIA_PREVIEW_MODAL, 5000);
          if (!secondAttemptClosed) {
            throw new Error("Failed to send attachment: Send button in WhatsApp Web media preview did not execute.");
          }
        }

        await this.delay(800);

      } else {
        // 4. TEXT ONLY FLOW
        const inputEl = chatReadyState.inputElement;
        if (!inputEl) {
          throw new Error("Message input box not found in DOM.");
        }

        reportProgress(C.SENDER_STATUS.TYPING);
        await this.delay(400);
        D.insertContentEditableText(inputEl, messageText);
        await this.delay(500);

        reportProgress(C.SENDER_STATUS.SENDING);
        let sendButton = document.querySelector(C.SELECTORS.SEND_BUTTON);
        if (!sendButton) {
          const footer = document.querySelector("#main footer");
          if (footer) sendButton = footer.querySelector("button") || footer.querySelector("span[data-icon='send']");
        }

        if (sendButton) {
          sendButton.click();
        } else {
          inputEl.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter",
            keyCode: 13,
            code: "Enter",
            which: 13,
            bubbles: true
          }));
        }

        await this.delay(800);
      }

      // 5. Build Outgoing Message Object with Attachment Details & Save to Storage
      const activeChatName = P ? P.getChatName() : phoneNumber;
      const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;

      let attachmentMeta = null;
      if (hasAttachment) {
        attachmentMeta = {
          fileName: attachmentData.fileName || "attachment",
          fileType: attachmentData.fileType || "application/octet-stream",
          size: attachmentData.size || 0
        };
      }

      const outgoingRecord = {
        direction: C.DIRECTION.OUTGOING,
        phoneNumber: formattedPhone,
        senderName: "Me",
        receiverName: activeChatName,
        chatName: activeChatName,
        message: messageText || (hasAttachment ? `[Attachment: ${attachmentData.fileName}]` : ""),
        messageType: hasAttachment ? H.getFileCategory(attachmentData.fileType, attachmentData.fileName) : C.MESSAGE_TYPES.TEXT,
        attachment: attachmentMeta,
        timestamp: new Date().toLocaleTimeString(),
        chatId: `${phoneNumber.replace(/\+/g, "")}@c.us`,
        messageId: H.generateFallbackHash(phoneNumber, new Date().toLocaleTimeString(), messageText || attachmentData?.fileName, C.DIRECTION.OUTGOING),
        capturedAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
        status: C.STATUS.SENT
      };

      if (S && S.saveMessage) {
        S.saveMessage(outgoingRecord);
      }

      // 6. Complete Success
      reportProgress(C.SENDER_STATUS.SUCCESS, false);
      return { success: true, record: outgoingRecord };

    } catch (err) {
      const errMsg = err.message || "Failed to send message.";
      reportProgress(errMsg, true);
      throw err;
    }
  },

  delay: function (ms) {
    return new Promise((res) => setTimeout(res, ms));
  }
};
