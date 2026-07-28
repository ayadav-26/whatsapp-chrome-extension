/**
 * WhatsApp Web Message Monitor - Media Parser Engine
 * Namespace: window.WAMonitor.MediaParser
 * Extracts structured media metadata (mediaType, fileName, mimeType, caption, thumbnail status)
 * from WhatsApp Web DOM message elements.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.MediaParser = {
  /**
   * Infers MIME type based on media type and file extension
   */
  inferMimeType: function (mediaType, fileName) {
    const ext = (fileName || "").split(".").pop().toLowerCase();

    const mimeMap = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      webm: "video/webm",
      mp3: "audio/mpeg",
      ogg: "audio/ogg",
      opus: "audio/opus",
      wav: "audio/wav",
      m4a: "audio/mp4",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
      zip: "application/zip",
      rar: "application/vnd.rar"
    };

    if (mimeMap[ext]) return mimeMap[ext];

    switch (mediaType) {
      case "IMAGE":
        return "image/jpeg";
      case "VIDEO":
        return "video/mp4";
      case "AUDIO":
      case "VOICE_NOTE":
        return "audio/ogg";
      case "DOCUMENT":
        return "application/pdf";
      case "STICKER":
        return "image/webp";
      default:
        return "application/octet-stream";
    }
  },

  /**
   * Extracts media metadata from a message element and attachment details
   */
  extractMediaMetadata: function (node, messageType, attachmentDetails, messageContent) {
    const C = window.WAMonitor.Constants;
    const H = window.WAMonitor.Helpers;

    if (!node || !attachmentDetails) return null;

    const fileName = attachmentDetails.fileName || "attachment";
    const mediaType = messageType || C.MESSAGE_TYPES.UNKNOWN;
    const mimeType = this.inferMimeType(mediaType, fileName);

    // Extract caption text if present (excluding fallback descriptor tags like [Image])
    let caption = "";
    if (messageContent && typeof messageContent === "string" && !messageContent.startsWith("[")) {
      caption = messageContent;
    }

    const mediaUrl = attachmentDetails.mediaUrl || "";
    const thumbUrl = attachmentDetails.thumbUrl || "";

    const thumbnailAvailable = !!(thumbUrl || mediaUrl);
    const isDownloaded = mediaUrl.startsWith("blob:") || mediaUrl.startsWith("http");

    return {
      mediaType: mediaType,
      fileName: H.cleanText(fileName),
      mimeType: mimeType,
      caption: caption,
      thumbnailAvailable: thumbnailAvailable,
      mediaUrl: mediaUrl,
      thumbUrl: thumbUrl,
      isDownloaded: isDownloaded,
      note: "Chrome Extension extracts DOM-rendered media metadata; full resolution binary files are downloaded on-demand by WhatsApp Web."
    };
  },

  /**
   * Converts a blob: URL to a Base64 Data URL string
   */
  convertBlobToBase64: function (blobUrl, callback) {
    if (!blobUrl || typeof blobUrl !== "string" || !blobUrl.startsWith("blob:")) {
      if (typeof callback === "function") callback(null);
      return;
    }

    try {
      fetch(blobUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof callback === "function") callback(reader.result);
          };
          reader.onerror = () => {
            if (typeof callback === "function") callback(null);
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {
          if (typeof callback === "function") callback(null);
        });
    } catch (e) {
      if (typeof callback === "function") callback(null);
    }
  }
};
