// admin.js - Manage dataset creation and persistence

(function(){
  const APP_CFG = (window && window.APP_CONFIG) ? window.APP_CONFIG : {};
  const defsContainer = document.getElementById('defsContainer');
  const examplesContainer = document.getElementById('examplesContainer');
  const btnAddDef = document.getElementById('btnAddDef');
  const btnAddExample = document.getElementById('btnAddExample');
  const wordForm = document.getElementById('wordForm');
  const wordInput = document.getElementById('wordInput');
  const posInput = document.getElementById('posInput');
  const btnReset = document.getElementById('btnReset');
  const datasetInfo = document.getElementById('datasetInfo');
  const datasetList = document.getElementById('datasetList');
  // Sheet sync elements
  // Sheet sync elements
  const sheetCsvUrlEl = document.getElementById('sheetCsvUrl');
  const sheetWriteUrlEl = document.getElementById('sheetWriteUrl');
  const sheetAutoOnLearnEl = document.getElementById('sheetAutoOnLearn');
  const sheetRefreshSecEl = document.getElementById('sheetRefreshSec');
  const sheetTranslateUrlEl = document.getElementById('sheetTranslateUrl');
  const sheetTtsUrlEl = document.getElementById('sheetTtsUrl');
  const btnSheetLoad = document.getElementById('btnSheetLoad');
  const btnSheetSaveCfg = document.getElementById('btnSheetSaveCfg');
  const btnUseThienPreset = document.getElementById('btnUseThienPreset');
  // SRS config elements
  const dailyNewLimitEl = document.getElementById('dailyNewLimit');
  const dailyReviewLimitEl = document.getElementById('dailyReviewLimit');
  const btnSaveSrsCfg = document.getElementById('btnSaveSrsCfg');

  let dataset = [];
  let sheetCfg = LE.loadSheetConfig() || {};
  // Ensure user is set before any sheet operations
  const CURRENT_USER = ensureUserPrompt('thienpahm') || '';
  if (CURRENT_USER) {
    // prefill sheet config defaults for ThienPahm if none
    sheetCfg = sheetCfg || {};
    if (!sheetCfg.writeUrl) sheetCfg.writeUrl = APP_CFG.DEFAULT_WRITE || 'https://script.google.com/macros/s/AKfycbzX08o-y5trCA7-lCw-rLRL369Ctte2kCv_2XqA5htT3f0O5cKWgOFs1J7apbLM6eoNHw/exec';
    if (!sheetCfg.csvUrl) sheetCfg.csvUrl = APP_CFG.DEFAULT_CSV || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTuYF-fncf9PSBfkDPMAv_q4LiYColRiVIpUniAUKuQFLPXqXhMgkYsTmoDr-BCv5aqaqNRAnYx7_TC/pub?output=csv';
  }

  function showToast(msg, type){
    const t = document.createElement('div');
    t.className = `toast ${type||''}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(()=> t.classList.add('show'));
    setTimeout(()=>{
      t.classList.remove('show');
      setTimeout(()=> t.remove(), 300);
    }, 1800);
  }

  function createDefItem(value = ''){
    const wrap = document.createElement('div');
    wrap.className = 'def-item';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'answer-input';
    input.placeholder = 'Nhập mô tả / định nghĩa';
    input.value = value;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn secondary';
    del.textContent = 'X';
    del.title = 'Xóa mô tả này';
    del.addEventListener('click', () => wrap.remove());
    wrap.appendChild(input);
    wrap.appendChild(del);
    return wrap;
  }

  function createExampleItem(value = ''){
    const wrap = document.createElement('div');
    wrap.className = 'def-item example-item';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'answer-input';
    input.placeholder = 'Nhập ví dụ / câu mẫu (English)';
    input.value = value;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn secondary';
    del.textContent = 'X';
    del.title = 'Xóa ví dụ này';
    del.addEventListener('click', () => wrap.remove());
    wrap.appendChild(input);
    wrap.appendChild(del);
    return wrap;
  }

  function ensureOneDef(){
    if (defsContainer.children.length === 0) {
      defsContainer.appendChild(createDefItem());
    }
  }

  function ensureOneExample(){
    if (examplesContainer && examplesContainer.children.length === 0) {
      examplesContainer.appendChild(createExampleItem());
    }
  }

  // Minimal POS label normalization (align with learn/study pages)
  function getPosLabel(item){
    if (!item) return '';
    const keys = ['pos','posTag','type','wordClass','tuloai','class'];
    let raw = '';
    for (const k of keys){
      if (!k) continue;
      if (Object.prototype.hasOwnProperty.call(item, k) && item[k] != null){ raw = String(item[k]).trim(); if (raw) break; }
      for (const pk in item){ if (pk.toLowerCase() === k.toLowerCase() && item[pk] != null){ raw = String(item[pk]).trim(); if (raw) break; } }
      if (raw) break;
    }
    if (!raw) return '';
    const lower = raw.toLowerCase();
    const map = {
      'noun': 'n.', 'n': 'n.', 'n.': 'n.',
      'verb': 'v.', 'v': 'v.', 'v.': 'v.',
      'adjective': 'adj.', 'adj': 'adj.', 'adj.': 'adj.', 'a': 'adj.',
      'adverb': 'adv.', 'adv': 'adv.', 'adv.': 'adv.',
      'pronoun': 'pron.', 'pron': 'pron.',
      'preposition': 'prep.', 'prep': 'prep.',
      'conjunction': 'conj.', 'conj': 'conj.',
      'interjection': 'intj.', 'intj': 'intj.',
      'determiner': 'det.', 'det': 'det.', 'article': 'art.', 'art': 'art.',
      'numeral': 'num.', 'num': 'num.'
    };
    if (map[lower]) return map[lower];
    const tokens = lower.split(/\s|,|;|\//).map(t=>t.trim()).filter(Boolean);
    for (const t of tokens){ if (map[t]) return map[t]; }
    if (lower.length <= 4) return lower.endsWith('.') ? lower : (lower + '.');
    const first = tokens[0] || lower;
    return first.length <= 6 ? (first.endsWith('.') ? first : first + '.') : '';
  }

  async function refreshDatasetSummary(){
    // Show current dataset from Sheet (Sheet is single source of truth)
    dataset = await LE.loadDataset();
    datasetInfo.textContent = `${dataset.length} từ vựng`;
    const datasetCount = document.getElementById('datasetCount');
    if (datasetCount) datasetCount.textContent = `— ${dataset.length} từ`;
    datasetList.innerHTML = '';
    dataset.forEach((item, idx) => {
      const li = document.createElement('li');
      const defs = ((item.meanings && item.meanings.length) ? item.meanings : []).slice(0,2).join(' | ');
      const pos = getPosLabel(item);
      li.textContent = `${idx+1}. ${item.word}${pos?(' ('+pos+')'):''} — ${defs}`;
      datasetList.appendChild(li);
    });
  }

  function loadSheetForm(){
    if (sheetCsvUrlEl) sheetCsvUrlEl.value = sheetCfg.csvUrl || '';
    if (sheetWriteUrlEl) sheetWriteUrlEl.value = sheetCfg.writeUrl || '';
    if (sheetTranslateUrlEl) sheetTranslateUrlEl.value = sheetCfg.translateUrl || '';
    if (sheetTtsUrlEl) sheetTtsUrlEl.value = sheetCfg.ttsUrl || '';
    if (sheetAutoOnLearnEl) sheetAutoOnLearnEl.checked = !!sheetCfg.autoOnLearn;
    if (sheetRefreshSecEl) sheetRefreshSecEl.value = sheetCfg.refreshSec || 120;
    loadSrsConfig();
  }

  btnAddDef.addEventListener('click', () => {
    defsContainer.appendChild(createDefItem());
  });

  btnAddExample?.addEventListener('click', () => {
    if (!examplesContainer) return;
    examplesContainer.appendChild(createExampleItem());
  });

  wordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const word = wordInput.value.trim();
    const posRaw = (posInput?.value || '').trim();
    const defs = Array.from(defsContainer.querySelectorAll('input'))
      .map(i => i.value.trim())
      .filter(Boolean);
    const exs = examplesContainer ? Array.from(examplesContainer.querySelectorAll('input'))
      .map(i => i.value.trim())
      .filter(Boolean) : [];
    if (!word) { alert('Vui lòng nhập từ vựng'); return; }
    if (defs.length === 0) { alert('Vui lòng nhập ít nhất 1 mô tả'); return; }

  // Store canonical fields: `meanings` + `examples` + optional `pos`
  const item = { word, meanings: defs, examples: exs };
    if (posRaw) item.pos = posRaw;

    // Try append to Google Sheet (Sheet is single source of truth)
    (async () => {
      try{
        await tryAppendToSheet(item);
        // After successful append, reload dataset from Sheet and refresh UI
        const sheetData = await getSheetDataset();
        dataset = sheetData || [];
        // refresh list
        await refreshDatasetSummary();
        showToast('Đã lưu từ lên Sheet và cập nhật danh sách', 'success');
      }catch(err){
        console.warn('Append to Sheet failed:', err);
        showToast('Không lưu được lên Sheet. Kiểm tra cấu hình Write URL', 'error');
      }
      // Reset inputs regardless
      wordInput.value = '';
      if (posInput) posInput.value = '';
      defsContainer.innerHTML = '';
      ensureOneDef();
      if (examplesContainer) examplesContainer.innerHTML = '';
      ensureOneExample();
    })();
  });

  btnReset.addEventListener('click', () => {
    wordInput.value = '';
    if (posInput) posInput.value = '';
    defsContainer.innerHTML = '';
    ensureOneDef();
    if (examplesContainer) examplesContainer.innerHTML = '';
    ensureOneExample();
  });

  // Removed: import CSV/JSON on admin page

  // Merge helpers
  function normalizeWord(w){ return (w||'').toString().trim().toLowerCase(); }
  function normalizeDef(d){ return (d||'').toString().trim().toLowerCase(); }
  function toMap(arr){
    const map = new Map();
    (arr||[]).forEach(item => {
      const key = normalizeWord(item.word);
      if (!key) return;
      // prefer new `meanings` field only
      const defs = new Set((item.meanings || []).map(normalizeDef).filter(Boolean));
      if (!map.has(key)) map.set(key, defs);
      else {
        const s = map.get(key); defs.forEach(v => s.add(v));
      }
    });
    return map;
  }

  function fromMap(map){
    const out = [];
    for (const [key, set] of map.entries()){
      out.push({ word: key, meanings: Array.from(set) });
    }
    // sort by word
    out.sort((a,b)=> a.word.localeCompare(b.word));
    return out;
  }

  // Fetch sheet dataset safely
  async function getSheetDataset(){
    const csvUrl = (sheetCfg && sheetCfg.csvUrl) || (sheetCsvUrlEl?.value?.trim());
    if (!csvUrl) return [];
    try{
      return await LE.fetchSheetCSV(csvUrl);
    }catch(err){
      console.warn('Fetch Sheet failed:', err);
      return [];
    }
  }

  // Append deltas to Sheet (no deletion)
  async function pushDeltasToSheet(localMap, sheetMap){
    const writeUrl = (sheetCfg && sheetCfg.writeUrl) || (sheetWriteUrlEl?.value?.trim());
    if (!writeUrl) return; // no write configured
    const rows = [];
    const srsStore = (window.SRS && SRS.loadStore && SRS.loadStore()) || {};
    for (const [word, defs] of localMap.entries()){
      const sdefs = sheetMap.get(word) || new Set();
      const newDefs = Array.from(defs).filter(d => !sdefs.has(d));
      if (newDefs.length){
        const srs = srsStore[word] || srsStore[word.toLowerCase()] || {};
        rows.push(Object.assign({ word, meanings: newDefs }, srs));
      }
    }
    if (rows.length){
      try{
        // Force push to DEFAULT sheet (avoid writing into user's personal sheet)
        let endpoint = writeUrl;
        if (endpoint && endpoint.indexOf('script.google.com') >= 0){
          if (endpoint.indexOf('user=') === -1) endpoint = endpoint + (endpoint.indexOf('?')>=0 ? '&' : '?') + 'user=';
        }
        await LE.appendRowsToSheet(endpoint, rows);
        showToast(`Đồng bộ lên Sheet: +${rows.length} mục`, 'success');
      }catch(err){
        console.warn('Push to Sheet failed:', err);
        showToast('Đồng bộ lên Sheet thất bại', 'error');
      }
    }
  }

  // Full sync: pull from sheet (merge to local) then push new local items to sheet (if write URL configured)
  // Sync button removed: local ↔ sheet bidirectional sync is deprecated.

  // Removed feature: vocab.json -> Sheet one-way sync

  // init
  ensureOneDef();
  ensureOneExample();
  loadSheetForm();
  // If no sheet configured, populate Local Storage from vocab.json once
  (async function bootstrapLocalFromFileIfNeeded(){
    // No local bootstrap from vocab.json: app uses Sheet as source of truth.
    try{
      await refreshDatasetSummary();
    }catch(e){ console.warn('refreshDatasetSummary failed', e); }
  })();

  // Sheet handlers
  btnUseThienPreset?.addEventListener('click', async () => {
    const csv = APP_CFG.DEFAULT_CSV || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTuYF-fncf9PSBfkDPMAv_q4LiYColRiVIpUniAUKuQFLPXqXhMgkYsTmoDr-BCv5aqaqNRAnYx7_TC/pub?output=csv';
  const write = APP_CFG.DEFAULT_WRITE || 'https://script.google.com/macros/s/AKfycbzX08o-y5trCA7-lCw-rLRL369Ctte2kCv_2XqA5htT3f0O5cKWgOFs1J7apbLM6eoNHw/exec';
    if (sheetCsvUrlEl) sheetCsvUrlEl.value = csv;
    if (sheetWriteUrlEl) sheetWriteUrlEl.value = write;
    sheetCfg = {
      csvUrl: csv,
      writeUrl: write,
      autoOnLearn: !!sheetAutoOnLearnEl?.checked,
      refreshSec: Math.max(15, parseInt(sheetRefreshSecEl?.value, 10) || 120),
    };
    LE.saveSheetConfig(sheetCfg);
    showToast('Đã chọn bộ từ và lưu cấu hình Sheet', 'success');
    // Load dataset from the selected sheet and refresh UI
    try{
      await btnSheetLoad?.click();
    }catch(err){ console.warn('Preset load via btnSheetLoad failed', err); }
  });

  btnSheetSaveCfg?.addEventListener('click', () => {
    sheetCfg = {
      csvUrl: sheetCsvUrlEl.value.trim(),
      writeUrl: sheetWriteUrlEl.value.trim(),
      translateUrl: sheetTranslateUrlEl.value.trim(),
      ttsUrl: sheetTtsUrlEl.value.trim(),
      autoOnLearn: !!sheetAutoOnLearnEl.checked,
      refreshSec: Math.max(15, parseInt(sheetRefreshSecEl.value, 10) || 120),
    };
    LE.saveSheetConfig(sheetCfg);
    alert('Đã lưu cấu hình Google Sheet');
  });

  function loadSrsConfig(){
    try{
      const dn = localStorage.getItem('fs_srs_daily_new_limit');
      const dr = localStorage.getItem('fs_srs_daily_review_limit');
      if (dailyNewLimitEl && dn !== null){ dailyNewLimitEl.value = parseInt(dn,10) || 0; }
      if (dailyReviewLimitEl && dr !== null){ dailyReviewLimitEl.value = parseInt(dr,10) || 0; }
    }catch{}
  }
  btnSaveSrsCfg?.addEventListener('click', () => {
    try{
      const dn = Math.max(0, parseInt(dailyNewLimitEl.value,10) || 0);
      const dr = Math.max(0, parseInt(dailyReviewLimitEl.value,10) || 0);
      localStorage.setItem('fs_srs_daily_new_limit', String(dn));
      localStorage.setItem('fs_srs_daily_review_limit', String(dr));
      alert('Đã lưu cài đặt SRS');
    }catch(e){ alert('Không thể lưu SRS: ' + (e.message||e)); }
  });

  btnSheetLoad?.addEventListener('click', async () => {
    try{
      const csvUrl = sheetCsvUrlEl.value.trim();
      if (!csvUrl) { alert('Nhập CSV URL trước'); return; }
  const data = await LE.fetchSheetCSV(csvUrl);
  dataset = data || [];
  await refreshDatasetSummary();
      alert('Đã tải dữ liệu từ Google Sheet');
    }catch(err){
      alert(err.message || 'Không thể tải từ Sheet');
    }
  });

  // Auto-append to Sheet on local add
  async function tryAppendToSheet(newItem){
    const writeUrl = (sheetCfg && sheetCfg.writeUrl) || (sheetWriteUrlEl?.value?.trim());
    if (!writeUrl) return; // not configured
    try{
      // Force write to default sheet (do not attach user param)
      let endpoint = writeUrl;
      if (endpoint && endpoint.indexOf('script.google.com') >= 0){
        if (endpoint.indexOf('user=') === -1) endpoint = endpoint + (endpoint.indexOf('?')>=0 ? '&' : '?') + 'user=';
      }
      const res = await LE.appendRowsToSheet(endpoint, [newItem]);
      if (res && res.mode === 'no-cors') {
        showToast('Đã gửi lên Sheet (no-cors)', 'success');
      } else {
        showToast('Đã gửi lên Sheet', 'success');
      }
    } catch(err){
      console.warn('Append to Sheet failed:', err);
      showToast('Gửi lên Sheet thất bại', 'error');
    }
  }

  // If navigated with #sheet-config, scroll to that section and focus first input
  window.addEventListener('load', () => {
    if (location.hash === '#sheet-config') {
      const section = document.getElementById('sheet-config');
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        document.getElementById('sheetCsvUrl')?.focus();
      }, 300);
    }
  });

  // Excel import/export removed: using Google Sheet (Apps Script) as single source of truth
})();
