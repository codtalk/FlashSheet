// utils.js - shared helpers for LearnEnglish

// Storage keys
const STORAGE_KEY = 'learnEnglish.dataset.v1';
const SHEET_CFG_KEY = 'learnEnglish.sheetConfig.v1';

// Load dataset: prefer localStorage, else fetch from /data/vocab.json
async function loadDataset() {
  try {
    const ls = localStorage.getItem(STORAGE_KEY);
    if (ls) {
      return JSON.parse(ls);
    }
  } catch (e) {
    console.warn('LocalStorage parse error', e);
  }
  // Fallback: fetch default dataset
  try {
    const resp = await fetch('data/vocab.json', { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();
      return data;
    }
  } catch (e) {
    console.warn('Fetch default dataset failed', e);
  }
  return [];
}

function saveDatasetToLocal(dataset) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
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

    if (word) out.push({ word, definitions: defs });
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
  try{ return JSON.parse(localStorage.getItem(SHEET_CFG_KEY) || '{}'); }catch{ return {}; }
}
async function fetchSheetCSV(url){
  if (!url) throw new Error('Thiếu CSV URL');
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error('Không tải được CSV');
  const text = await resp.text();
  return parseCSVToDataset(text);
}
// Append rows to Apps Script endpoint
// rows: Array<{word, definitions: string[]}>; server decides how to store
async function appendRowsToSheet(endpoint, rows){
  if (!endpoint) throw new Error('Thiếu Apps Script URL');
  const compact = rows.map(r => ({ word: r.word, definitions: (r.definitions||[]).join('; ') }));
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
  appendRowsToSheet,
};
