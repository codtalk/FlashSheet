// utils.js - shared helpers for LearnEnglish
// Centralized endpoints are loaded from `assets/js/config.js` which sets window.APP_CONFIG
const APP_CFG = (window && window.APP_CONFIG) ? window.APP_CONFIG : {};
const DS_MODE = (APP_CFG && APP_CFG.DATA_SOURCE) || 'sheet';
const FEEDBACK_URL = APP_CFG.FEEDBACK_URL || '';

// Storage keys
const STORAGE_KEY = 'learnEnglish.dataset.v2';
const SHEET_CFG_KEY = 'learnEnglish.sheetConfig.v2';

// Load dataset: LOCAL-ONLY (do not fallback to file)
// First-run bootstrap should be handled by callers using loadDatasetFromFile() then saveDatasetToLocal()
async function loadDataset() {
  // Supabase mode: return per-user SRS records (used for merging)
  if (DS_MODE === 'supabase' && APP_CFG.SUPABASE_URL && APP_CFG.SUPABASE_ANON_KEY){
    try{
      const user = loadUser();
      const table = APP_CFG.SUPABASE_SRS_TABLE || 'srs_user';
      const url = `${APP_CFG.SUPABASE_URL}/rest/v1/${table}?user=eq.${encodeURIComponent(user)}&select=*`;
      const resp = await fetch(url, { headers: {
        'apikey': APP_CFG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${APP_CFG.SUPABASE_ANON_KEY}`,
        'Accept': 'application/json'
      }});
      if (!resp.ok) throw new Error('Supabase per-user SRS load failed');
      const data = await resp.json();
      console.log('Loaded per-user SRS data from Supabase:', data);
      return Array.isArray(data) ? data : [];
    }catch(e){ console.warn('Supabase loadDataset failed', e); return []; }
  }
  // Load dataset for the current user from Apps Script endpoint if available;
  // fallback to published CSV when provided.
  try {
    const cfg = loadSheetConfig();
    const user = loadUser();
    // If a Apps Script writeUrl is present, prefer calling it with ?op=read&user=...
    const writeUrl = cfg && cfg.writeUrl;
    if (writeUrl && writeUrl.indexOf('script.google.com') >= 0 && user) {
      const url = writeUrl + (writeUrl.indexOf('?')>=0 ? '&' : '?') + 'op=read&user=' + encodeURIComponent(user);
      try{
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error('Apps Script read failed');
        const json = await resp.json();
        return Array.isArray(json) ? json : [];
      }catch(err){
        console.warn('Failed to fetch via Apps Script read (CORS or network). Will try JSONP fallback:', err);
        try{
          const jsonp = await fetchJsonp(url);
          return Array.isArray(jsonp) ? jsonp : [];
        }catch(err2){ console.warn('JSONP fallback failed', err2); }
      }
    }
    // Otherwise fallback to CSV URL
    const csvUrl = cfg && cfg.csvUrl;
    if (csvUrl){
      try{
        return await fetchSheetCSV(csvUrl);
      }catch(err){ console.warn('Failed to fetch sheet CSV in loadDataset', err); }
    }
  } catch (e) { console.warn('loadDataset error', e); }
  return [];
}

// Load the DEFAULT sheet (no user param) — useful for shared 'Học từ' view
async function loadDefaultDataset(){
  // Supabase mode: load shared words table via REST
  if (DS_MODE === 'supabase' && APP_CFG.SUPABASE_URL && APP_CFG.SUPABASE_ANON_KEY){
    try{
      const table = APP_CFG.SUPABASE_WORDS_TABLE || 'words_shared';
      const url = `${APP_CFG.SUPABASE_URL}/rest/v1/${table}?select=*`;
      const resp = await fetch(url, { headers: {
        'apikey': APP_CFG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${APP_CFG.SUPABASE_ANON_KEY}`,
        'Accept': 'application/json'
      }});
      if (!resp.ok) throw new Error('Supabase words load failed');
      const arr = await resp.json();
      if (!Array.isArray(arr)) return [];
      return arr.map(row => {
        const meanings = toArray(row.meanings, row.meanings_text);
        const examples = toArray(row.examples, row.examples_text);
        const out = { word: row.word || '', meanings, examples };
        ['pos','addedat','reps','lapses','ease','interval','due','lastreview','selectedForStudy','selected'].forEach(k=>{
          if (row[k] != null) out[k] = row[k];
        });
        return out;
      });
    }catch(e){ console.warn('Supabase loadDefaultDataset failed', e); return []; }
  }
  try{
    const cfg = loadSheetConfig();
    const writeUrl = cfg && cfg.writeUrl;
    // If Apps Script exec present, call it WITHOUT user param to read default sheet
    if (writeUrl && writeUrl.indexOf('script.google.com') >= 0){
      const url = writeUrl + (writeUrl.indexOf('?')>=0 ? '&' : '?') + 'op=read';
      try{
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error('Apps Script read failed');
        const json = await resp.json();
        return Array.isArray(json) ? json : [];
      }catch(err){
        console.warn('Failed to fetch default via Apps Script read, trying JSONP/CVS fallback:', err);
        try{ const jsonp = await fetchJsonp(url); return Array.isArray(jsonp) ? jsonp : []; }catch(e2){ console.warn('JSONP fallback failed', e2); }
      }
    }
    // Fallback to csvUrl
    const csvUrl = cfg && cfg.csvUrl;
    if (csvUrl) return await fetchSheetCSV(csvUrl);
  }catch(e){ console.warn('loadDefaultDataset error', e); }
  return [];
}

