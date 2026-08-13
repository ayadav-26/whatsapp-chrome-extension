/**
 * WhatsApp Web Message Monitor - Central Constants & Selectors
 * Namespace: window.WAMonitor.Constants
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.Constants = {
  // Message Directions
  DIRECTION: {
    INCOMING: "INCOMING",
    OUTGOING: "OUTGOING"
  },

  // Message Status
  STATUS: {
    NEW: "NEW",
    SENT: "SENT",
    FAILED: "FAILED"
  },

  // Auto-Sender Workflow Progress Status
  SENDER_STATUS: {
    IDLE: "IDLE",
    VALIDATING: "VALIDATING",
    OPENING_WHATSAPP: "Opening WhatsApp...",
    LOADING_CHAT: "Loading Chat...",
    UPLOADING_ATTACHMENT: "Uploading Attachment...",
    PREPARING_PREVIEW: "Preparing Preview...",
    ADDING_CAPTION: "Adding Caption...",
    TYPING: "Typing Message...",
    SENDING: "Sending...",
    SUCCESS: "Message Sent Successfully",
    FAILED: "Failed to Send Message"
  },

  // Message Content Types
  MESSAGE_TYPES: {
    TEXT: "TEXT",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    AUDIO: "AUDIO",
    VOICE_NOTE: "VOICE_NOTE",
    STICKER: "STICKER",
    CONTACT: "CONTACT",
    DOCUMENT: "DOCUMENT",
    UNKNOWN: "UNKNOWN"
  },

  // DOM Selectors for WhatsApp Web
  SELECTORS: {
    APP_ROOT: "#app",
    MAIN_CHAT_CONTAINER: "#main",
    SIDEBAR_CONTAINER: "#pane-side",

    // Header
    CHAT_HEADER: "#main header",
    CHAT_TITLE: "#main header span[title], #main header div[role='button'] span[dir='auto']",

    // Message items (scoped strictly to active #main container)
    MESSAGE_WRAPPER: "#main div.message-in, #main div.message-out, #main div[data-id]",
    MESSAGE_INCOMING_CLASS: "message-in",
    MESSAGE_OUTGOING_CLASS: "message-out",
    OUTGOING_ICONS: "span[data-icon='msg-check'], span[data-icon='msg-dblcheck'], span[data-icon='msg-time'], span[data-icon='msg-dblcheck-ack'], span[data-icon*='check'], span[data-icon*='dblcheck'], span[data-icon*='time'], span[data-icon*='ack'], span[data-icon*='status-']",

    // Sender Inputs & Controls
    CHAT_INPUT: "#main footer div[contenteditable='true'][role='textbox'], #main footer div[contenteditable='true'], div[contenteditable='true'][data-tab='10']",
    SEND_BUTTON: "#main footer button[aria-label*='Send'], #main footer span[data-icon='send'], #main footer button span[data-icon='send']",
    INVALID_NUMBER_MODAL: "div[role='dialog']",
    INVALID_NUMBER_OK_BTN: "div[role='dialog'] button",
    QR_CODE_CANVAS: "canvas[aria-label*='Scan'], div[data-ref]",
    SEARCH_INPUT: "#side div[contenteditable='true'][role='textbox'], #side div[contenteditable='true'], div[contenteditable='true'][data-tab='3'], div[title*='Search']",
    SEARCH_RESULT_ROW: "#pane-side div[role='listitem'], #pane-side div._ak72, #pane-side div._ak7h",

    // Attachment Selectors
    ATTACH_MENU_BTN: "#main footer span[data-icon='plus'], #main footer span[data-icon='attach-menu-plus'], #main footer button[aria-label*='Attach'], #main footer div[aria-label*='Attach']",
    FILE_INPUT_DOC: "input[type='file'][accept*='*'], input[type='file']",
    FILE_INPUT_MEDIA: "input[type='file'][accept*='image'], input[type='file'][accept*='video']",
    FILE_INPUT_ANY: "input[type='file']",
    MEDIA_PREVIEW_MODAL: "div[role='region'], #app div._ak7w, div[aria-label*='Preview'], div._ak7w",
    PREVIEW_CAPTION_INPUT: "div[role='region'] div[contenteditable='true'], div._ak7w div[contenteditable='true'], div[contenteditable='true'][data-tab='10']",
    PREVIEW_SEND_BTN: "div[role='region'] span[data-icon='send'], div[role='region'] div[role='button'], div[role='region'] button, span[data-icon='send'], div[aria-label*='Send']",

    // Content
    COPYABLE_TEXT_CONTAINER: ".copyable-text",
    TEXT_CONTENT: ".selectable-text.copyable-text, span._ao3e, span.selectable-text, div._am8d, div.copyable-text span, span[dir='ltr']",
    GROUP_SENDER_NAME: "span._ak72, span._ak73, span[dir='aria-label']",

    // Media
    MEDIA_IMAGE: "img[src*='blob:'], img[src*='pps.whatsapp.net'], div[aria-label*='Photo']",
    MEDIA_VIDEO: "video, span[data-icon='media-play'], span[data-icon*='play'], span[data-icon*='video'], div[aria-label*='Video'], div[aria-label*='video'], div[data-testid*='video']",
    MEDIA_AUDIO: "audio, span[data-icon='audio-download'], span[data-icon='ptt-play']",
    MEDIA_VOICE_NOTE: "div[aria-label*='voice message'], div[aria-label*='audio']",
    MEDIA_DOCUMENT: "span[data-icon='document'], div[aria-label*='Document']",
    MEDIA_STICKER: "div[aria-label*='Sticker'], img[src*='sticker']",
    MEDIA_CONTACT: "span[data-icon='person'], div[aria-label*='Contact card']",

    // Timestamp & Sidebar
    TIMESTAMP: "div[data-pre-plain-text], span[dir='ltr'], div._ak8i",
    SIDEBAR_ROW: "#pane-side div[role='listitem'], #pane-side div._ak72, #pane-side div._ak7h",
    SIDEBAR_TIMESTAMP: "div._ak8i, div._ak8f, div._ak8j",

    // Media Downloader & Status Selectors
    STATUS_CONTAINER: "div[data-animate-status-item], #app div[role='dialog'] video, #app div[role='dialog'] img[src*='blob:'], div._ak8l",
    STATUS_MEDIA_ITEM: "div[role='dialog'] video, div[role='dialog'] img",
    MEDIA_OVERLAY_CONTAINER: "#main header div[role='toolbar'], #main header div._ak6r, #main header",
    MESSAGE_MEDIA_ITEM: "#main div.message-in img, #main div.message-out img, #main div.message-in video, #main div.message-out video, #main div.message-in audio, #main div.message-out audio, #main div.message-in a[href*='blob:'], #main div.message-out a[href*='blob:']"
  },

  // File Upload Limits & Allowed Extensions
  ATTACHMENT_LIMITS: {
    MAX_FILE_SIZE_BYTES: 104857600, // 100 MB Limit
    IMAGE_EXTENSIONS: ["jpg", "jpeg", "png", "gif", "webp"],
    VIDEO_EXTENSIONS: ["mp4", "mov", "avi", "mkv", "webm"],
    DOCUMENT_EXTENSIONS: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip", "rar"],
    AUDIO_EXTENSIONS: ["mp3", "wav", "m4a", "ogg"]
  },

  // Media Categories for Downloader Filter
  MEDIA_CATEGORIES: {
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    AUDIO: "AUDIO",
    DOCUMENT: "DOCUMENT",
    STICKER: "STICKER"
  },

  // Storage Keys
  STORAGE_KEYS: {
    MESSAGES: "whatsapp_messages",
    TOTAL_CAPTURED: "totalCaptured",
    LAST_CAPTURED: "lastCapturedMessage",
    SEND_TASK: "active_send_task",
    SYNCED_CHATS: "whatsapp_synced_chats",
    SYNCED_MESSAGES: "whatsapp_synced_messages",
    WEBHOOK_URL: "whatsapp_sync_webhook_url",
    SYNC_ENABLED: "whatsapp_sync_enabled",
    LAST_SYNC_TIME: "whatsapp_last_sync_time",
    DOWNLOAD_SETTINGS: "whatsapp_download_settings",
    DOWNLOAD_HISTORY: "whatsapp_download_history"
  },

  // Configuration & Filename Patterns
  CONFIG: {
    LOG_PREFIX: "[WA Monitor]",
    MAX_PROCESSED_IDS_CACHE: 3000,
    CHAT_LOAD_TIMEOUT_MS: 30000,
    PREVIEW_LOAD_TIMEOUT_MS: 15000,
    FILENAME_TEMPLATES: {
      DEFAULT: "{Date}_{ChatName}_{Sender}_{FileName}",
      SIMPLE: "{ChatName}_{Index}",
      DETAILED: "{Date}_{Time}_{ChatName}_{Sender}_{Type}_{Index}"
    }
  },

  // Chat Synchronization Defaults
  SYNC_DEFAULTS: {
    DEFAULT_WEBHOOK_URL: "https://ai-workflow.smartsight.in/webhook/whatsapp-sync",
    DEFAULT_SYNC_ENABLED: true,
    BATCH_DEBOUNCE_MS: 1000,
    MAX_RETRY_ATTEMPTS: 3
  }
};

