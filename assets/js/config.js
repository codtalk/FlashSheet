// config.js — centralized config for external endpoints and defaults
// Keep non-sensitive public URLs here (Apps Script exec URLs, CSV publish URLs, translate service)
window.APP_CONFIG = window.APP_CONFIG || {
  // Feedback / write endpoint (Apps Script exec)
  FEEDBACK_URL: 'https://script.google.com/macros/s/AKfycbzX08o-y5trCA7-lCw-rLRL369Ctte2kCv_2XqA5htT3f0O5cKWgOFs1J7apbLM6eoNHw/exec',
  // Default public CSV and write exec (ThienPahm preset)
  DEFAULT_CSV: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTuYF-fncf9PSBfkDPMAv_q4LiYColRiVIpUniAUKuQFLPXqXhMgkYsTmoDr-BCv5aqaqNRAnYx7_TC/pub?output=csv',
  DEFAULT_WRITE: 'https://script.google.com/macros/s/AKfycbwmL1qr6Hvb6vGsfQ-bQmwwfJ9DuRL69IBm4jZdzmw52nu6k97_KpALKnkKtFGDA3xwKA/exec',
  DEFAULT_TRANSLATE: 'https://script.google.com/macros/s/AKfycbwDFUlYoI4ody5Iy0qm1lP6WhkjFj15NnaFaEiNkx9p8ZAT7T67Y-ORJ-vonntOno2wFA/exec'
};

// Helper getter for backwards compatibility
window.getAppConfig = function(){ return window.APP_CONFIG || {}; };