// Always load from bundled file (ignores Local Storage)
async function loadDatasetFromFile(){
  // Deprecated: bundled `data/vocab.json` is no longer used. Return empty array.
  console.warn('loadDatasetFromFile deprecated: use Google Sheet as data source');
  return [];
}

function saveDatasetToLocal(dataset) {
  // Deprecated: dataset is stored on Google Sheet. Keep a no-op for compatibility.
  try{ /* noop to avoid accidental writes to localStorage */ }catch{}
}

// User management: store current username (used to read/write per-user sheet)
const USER_KEY = 'fs_current_user';
function loadUser(){
  try{ return localStorage.getItem(USER_KEY) || ''; }catch{return '';}
}
function saveUser(u){
  try{ if (u) localStorage.setItem(USER_KEY, String(u).trim()); }catch{}
}
// Prompt for user if none set; returns stored or newly set username (or empty string if cancelled)
function ensureUserPrompt(defaultName){
  const existing = loadUser();
  if (existing) return existing;
  try{
    const promptName = window.prompt('Nhập tên người dùng (username) để đồng bộ tiến độ học:', defaultName || '');
    if (promptName && promptName.trim()){
      const uname = promptName.trim();
      saveUser(uname);
      // Best-effort: upsert into Supabase users table
      try{
        if (DS_MODE === 'supabase' && APP_CFG.SUPABASE_URL && APP_CFG.SUPABASE_ANON_KEY){
          const table = APP_CFG.SUPABASE_USERS_TABLE || 'users';
          const url = `${APP_CFG.SUPABASE_URL}/rest/v1/${table}?on_conflict=username`;
          const headers = {
            'apikey': APP_CFG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${APP_CFG.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          };
          const nowIso = new Date().toISOString();
          const ext = [{ username: uname, created_at: nowIso, streak_count: 0, best_streak: 0, last_active: nowIso }];
          // Try extended columns first; fall back to minimal if columns don't exist
          fetch(url, { method:'POST', headers, body: JSON.stringify(ext) })
            .then(resp => { if (!resp.ok) throw new Error('ext upsert failed'); })
            .catch(()=>{
              const minimal = [{ username: uname, created_at: nowIso }];
              fetch(url, { method:'POST', headers, body: JSON.stringify(minimal) }).catch(()=>{});
            });
        }
      }catch{}
      return uname;
    }
  }catch{}
  return '';
}

function clearDatasetLocal() {
  localStorage.removeItem(STORAGE_KEY);
}

// Download JSON helper
// Removed: downloadJSON (no longer used)

// Shuffle array (Fisher–Yates)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick n unique random items
function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

// Build multiple choice options: 1 correct + others from other words
function buildChoices(dataset, correctIdx, count = 4) {
  const correctWord = dataset[correctIdx].word;
  const others = dataset
    .map((d, idx) => ({ word: d.word, idx }))
    .filter((x) => x.idx !== correctIdx)
    .map((x) => x.word);
  const picks = sample(others, Math.max(0, count - 1));
  const choices = shuffle([correctWord, ...picks]);
  return choices;
}

// Confetti effect (lightweight)
function confettiBurst(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = (canvas.width = canvas.offsetWidth);
  const h = (canvas.height = canvas.offsetHeight);
  const N = 80;
  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * w,
    y: -10,
    vx: (Math.random() - 0.5) * 2,
    vy: 2 + Math.random() * 3,
    size: 4 + Math.random() * 4,
    color: `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`,
    life: 0,
  }));
  let frame = 0;
  function draw() {
    frame++;
    ctx.clearRect(0, 0, w, h);
    parts.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.02;
      p.life += 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    if (frame < 120) requestAnimationFrame(draw);
  }
  draw();
}

