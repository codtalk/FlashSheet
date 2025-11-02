// admin.js - Manage dataset creation and persistence

(function(){
  const defsContainer = document.getElementById('defsContainer');
  const btnAddDef = document.getElementById('btnAddDef');
  const wordForm = document.getElementById('wordForm');
  const wordInput = document.getElementById('wordInput');
  const btnReset = document.getElementById('btnReset');
  const btnSync = document.getElementById('btnSync');
  const datasetInfo = document.getElementById('datasetInfo');
  const datasetList = document.getElementById('datasetList');
  // Sheet sync elements
  const sheetCsvUrlEl = document.getElementById('sheetCsvUrl');
  const sheetWriteUrlEl = document.getElementById('sheetWriteUrl');
  const sheetAutoOnLearnEl = document.getElementById('sheetAutoOnLearn');
  const sheetRefreshSecEl = document.getElementById('sheetRefreshSec');
  const btnSheetLoad = document.getElementById('btnSheetLoad');
  const btnSheetSaveCfg = document.getElementById('btnSheetSaveCfg');
  const btnUseThienPreset = document.getElementById('btnUseThienPreset');

  let dataset = [];
  let sheetCfg = LE.loadSheetConfig() || {};

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

  function ensureOneDef(){
    if (defsContainer.children.length === 0) {
      defsContainer.appendChild(createDefItem());
    }
  }

  async function refreshDatasetSummary(){
    // Show current Local Storage dataset so user sees pulled Sheet data
    dataset = await LE.loadDataset();
    datasetInfo.textContent = `${dataset.length} từ vựng`;
    const datasetCount = document.getElementById('datasetCount');
    if (datasetCount) datasetCount.textContent = `— ${dataset.length} từ`;
    datasetList.innerHTML = '';
    dataset.forEach((item, idx) => {
      const li = document.createElement('li');
      const defs = (item.definitions || []).slice(0,2).join(' | ');
      li.textContent = `${idx+1}. ${item.word} — ${defs}`;
      datasetList.appendChild(li);
    });
  }

  function loadSheetForm(){
    if (sheetCsvUrlEl) sheetCsvUrlEl.value = sheetCfg.csvUrl || '';
    if (sheetWriteUrlEl) sheetWriteUrlEl.value = sheetCfg.writeUrl || '';
    if (sheetAutoOnLearnEl) sheetAutoOnLearnEl.checked = !!sheetCfg.autoOnLearn;
    if (sheetRefreshSecEl) sheetRefreshSecEl.value = sheetCfg.refreshSec || 120;
  }

  btnAddDef.addEventListener('click', () => {
    defsContainer.appendChild(createDefItem());
  });

  wordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const word = wordInput.value.trim();
    const defs = Array.from(defsContainer.querySelectorAll('input'))
      .map(i => i.value.trim())
      .filter(Boolean);
    if (!word) { alert('Vui lòng nhập từ vựng'); return; }
    if (defs.length === 0) { alert('Vui lòng nhập ít nhất 1 mô tả'); return; }

    const item = { word, definitions: defs };

    // Merge: if word exists, merge definitions (unique)
    const idx = dataset.findIndex(d => d.word.toLowerCase() === word.toLowerCase());
    if (idx >= 0) {
      const merged = Array.from(new Set([...(dataset[idx].definitions||[]), ...defs]));
      dataset[idx] = { word: dataset[idx].word, definitions: merged };
    } else {
      dataset.push(item);
    }

    LE.saveDatasetToLocal(dataset);
    refreshDatasetSummary();

  // Try auto-append to Google Sheet if configured
  tryAppendToSheet(item);

    // Reset inputs
    wordInput.value = '';
    defsContainer.innerHTML = '';
    ensureOneDef();
  });

  btnReset.addEventListener('click', () => {
    wordInput.value = '';
    defsContainer.innerHTML = '';
    ensureOneDef();
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
      const defs = new Set((item.definitions||[]).map(normalizeDef).filter(Boolean));
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
      out.push({ word: key, definitions: Array.from(set) });
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
    for (const [word, defs] of localMap.entries()){
      const sdefs = sheetMap.get(word) || new Set();
      const newDefs = Array.from(defs).filter(d => !sdefs.has(d));
      if (newDefs.length){
        rows.push({ word, definitions: newDefs });
      }
    }
    if (rows.length){
      try{
        await LE.appendRowsToSheet(writeUrl, rows.map(r => ({ word: r.word, definitions: r.definitions })));
        showToast(`Đồng bộ lên Sheet: +${rows.length} mục`, 'success');
      }catch(err){
        console.warn('Push to Sheet failed:', err);
        showToast('Đồng bộ lên Sheet thất bại', 'error');
      }
    }
  }

  // Full sync: pull from sheet (merge to local) then push new local items to sheet (if write URL configured)
  btnSync?.addEventListener('click', async () => {
    // Pull from sheet
    const sheetData = await getSheetDataset();
    // Prefer Local Storage; if empty, fall back to bundled file so we can push file->sheet
    let localData = await LE.loadDataset();
    if (!Array.isArray(localData) || localData.length === 0) {
      const fileData = await LE.loadDatasetFromFile();
      if (Array.isArray(fileData) && fileData.length) {
        localData = fileData;
        // keep local storage in sync for next time
        LE.saveDatasetToLocal(localData);
      }
    }

    const sheetMap = toMap(sheetData);
    const localMap = toMap(localData);
    // merge both ways into local
    for (const [w, defs] of sheetMap.entries()){
      if (!localMap.has(w)) localMap.set(w, new Set(defs));
      else { const s = localMap.get(w); defs.forEach(d => s.add(d)); }
    }
    const merged = fromMap(localMap);
    LE.saveDatasetToLocal(merged);
    await refreshDatasetSummary();
    showToast(`Tải từ Sheet: +${sheetData.length} (hợp nhất)`, 'success');
    // Push deltas up (local minus sheet) if write URL configured
    const writeUrl = (sheetCfg && sheetCfg.writeUrl) || (sheetWriteUrlEl?.value?.trim());
    if (writeUrl) {
      await pushDeltasToSheet(localMap, sheetMap);
    } else {
      showToast('Chưa cấu hình Write URL — đã đồng bộ về Local, bỏ qua đẩy lên Sheet', 'error');
    }
  });

  // Removed feature: vocab.json -> Sheet one-way sync

  // init
  ensureOneDef();
  loadSheetForm();
  // If no sheet configured, populate Local Storage from vocab.json once
  (async function bootstrapLocalFromFileIfNeeded(){
    try{
      const hasSheet = !!(sheetCfg && sheetCfg.csvUrl);
      const local = await LE.loadDataset();
      if (!hasSheet && (!Array.isArray(local) || local.length === 0)){
        const fileData = await LE.loadDatasetFromFile();
        if (Array.isArray(fileData) && fileData.length){
          LE.saveDatasetToLocal(fileData);
        }
      }
    }catch(e){ console.warn('bootstrapLocalFromFileIfNeeded failed', e); }
    // After potential bootstrap, show summary from file
    refreshDatasetSummary();
  })();

  // Sheet handlers
  btnUseThienPreset?.addEventListener('click', async () => {
    const csv = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTuYF-fncf9PSBfkDPMAv_q4LiYColRiVIpUniAUKuQFLPXqXhMgkYsTmoDr-BCv5aqaqNRAnYx7_TC/pub?output=csv';
    const write = 'https://script.google.com/macros/s/AKfycbwMVuW1ytLKTZID5dnNoHKdp9EoqcEcrzaG3jKl0xelPtYhqNoeuBLi8XlcXBwBhAL4mg/exec';
    if (sheetCsvUrlEl) sheetCsvUrlEl.value = csv;
    if (sheetWriteUrlEl) sheetWriteUrlEl.value = write;
    sheetCfg = {
      csvUrl: csv,
      writeUrl: write,
      autoOnLearn: !!sheetAutoOnLearnEl?.checked,
      refreshSec: Math.max(15, parseInt(sheetRefreshSecEl?.value, 10) || 120),
    };
    LE.saveSheetConfig(sheetCfg);
    showToast('Đã chọn bộ từ của thienpahm và lưu cấu hình', 'success');
    // Tải dữ liệu về Local Storage ngay
    try{
      const data = await LE.fetchSheetCSV(csv);
      dataset = data;
      LE.saveDatasetToLocal(dataset);
      await refreshDatasetSummary();
      showToast('Đã tải bộ từ về Local Storage', 'success');
    }catch(err){
      console.warn('Preset load failed:', err);
      showToast('Không thể tải bộ từ từ Sheet', 'error');
    }
  });

  btnSheetSaveCfg?.addEventListener('click', () => {
    sheetCfg = {
      csvUrl: sheetCsvUrlEl.value.trim(),
      writeUrl: sheetWriteUrlEl.value.trim(),
      autoOnLearn: !!sheetAutoOnLearnEl.checked,
      refreshSec: Math.max(15, parseInt(sheetRefreshSecEl.value, 10) || 120),
    };
    LE.saveSheetConfig(sheetCfg);
    alert('Đã lưu cấu hình Google Sheet');
  });

  btnSheetLoad?.addEventListener('click', async () => {
    try{
      const csvUrl = sheetCsvUrlEl.value.trim();
      if (!csvUrl) { alert('Nhập CSV URL trước'); return; }
      const data = await LE.fetchSheetCSV(csvUrl);
      dataset = data;
      LE.saveDatasetToLocal(dataset);
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
      const res = await LE.appendRowsToSheet(writeUrl, [newItem]);
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
})();
