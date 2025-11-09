// utils.js - shared helpers for LearnEnglish
// Centralized endpoints are loaded from `assets/js/config.js` which sets window.APP_CONFIG
const APP_CFG = (window && window.APP_CONFIG) ? window.APP_CONFIG : {};
const FEEDBACK_URL = APP_CFG.FEEDBACK_URL || '';

// Storage keys
const STORAGE_KEY = 'learnEnglish.dataset.v2';
const SHEET_CFG_KEY = 'learnEnglish.sheetConfig.v2';

// Load dataset: LOCAL-ONLY (do not fallback to file)
// First-run bootstrap should be handled by callers using loadDatasetFromFile() then saveDatasetToLocal()
async function loadDataset() {
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
    const promptName = window.prompt('Nhập tên người dùng (username) để dùng riêng 1 sheet:', defaultName || '');
    if (promptName && promptName.trim()){ saveUser(promptName.trim()); return promptName.trim(); }
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
// 1) word,definitions  (definitions separated by ';' or '|')
// 2) word,def1,def2,def3
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
  let wi = -1, di = -1, ti = -1;
  if (headerHasKnown) {
    wi = header.findIndex(h => WORD_KEYS.includes(h));
    di = header.findIndex(h => DEF_KEYS.includes(h));
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
        // no explicit definitions column: take remaining non-empty, excluding timestamp and word
        defs = cols.filter((_, idx) => idx !== wi && idx !== ti)
                   .map(x => x.trim()).filter(Boolean);
        // also split by ; or |
        if (defs.length === 1) {
          defs = defs[0].split(/;|\|/).map(d => d.trim()).filter(Boolean);
        }
      }
    } else {
      // No recognizable header
      if (cols.length >= 3 && looksLikeDate(cols[0])) {
        // Common pattern from our Apps Script: [Timestamp, Word, Definitions]
        word = cols[1] || '';
        const raw = cols.slice(2).join(';');
        defs = raw.split(/;|\|/).map(d => d.trim()).filter(Boolean);
      } else {
        // fallback: first col as word, rest as definitions
        word = cols[0] || '';
        const raw = cols.slice(1).join(';');
        defs = raw.split(/;|\|/).map(d => d.trim()).filter(Boolean);
      }
    }

    if (word) {
      // Build result object and include any extra columns (SRS fields) when header present
      const rowObj = { word, definitions: defs };
      if (headerHasKnown) {
        for (let j = 0; j < headerRaw.length; j++){
          const key = headerRaw[j];
          if (!key) continue;
          // Skip columns already parsed
          if (j === wi || j === di || j === ti) continue;
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
// Append rows to Apps Script endpoint
// rows: Array<{word, definitions: string[]}>; server decides how to store
async function appendRowsToSheet(endpoint, rows){
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
      if (k === 'definitions') out.definitions = (r.definitions||[]).join('; ');
      else out[k] = r[k];
    }
    // ensure word + definitions exist
    if (!out.word && r.word) out.word = r.word;
    if (!out.definitions && r.definitions) out.definitions = (r.definitions||[]).join('; ');
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
  appendRowsToSheet,
};

// --- Optional: Web Speech (Text-to-Speech) helpers ---
(function(){
  const hasTTS = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let voices = [];
  let ready = false;
  let voicesPromise = null;
  function loadVoices(){
    try{
      voices = window.speechSynthesis?.getVoices?.() || [];
      ready = true;
    }catch{}
  }
  if (hasTTS){
    loadVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
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
    return voices[0] || null;
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
        const onvc = ()=>{ try{ loadVoices(); }catch{} finish(); };
        try{ window.speechSynthesis?.addEventListener?.('voiceschanged', onvc); }catch{}
        setTimeout(()=>{
          try{ window.speechSynthesis?.removeEventListener?.('voiceschanged', onvc); }catch{}
          finish();
        }, timeoutMs);
      });
    }
    try{ await voicesPromise; }catch{}
    return (voices && voices.length) ? true : false;
  }

  function resumeIfPaused(){
    try{
      // Safari sometimes needs resume() to actually output audio
      window.speechSynthesis?.resume?.();
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
      u.onend = () => settle(true);
      u.onerror = () => settle(false);
      // Cancel any ongoing utterances, then speak after a microtask to avoid race conditions in some browsers
      try{ window.speechSynthesis.cancel(); }catch{}
      try{
        setTimeout(() => {
          try{
            resumeIfPaused();
            window.speechSynthesis.speak(u);
            // Fallback timeout: if no end/error after a while, consider failure
            setTimeout(()=> settle(false), Math.max(1200, Math.min(4000, Math.ceil(t.length*80))));
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
        a.onended = ()=> resolve(true);
        a.onerror = ()=> resolve(false);
        // Some browsers require user gesture; assume caller is in click handler.
        try{
          await a.play();
        }catch(err){
          // As a last resort, open the audio in a new tab/window to bypass autoplay/CORS UI blocks
          try{
            const win = window.open(url, '_blank', 'noopener');
            if (win) { resolve(true); return; }
          }catch{}
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