// Basic CSV parser for dataset
// Supported formats:
// 1) word,meanings  (meanings separated by ';' or '|')
// 2) word,meaning1,meaning2,meaning3
function parseCSVToDataset(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.length > 0);
  const out = [];
  if (lines.length === 0) return out;
  const sep = ',';

  // helpers
  const strip = (s) => (s || '').toString().trim();
  const normKey = (s) => strip(s).toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const WORD_KEYS = ['word','tu','tu vung','tu-vung','term','vocabulary'];
  const DEF_KEYS = ['definitions','dinh nghia','dinh-nghia','dinh nghia','mo ta','mo-ta','mo ta','mota','meaning','nghia','desc','description'];
  const EXAMPLE_KEYS = ['example','examples','sentence','sentences','vd','vi du','ví dụ','ví-dụ'];
  const TS_KEYS = ['timestamp','date','ngay','time','created','createdat'];
  const looksLikeDate = (s) => {
    const v = strip(s);
    if (!v) return false;
    // common patterns: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, ISO, etc.
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(v)) return true;
    if (/^\d{4}[\-]\d{1,2}[\-]\d{1,2}/.test(v)) return true;
    // fallback: Date.parse, but avoid parsing single numbers/words
    const d = Date.parse(v);
    return !isNaN(d) && /[\/\-: ]/.test(v);
  };

  const headerRaw = lines[0].split(sep).map(strip);
  const header = headerRaw.map(normKey);
  const headerHasKnown = header.some(h => WORD_KEYS.includes(h) || DEF_KEYS.includes(h) || TS_KEYS.includes(h));
  const start = headerHasKnown ? 1 : 0;

  // figure out column indices if header known
  let wi = -1, di = -1, ei = -1, ti = -1;
  if (headerHasKnown) {
    wi = header.findIndex(h => WORD_KEYS.includes(h));
    di = header.findIndex(h => DEF_KEYS.includes(h));
    ei = header.findIndex(h => EXAMPLE_KEYS.includes(h));
    ti = header.findIndex(h => TS_KEYS.includes(h));
  }

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(strip);
    if (cols.length === 0) continue;
    let word = '';
    let defs = [];

    if (headerHasKnown && (wi >= 0 || di >= 0)) {
      if (wi >= 0) word = cols[wi] || '';
      if (di >= 0) {
        const raw = cols[di] || '';
        defs = raw.split(/;|\|/).map(d => d.trim()).filter(Boolean);
      } else {
  // no explicit meanings column: take remaining non-empty, excluding timestamp and word
        defs = cols.filter((_, idx) => idx !== wi && idx !== ti)
                   .map(x => x.trim()).filter(Boolean);
        // also split by ; or |
        if (defs.length === 1) {
          defs = defs[0].split(/;|\|/).map(d => d.trim()).filter(Boolean);
        }
      }
      // examples column if present
      if (ei >= 0) {
        const rawEx = cols[ei] || '';
        const exs = rawEx.split(/;|\|/).map(d => d.trim()).filter(Boolean);
        if (exs.length) defs.examples = exs; // temporarily attach to defs variable (we'll map to rowObj below)
      }
    } else {
      // No recognizable header
      if (cols.length >= 3 && looksLikeDate(cols[0])) {
  // Common pattern from our Apps Script: [Timestamp, Word, Meanings]
        word = cols[1] || '';
        const raw = cols.slice(2).join(';');
        defs = raw.split(/;|\|/).map(d => d.trim()).filter(Boolean);
      } else {
  // fallback: first col as word, rest as meanings
        word = cols[0] || '';
        const raw = cols.slice(1).join(';');
        defs = raw.split(/;|\|/).map(d => d.trim()).filter(Boolean);
      }
    }

    if (word) {
      // Build result object and include any extra columns (SRS fields) when header present
      // Store canonical `meanings` field; also examples if any
      const rowObj = { word, meanings: defs.slice ? defs.slice() : (Array.isArray(defs) ? defs : []) };
      if (defs && defs.examples) {
        rowObj.examples = exs;
      }
      if (headerHasKnown) {
        for (let j = 0; j < headerRaw.length; j++){
          const key = headerRaw[j];
          if (!key) continue;
          // Skip columns already parsed
          if (j === wi || j === di || j === ti) continue;
          // also capture example column explicitly
          if (j === ei) {
            const rawEx2 = cols[j] || '';
            const exs2 = rawEx2.split(/;|\|/).map(d => d.trim()).filter(Boolean);
            if (exs2.length) rowObj.examples = exs2;
            continue;
          }
          rowObj[key] = cols[j] || '';
        }
      }
      out.push(rowObj);
    }
  }
  return out;
}
  

