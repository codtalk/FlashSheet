// config.js — centralized config for external endpoints and defaults
// Keep non-sensitive public URLs here (Apps Script exec URLs, CSV publish URLs, translate service)
window.APP_CONFIG = window.APP_CONFIG || {
  // Feedback endpoint: leave empty to use Supabase table `feedback`
  FEEDBACK_URL: '',
  // Legacy Google Sheets fields removed; the app runs in Supabase-only mode.
  // Data source: 'supabase' only
  DATA_SOURCE: 'supabase',
  // Optional Supabase config (fill to enable). Never commit secrets if this repo is public.
  SUPABASE_URL: 'https://cctwmafkizlqknyezxvd.supabase.co', // e.g. 'https://cctwmafkizlqknyezxvd.supabase.co'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjdHdtYWZraXpscWtueWV6eHZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTgyODUsImV4cCI6MjA3ODUzNDI4NX0.fvgE7BiJPym6nUk9uwhxZ6qgYGYnjkgWUeWcu5Jgf7o', // from Project Settings > API > anon public
  SUPABASE_SCHEMA: 'public',
  SUPABASE_WORDS_TABLE: 'words_shared',
  SUPABASE_SRS_TABLE: 'srs_user',
  SUPABASE_FEEDBACK_TABLE: 'feedback',
  SUPABASE_USERS_TABLE: 'users',
  // DeepL: set your API key here to enable built-in translation
  // Use Free keys with suffix ":fx"; we'll route to api-free.deepl.com automatically
  // Optional: override base endpoint (defaults chosen by key type)
  // e.g. 'https://api-free.deepl.com' or 'https://api.deepl.com'
  cloudflareWorkersDeeplEndpoint: "https://deepl-proxy-cardcard.vanthien-dev.workers.dev"
};

// Helper getter for backwards compatibility
window.getAppConfig = function(){ return window.APP_CONFIG || {}; };
