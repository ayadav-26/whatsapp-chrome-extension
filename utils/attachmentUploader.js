/**
 * WhatsApp Web Message Monitor - Attachment Uploader Engine
 * Namespace: window.WAMonitor.AttachmentUploader
 * Handles file validation, attachment menu clicking, DataTransfer input injection, and preview waiting.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.AttachmentUploader = {
  /**
   * Validates attachment size and extension
   */
  validateAttachment: function (fileData) {
    const C = window.WAMonitor.Constants;
    const L = C?.ATTACHMENT_LIMITS;

    if (!fileData) return { valid: false, error: "No file selected." };

    const size = fileData.size || 0;
    const name = fileData.fileName || fileData.name || "";
    const ext = name.split(".").pop().toLowerCase();

    if (L && size > L.MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size (${(size / 1048576).toFixed(1)}MB) exceeds 100MB limit.`
      };
    }

    if (L) {
      const isAllowed = [
        ...L.IMAGE_EXTENSIONS,
        ...L.VIDEO_EXTENSIONS,
        ...L.DOCUMENT_EXTENSIONS,
        ...L.AUDIO_EXTENSIONS
      ].includes(ext);

      if (!isAllowed) {
        return {
          valid: false,
          error: `Unsupported file format (.${ext}).`
        };
      }
    }

    return { valid: true };
  },

  /**
   * Executes attachment menu opening, DataTransfer injection, and media preview waiting
   */
  uploadAttachment: async function (attachmentData) {
    const H = window.WAMonitor.Helpers;
    const C = window.WAMonitor.Constants;
    const D = window.WAMonitor.DOMHelper;

    if (!attachmentData || !attachmentData.base64Data) {
      throw new Error("No attachment data provided.");
    }

    H.log("Starting attachment upload workflow...", "info", attachmentData.fileName);

    // 1. Reconstruct File object from Base64
    const fileObj = H.base64ToFile(
      attachmentData.base64Data,
      attachmentData.fileName,
      attachmentData.fileType
    );

    const category = H.getFileCategory(attachmentData.fileType, attachmentData.fileName);

    // 2. Click Attachment (Paperclip/Plus) Button in WhatsApp footer
    let attachBtn = document.querySelector(C.SELECTORS.ATTACH_MENU_BTN);
    if (!attachBtn) {
      // Retry waiting for attachment button
      attachBtn = await D.waitForElement(C.SELECTORS.ATTACH_MENU_BTN, 8000).catch(() => null);
    }

    if (attachBtn) {
      try { attachBtn.click(); } catch (e) {}
      await new Promise((res) => setTimeout(res, 300));
    }

    // 3. Locate target hidden file input
    let targetSelector = C.SELECTORS.FILE_INPUT_ANY;
    if (category === "IMAGE" || category === "VIDEO") {
      targetSelector = C.SELECTORS.FILE_INPUT_MEDIA;
    } else if (category === "DOCUMENT") {
      targetSelector = C.SELECTORS.FILE_INPUT_DOC;
    }

    let fileInput = document.querySelector(targetSelector);
    if (!fileInput) {
      fileInput = document.querySelector(C.SELECTORS.FILE_INPUT_ANY);
    }

    if (!fileInput) {
      fileInput = await D.waitForElement("input[type='file']", 5000).catch(() => null);
    }

    if (!fileInput) {
      throw new Error("WhatsApp Web file input element not found in DOM.");
    }

    // 4. Inject File using DataTransfer API
    const dt = new DataTransfer();
    dt.items.add(fileObj);
    fileInput.files = dt.files;

    // Dispatch change & input events to trigger WhatsApp Web's upload listener
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    H.log("Dispatched file change event to WhatsApp Web input.");

    // 5. Wait for Media Preview screen to open
    const previewModal = await D.waitForElement(
      C.SELECTORS.MEDIA_PREVIEW_MODAL,
      C.CONFIG.PREVIEW_LOAD_TIMEOUT_MS
    ).catch(() => null);

    if (!previewModal) {
      H.log("Preview modal wait timed out, continuing...", "warn");
    }

    return {
      success: true,
      fileObj: fileObj,
      category: category,
      previewModal: previewModal
    };
  }
};