// File input -> parse JSON or CSV based on extension/MIME
async function importDatasetFromFile(file) {
  const name = (file.name || '').toLowerCase();
  const text = await file.text();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const data = parseCSVToDataset(text);
    if (!Array.isArray(data)) throw new Error('CSV không hợp lệ');
    return data;
  }
  // default JSON
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('JSON phải là mảng các mục');
  return data;
}

// Backward compat: JSON-only import
async function importJSONFromFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('JSON phải là mảng các mục');
  return data;
}

// File System Access API (optional, Chrome/Edge)
// Removed: saveJSONToFolder (no longer used)

// --- Google Sheet helpers ---
function saveSheetConfig(cfg){
  localStorage.setItem(SHEET_CFG_KEY, JSON.stringify(cfg||{}));
}
function loadSheetConfig(){
  const DEFAULT_TRANSLATE_URL = APP_CFG.DEFAULT_TRANSLATE || '';
  // Defaults (can be overridden by saved config)
  const THIEN_CSV = APP_CFG.DEFAULT_CSV || '';
  const THIEN_WRITE = APP_CFG.DEFAULT_WRITE || '';
  try{
    const cfg = JSON.parse(localStorage.getItem(SHEET_CFG_KEY) || '{}') || {};
    // Provide safe defaults without overwriting user's saved values
    return Object.assign({ translateUrl: DEFAULT_TRANSLATE_URL, csvUrl: THIEN_CSV, writeUrl: THIEN_WRITE }, cfg);
  }catch{
    return { translateUrl: DEFAULT_TRANSLATE_URL, csvUrl: THIEN_CSV, writeUrl: THIEN_WRITE };
  }
}
async function fetchSheetCSV(url){
  if (!url) throw new Error('Thiếu CSV URL');
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error('Không tải được CSV');
  const text = await resp.text();
  return parseCSVToDataset(text);
}

// JSONP helper: loads a script with a callback parameter and resolves with the returned data
function fetchJsonp(url, timeout = 9000){
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('Missing url'));
    const cb = '__jsonp_cb_' + Math.random().toString(36).slice(2);
    const sep = url.indexOf('?') >= 0 ? '&' : '?';
    const s = document.createElement('script');
    let timer = null;
    window[cb] = function(data){
      clearTimeout(timer);
      try{ delete window[cb]; }catch{}
      s.remove();
      resolve(data);
    };
    s.src = url + sep + 'callback=' + cb;
    s.onerror = function(err){
      clearTimeout(timer);
      try{ delete window[cb]; }catch{}
      s.remove();
      reject(new Error('JSONP script load error'));
    };
    document.head.appendChild(s);
    timer = setTimeout(() => {
      try{ delete window[cb]; }catch{}
      s.remove();
      reject(new Error('JSONP timeout'));
    }, timeout);
  });
}

