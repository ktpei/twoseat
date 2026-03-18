const TWOSEAT = {
  // Internal message types (between extension components)
  MSG: {
    // Popup -> Service Worker
    CREATE_OFFER: 'twoseat:create-offer',
    SET_ANSWER: 'twoseat:set-answer',
    ACCEPT_OFFER: 'twoseat:accept-offer',

    // Service Worker -> Popup (via storage)
    OFFER_READY: 'twoseat:offer-ready',
    ANSWER_READY: 'twoseat:answer-ready',
    CONNECTION_STATE: 'twoseat:connection-state',

    // Service Worker <-> Offscreen
    RTC_CREATE_OFFER: 'twoseat:rtc-create-offer',
    RTC_SET_ANSWER: 'twoseat:rtc-set-answer',
    RTC_ACCEPT_OFFER: 'twoseat:rtc-accept-offer',
    RTC_OFFER_READY: 'twoseat:rtc-offer-ready',
    RTC_ANSWER_READY: 'twoseat:rtc-answer-ready',
    RTC_STATE_CHANGE: 'twoseat:rtc-state-change',
    RTC_DATA_IN: 'twoseat:rtc-data-in',
    RTC_DATA_OUT: 'twoseat:rtc-data-out',

    // Service Worker <-> Content Script
    VIDEO_EVENT: 'twoseat:video-event',
    VIDEO_COMMAND: 'twoseat:video-command',
    VIDEO_FOUND: 'twoseat:video-found',
    SYNC_TICK: 'twoseat:sync-tick',
    DISCONNECT: 'twoseat:disconnect',
  },

  // Wire protocol actions (sent over DataChannel between peers)
  ACTION: {
    PLAY: 'PLAY',
    PAUSE: 'PAUSE',
    SEEK: 'SEEK',
    SYNC: 'SYNC',
    URL_INFO: 'URL_INFO',
  },

  // Drift correction thresholds (in seconds)
  DRIFT: {
    JUMP_THRESHOLD: 1.0,
    ADJUST_THRESHOLD: 0.05,
    RATE_MIN: 0.9,
    RATE_MAX: 1.1,
    RATE_FACTOR: 0.5,
  },

  SYNC_INTERVAL_MS: 1000,

  STUN_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};
