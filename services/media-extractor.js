/**
 * WhatsApp Web Media Extractor Service
 * Namespace: window.WAMonitor.MediaExtractor
 * Orchestrates video & heavy media blob collection, ArrayBuffer reassembly, and Base64 Data URL conversion.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.MediaExtractor = {
  /**
   * Extracts clean MP4 video binary Base64 Data URL for a given media item
   */
  extractVideo: function (item, callback) {
    if (!item) {
      if (typeof callback === "function") callback(null);
      return;
    }

    const MP = window.WAMonitor?.MediaParser;
    const mediaUrl = item.mediaUrl || item.thumbUrl || "";
    const messageId = item.id || "";
    const mimeType = item.mimeType || "video/mp4";

    if (MP && typeof MP.convertBlobToBase64 === "function") {
      MP.convertBlobToBase64(
        mediaUrl,
        (base64Res) => {
          if (base64Res && typeof base64Res === "string" && base64Res.length > 500) {
            // Ensure proper data:video/mp4;base64, header prefix
            let cleanBase64 = base64Res;
            if (!cleanBase64.startsWith("data:video/")) {
              cleanBase64 = cleanBase64.replace(/^data:[^;]*;base64,/, "data:video/mp4;base64,");
            }
            if (typeof callback === "function") callback(cleanBase64);
          } else {
            // Fallback to DOM <video> element capture
            this.captureDomVideo(item.node, (domBase64) => {
              if (typeof callback === "function") callback(domBase64 || null);
            });
          }
        },
        item.node,
        messageId,
        "VIDEO",
        mimeType
      );
    } else {
      this.captureDomVideo(item.node, (domBase64) => {
        if (typeof callback === "function") callback(domBase64 || null);
      });
    }
  },

  /**
   * Captures video frame or video blob directly from DOM <video> node
   */
  captureDomVideo: function (node, callback) {
    if (!node || !(node instanceof HTMLElement)) {
      if (typeof callback === "function") callback(null);
      return;
    }

    const video = node.querySelector("video");
    if (video) {
      const src = video.src || video.currentSrc || video.querySelector("source")?.src || "";
      if (src && (src.startsWith("blob:") || src.startsWith("http"))) {
        fetch(src)
          .then((r) => r.blob())
          .then((blob) => {
            if (blob && blob.size > 500) {
              const reader = new FileReader();
              reader.onloadend = () => {
                let res = reader.result;
                if (res && typeof res === "string" && !res.startsWith("data:video/")) {
                  res = res.replace(/^data:[^;]*;base64,/, "data:video/mp4;base64,");
                }
                if (typeof callback === "function") callback(res);
              };
              reader.onerror = () => {
                if (typeof callback === "function") callback(null);
              };
              reader.readAsDataURL(blob);
            } else {
              if (typeof callback === "function") callback(null);
            }
          })
          .catch(() => {
            if (typeof callback === "function") callback(null);
          });
        return;
      }
    }

    if (typeof callback === "function") callback(null);
  }
};