// Replace cloze underscores (____) with equal-length dashes (----) for clearer display
function clozeToDashes(text){
  if (!text) return text;
  return String(text).replace(/_{2,}/g, function(m){ return '-'.repeat(m.length); });
}
// Helpers to coerce DB values to arrays
function toArray(arr, text){
  if (Array.isArray(arr)) return arr.filter(Boolean).map(s=>String(s));
  if (typeof text === 'string' && text.trim()) return text.split(/;\s*/).map(s=>s.trim()).filter(Boolean);
  if (typeof arr === 'string' && arr.trim()) return arr.split(/;\s*/).map(s=>s.trim()).filter(Boolean);
  return [];
}
// Append rows to Apps Script endpoint
// rows: Array<{word, meanings: string[]}>; server decides how to store
async function appendRowsToSheet(endpoint, rows){
  // Supabase mode: upsert rows into appropriate tables via REST
  if (DS_MODE === 'supabase' && APP_CFG.SUPABASE_URL && APP_CFG.SUPABASE_ANON_KEY){
    const headers = {
      'apikey': APP_CFG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${APP_CFG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    };
    const user = loadUser();
    const wordsTable = APP_CFG.SUPABASE_WORDS_TABLE || 'words_shared';
    const srsTable = APP_CFG.SUPABASE_SRS_TABLE || 'srs_user';
    const feedbackTable = APP_CFG.SUPABASE_FEEDBACK_TABLE || 'feedback';
    const out = [];
    for (const r of (rows||[])){
      try{
        if (r && r.type === 'feedback'){
          const body = JSON.stringify([{ message: r.message||'', ctx: r.ctx||'', user: r.user||user||'', created_at: new Date().toISOString() }]);
          const url = `${APP_CFG.SUPABASE_URL}/rest/v1/${feedbackTable}`;
          const resp = await fetch(url+'?on_conflict=id', { method:'POST', headers, body });
          if (!resp.ok) throw new Error('feedback upsert failed');
          out.push({ ok:true, type:'feedback' });
          continue;
        }
        // Prefer handling SRS writes first (avoid routing to words table when SRS fields present)
        const hasSrs = r && (
          r.addedat != null ||
          r.reps != null || r.lapses != null || r.ease != null || r.interval != null || r.due != null ||
          r.lastreview != null
        );
        if (r && r.word && hasSrs){
          const url = `${APP_CFG.SUPABASE_URL}/rest/v1/${srsTable}?on_conflict=user,word`;
          const toNum = (v) => {
            if (v === null || v === undefined) return null;
            if (typeof v === 'number') return Math.round(v);
            if (typeof v === 'string'){
              // Prefer parsing as date first (handles ISO like 2025-11-13T...)
              const pd = Date.parse(v);
              if (!Number.isNaN(pd)) return pd;
              // Fallback: numeric string
              const pi = Number(v);
              if (!Number.isNaN(pi)) return Math.round(pi);
            }
            return null;
          };
          const payload = [{
            user: user || '',
            word: r.word,
            addedat: toNum(r.addedat ?? null),
            reps: r.reps ?? null,
            lapses: r.lapses ?? null,
            ease: r.ease ?? null,
            interval: toNum(r.interval ?? null),
            due: toNum(r.due ?? null),
            lastreview: toNum(r.lastreview ?? null)
          }];
          const resp = await fetch(url, { method:'POST', headers, body: JSON.stringify(payload) });
          if (!resp.ok) throw new Error(`srs upsert failed (${resp.status})`);
          out.push({ ok:true, type:'srs' });
          continue;
        }
        // Upsert word metadata (meanings/examples/pos) — do NOT store selection flags in shared table
        if (r && r.word){
          const payload = [{
            word: r.word || '',
            meanings_text: Array.isArray(r.meanings) ? r.meanings.join('; ') : (r.meanings||''),
            examples_text: Array.isArray(r.examples) ? r.examples.join('; ') : (r.examples||''),
            pos: r.pos != null ? String(r.pos) : undefined
          }];
          // Remove undefined keys to avoid overwriting with null
          const cleaned = payload.map(obj => {
            const o = {}; Object.keys(obj).forEach(k=>{ if (obj[k] !== undefined) o[k] = obj[k]; }); return o;
          });
          const url = `${APP_CFG.SUPABASE_URL}/rest/v1/${wordsTable}?on_conflict=word`;
          const resp = await fetch(url, { method:'POST', headers, body: JSON.stringify(cleaned) });
          if (!resp.ok) throw new Error('words upsert failed');
          out.push({ ok:true, type:'word' });
          continue;
        }
      }catch(err){ console.warn('Supabase append failed for row', r, err); }
    }
    return { ok:true, details: out };
  }
  if (!endpoint) throw new Error('Thiếu Apps Script URL');
  // If this looks like an Apps Script endpoint and a user is set, append the user param
  try{
    const user = loadUser();
    if (user && endpoint.indexOf('script.google.com') >= 0) {
      // only append if no existing user param
      if (endpoint.indexOf('user=') === -1) {
        endpoint = endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + 'user=' + encodeURIComponent(user);
      }
    }
  }catch(e){ /* ignore */ }
  const compact = rows.map(r => {
    if (r && r.type === 'feedback') {
      return { type: 'feedback', message: r.message || '', ctx: r.ctx || '', user: r.user || '' };
    }
    const out = {};
    for (const k in r){
      if (!Object.prototype.hasOwnProperty.call(r,k)) continue;
      if (k === 'meanings') out.meanings = (r.meanings||[]).join('; ');
      else if (k === 'examples') out.examples = (r.examples||[]).join('; ');
      else out[k] = r[k];
    }
    // ensure word exists
    if (!out.word && r.word) out.word = r.word;
    return out;
  });
  // Use form-urlencoded to avoid CORS preflight to Apps Script
  const body = 'rows=' + encodeURIComponent(JSON.stringify(compact));
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
    });
    if (!resp.ok) throw new Error('Ghi vào Sheet thất bại');
    // Some deployments may not return JSON; best-effort parse
    const text = await resp.text();
    try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
  } catch (err) {
    // Fallback: fire-and-forget to bypass CORS with opaque response
    try {
      await fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
      });
      return { ok: true, mode: 'no-cors' };
    } catch (e2) {
      throw err;
    }
  }
}

// Export common helpers
window.LE = {
  FEEDBACK_URL,
  loadDatasetFromFile,
  loadDataset,
  saveDatasetToLocal,
  clearDatasetLocal,
  shuffle,
  sample,
  buildChoices,
  confettiBurst,
  importJSONFromFile,
  importDatasetFromFile,
  // sheet
  saveSheetConfig,
  loadSheetConfig,
  fetchSheetCSV,
  loadDefaultDataset,
  fetchJsonp,
  clozeToDashes,
  toArray,
  appendRowsToSheet,
};

// --- First-load Supabase connectivity log (non-blocking) ---
(function(){
  try{
    const isSupabase = (DS_MODE === 'supabase' && APP_CFG.SUPABASE_URL && APP_CFG.SUPABASE_ANON_KEY);
    if (!isSupabase){
      console.info('[FlashSheet] Data source:', DS_MODE || 'sheet');
      return;
    }
    const wordsTable = APP_CFG.SUPABASE_WORDS_TABLE || 'words_shared';
    const url = `${APP_CFG.SUPABASE_URL}/rest/v1/${wordsTable}?select=word&limit=1`;
    const headers = {
      'apikey': APP_CFG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${APP_CFG.SUPABASE_ANON_KEY}`,
      'Accept': 'application/json'
    };
    fetch(url, { headers, cache:'no-store' })
      .then(async resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const sample = await resp.json().catch(()=>[]);
        const msg = `[FlashSheet] Supabase connected (${wordsTable}). Sample: ${Array.isArray(sample) && sample.length ? sample[0].word : 'empty'}`;
        try{ localStorage.setItem('supabase_last_ping', JSON.stringify({ ok:true, at: Date.now(), sample })); }catch{}
        console.info(msg);
      })
      .catch(err => {
        try{ localStorage.setItem('supabase_last_ping', JSON.stringify({ ok:false, at: Date.now(), error: String(err) })); }catch{}
        console.error('[FlashSheet] Supabase connection failed:', err);
      });
  }catch(e){ /* ignore */ }
})();

// --- Optional: Web Speech (Text-to-Speech) helpers ---
(function(){
  const hasTTS = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const DEBUG_TTS = (()=>{ try{ return (localStorage.getItem('fs_debug_tts') === '1') || /(?:\?|&)debugTTS=1(?:&|$)/.test(window.location.search||''); }catch{ return false; } })();
  const dbg = (...args)=>{ if (DEBUG_TTS){ try{ console.debug('[TTS]', ...args); }catch{} } };
  let voices = [];
  let ready = false;
  let voicesPromise = null;
  function loadVoices(){
    try{
      voices = window.speechSynthesis?.getVoices?.() || [];
      dbg('loadVoices ->', voices && voices.length ? `${voices.length} voices` : 'no voices');
      ready = true;
    }catch{}
  }
  if (hasTTS){
    loadVoices();
    try{
      window.speechSynthesis?.addEventListener?.('voiceschanged', ()=>{ dbg('voiceschanged event'); loadVoices(); });
    }catch{}
  }

  function pickVoice(lang){
    if (!hasTTS) return null;
    const lc = (lang||'').toLowerCase();
    // prefer exact match
    let v = voices.find(v=> (v.lang||'').toLowerCase() === lc);
    if (v) return v;
    // prefer language prefix
    const prefix = lc.split('-')[0];
    v = voices.find(v=> (v.lang||'').toLowerCase().startsWith(prefix));
    if (v) return v;
    // any default
    const pick = voices[0] || null;
    dbg('pickVoice fallback ->', pick ? (pick.lang||'unknown') : 'none');
    return pick;
  }

  async function ensureVoices(timeoutMs=2500){
    if (!hasTTS) return false;
    // If voices already loaded or previously attempted, still try a short wait for Safari
    if (!voicesPromise){
      voicesPromise = new Promise(res => {
        let done = false;
        const finish = () => { if (!done){ done=true; res(true); } };
        try{
          loadVoices();
          if (voices && voices.length){ finish(); return; }
        }catch{}
        const onvc = ()=>{ dbg('ensureVoices voiceschanged -> finishing'); try{ loadVoices(); }catch{} finish(); };
        try{ window.speechSynthesis?.addEventListener?.('voiceschanged', onvc); }catch{}
        setTimeout(()=>{
          try{ window.speechSynthesis?.removeEventListener?.('voiceschanged', onvc); }catch{}
          dbg('ensureVoices timeout', timeoutMs);
          finish();
        }, timeoutMs);
      });
    }
    try{ await voicesPromise; }catch{}
    dbg('ensureVoices done, count=', voices ? voices.length : 0);
    return (voices && voices.length) ? true : false;
  }

  function resumeIfPaused(){
    try{
      // Safari sometimes needs resume() to actually output audio
      window.speechSynthesis?.resume?.();
      dbg('resumeIfPaused called');
    }catch{}
  }

  function speak(text, { lang='en-US', rate=1, pitch=1, volume=1 }={}){
    if (!hasTTS) return Promise.resolve(false);
    return new Promise(async resolve => {
      const t = (text||'').toString().trim();
      if (!t){ resolve(false); return; }
      // ensure voices
      try{ await ensureVoices(1200); }catch{}
      const u = new SpeechSynthesisUtterance(t);
      u.lang = lang; u.rate = rate; u.pitch = pitch; u.volume = volume;
      const v = pickVoice(lang); if (v) u.voice = v;
      let settled = false;
      const settle = (val)=>{ if (!settled){ settled=true; resolve(val); } };
      u.onend = () => { dbg('onend', { text: t.slice(0,40), lang, rate }); settle(true); };
      u.onerror = (e) => { dbg('onerror', e && e.error ? e.error : e); settle(false); };
      // Cancel any ongoing utterances, then speak after a microtask to avoid race conditions in some browsers
      try{ window.speechSynthesis.cancel(); }catch{}
      try{
        setTimeout(() => {
          try{
            resumeIfPaused();
            dbg('speak start', { text: t.slice(0,40), lang, rate });
            window.speechSynthesis.speak(u);
            // Fallback timeout: if no end/error after a while, consider failure
            const to = Math.max(1200, Math.min(4000, Math.ceil(t.length*80)));
            setTimeout(()=>{ dbg('speak timeout', to); settle(false); }, to);
          }catch(e){ settle(false); }
        }, 0);
      }catch{ settle(false); }
    });
  }

  function chainSpeak(parts){
    // parts: Array<{text, lang, rate?, pitch?, volume?}>
    const run = async()=>{
      for (const p of parts){
        if (!p || !p.text) continue;
        // small gap between utterances
        // eslint-disable-next-line no-await-in-loop
        await speak(p.text, p);
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r=>setTimeout(r, 150));
      }
      return true;
    };
    return run();
  }

  function buildGoogleTTSUrl(text, lang){
    const q = encodeURIComponent((text||'').toString());
    const tl = encodeURIComponent((lang||'en').toString());
    // Unofficial Google Translate TTS endpoint; may be rate-limited or blocked. Use with care.
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${q}&tl=${tl}&client=tw-ob`;
  }

  function speakViaAudio(text, { lang='en', provider='config' }={}){
    const t = (text||'').toString().trim(); if (!t) return Promise.resolve(false);
    return new Promise(async (resolve)=>{
      try{
        let url = '';
        if (provider === 'google'){
          url = buildGoogleTTSUrl(t, lang);
        } else {
          const cfg = (window.LE && LE.loadSheetConfig && LE.loadSheetConfig()) || {};
          const base = cfg.ttsUrl || '';
          if (!base) { resolve(false); return; }
          const sep = base.includes('?') ? '&' : '?';
          url = `${base}${sep}text=${encodeURIComponent(t)}&lang=${encodeURIComponent(lang)}`;
        }
        const a = new Audio();
        a.crossOrigin = 'anonymous';
        a.src = url;
        a.onended = ()=> { dbg('audio onended'); resolve(true); };
        a.onerror = (e)=> { dbg('audio onerror', e); resolve(false); };
        // Some browsers require user gesture; assume caller is in click handler.
        try{
          dbg('audio play', { provider, url: (url||'').slice(0,80) + '...' });
          await a.play();
        }catch(err){
          // As a last resort, open the audio in a new tab/window to bypass autoplay/CORS UI blocks
          try{
            const win = window.open(url, '_blank', 'noopener');
            if (win) { dbg('audio fallback window.open success'); resolve(true); return; }
          }catch{}
          dbg('audio play rejected', err);
          resolve(false);
        }
      }catch{ resolve(false); }
    });
  }

  window.LE = Object.assign({}, window.LE, {
    tts: {
      supported: () => !!hasTTS,
      ensureVoices,
      speak,
      chainSpeak,
      speakViaAudio,
      setDebug: (flag)=>{ try{ localStorage.setItem('fs_debug_tts', flag ? '1':'0'); }catch{} }
    }
  });
})();

// --- Sound effects (SFX) for correct/incorrect answers ---
(function(){
  // Static manifest of bundled sounds
  const TRUE_SOUNDS = [
    'sounds/trues/Am_thanh_Dung_roi_ban_gioi_qua-www_tiengdong_com.mp3',
    'sounds/trues/Am_thanh_lua_chon_Dung-www_tiengdong_com.mp3',
    'sounds/trues/Am_thanh_tra_loi_Dung_chinh_xac-www_tiengdong_com.mp3',
    'sounds/trues/correct_sound_effect-www_tiengdong_com.mp3',
    'sounds/trues/tieng_noi_chuc_mung_giong_nam-www_tiengdong_com.mp3',
    'sounds/trues/tieng_noi_chuc_mung_giong_nu-www_tiengdong_com.mp3'
  ];
  const FALSE_SOUNDS = [
    'sounds/falses/Am_thanh_ban_tra_loi_sai_roi-www_tiengdong_com.mp3',
    'sounds/falses/Am_thanh_khi_chon_nham-www_tiengdong_com.mp3',
    'sounds/falses/Am_thanh_that_vong-www_tiengdong_com.mp3',
    'sounds/falses/Am_thanh_that_vong_phim_hoat_hinh_de_thuong-www_tiengdong_com.mp3',
    'sounds/falses/Am_thanh_tra_loi_sai_wav-www_tiengdong_com.wav',
    'sounds/falses/buzzer_wrong_answer_gaming_sound_effect-www_tiengdong_com.mp3',
    'sounds/falses/nhac_tra_loi_sai-www_tiengdong_com.mp3'
  ];

  let currentAudio = null;

  function pick(arr){
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function stop(){
    try{
      if (currentAudio){
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
    }catch{}
    currentAudio = null;
  }

  function play(type){
    const list = (type === 'true' || type === true || type === 'correct') ? TRUE_SOUNDS : FALSE_SOUNDS;
    const src = pick(list);
    if (!src) return Promise.resolve(false);
    stop();
    return new Promise((resolve) => {
      const a = new Audio(src);
      currentAudio = a;
      a.volume = 0.8;
      a.onended = () => { if (currentAudio === a) currentAudio = null; resolve(true); };
      a.onerror = () => { if (currentAudio === a) currentAudio = null; resolve(false); };
      try { a.play().catch(()=>resolve(false)); } catch { resolve(false); }
    });
  }

  function preload(){
    // light preload: create Audio objects but don't autoplay
    [...TRUE_SOUNDS, ...FALSE_SOUNDS].forEach(src => {
      const a = new Audio(); a.src = src; a.preload = 'auto';
    });
  }

  function isPlaying(){ return !!currentAudio && !currentAudio.paused; }

  window.LE = Object.assign({}, window.LE, {
    sfx: { play, preload, stop, isPlaying }
  });
})();

// --- Optional: Translation helper (via configurable Apps Script) ---
(function(){
  async function translate(text, sl='en', tl='vi'){
    const cfg = (window.LE && LE.loadSheetConfig && LE.loadSheetConfig()) || {};
    const url = cfg.translateUrl;
    const t = (text||'').toString().trim();
    if (!url || !t) return '';
    const body = `text=${encodeURIComponent(t)}&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}`;
    try{
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
      });
      if (!resp.ok) return '';
      const data = await resp.json().catch(()=>null);
      if (data && typeof data.text === 'string') return data.text;
      return '';
    }catch(e){ return ''; }
  }

  window.LE = Object.assign({}, window.LE, { translate });
})();
