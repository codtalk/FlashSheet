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
  // (Sheets removed)
  // Supabase tools
  const btnSupabaseCheck = document.getElementById('btnSupabaseCheck');
  // removed: btnSupabaseImport (Sheet import deprecated)
  const supabaseStatus = document.getElementById('supabaseStatus');
  const pasteDataEl = document.getElementById('pasteData');
  const btnSupabasePasteImport = document.getElementById('btnSupabasePasteImport');
  // SRS config elements
  const dailyNewLimitEl = document.getElementById('dailyNewLimit');
  const dailyReviewLimitEl = document.getElementById('dailyReviewLimit');
  const btnSaveSrsCfg = document.getElementById('btnSaveSrsCfg');

  let dataset = [];

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
    // Show current dataset from active source
    // Supabase-only: list words from shared table
    dataset = await LE.loadDefaultDataset();
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

  // (Sheets removed) loadSrsConfig still used.

  function setSupabaseStatus(msg, kind='info'){
    if (!supabaseStatus) return;
    supabaseStatus.textContent = msg || '';
    supabaseStatus.className = 'hint ' + (kind || '');
  }

  function buildSbHeaders(){
    return {
      'apikey': APP_CFG.SUPABASE_ANON_KEY || '',
      'Authorization': `Bearer ${APP_CFG.SUPABASE_ANON_KEY || ''}`,
      'Accept': 'application/json'
    };
  }

  async function supabasePing(){
    const useSupabase = (APP_CFG && APP_CFG.DATA_SOURCE === 'supabase' && APP_CFG.SUPABASE_URL);
    if (!useSupabase){ setSupabaseStatus('Chưa bật chế độ Database (Supabase).', 'warn'); return { ok:false }; }
    const table = APP_CFG.SUPABASE_WORDS_TABLE || 'words_shared';
    const url = `${APP_CFG.SUPABASE_URL}/rest/v1/${table}?select=word&limit=1`;
    try{
      const resp = await fetch(url, { headers: buildSbHeaders(), cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arr = await resp.json().catch(()=>[]);
      console.log('[Supabase] Connected. Sample:', arr);
      setSupabaseStatus('Supabase: Connected', 'success');
      return { ok:true, sample: arr };
    }catch(err){
      console.warn('[Supabase] Connection failed:', err);
      setSupabaseStatus('Supabase: Không kết nối được', 'error');
      return { ok:false, error: err };
    }
  }

  // (Sheets removed) Import from CSV via pasted text is still supported below.

  function parsePastedRows(text){
    const lines = (text || '').split(/\r?\n/).map(l=>l.trim());
    const out = [];
    for (const line of lines){
      if (!line) continue;
      // Skip stray separators
      if (/^;+$/g.test(line)) continue;
      let cols = line.split('\t');
      if (cols.length < 2) {
        // fallback: split on multiple spaces or commas
        cols = line.split(/\s{2,}|,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      }
      if (cols.length < 2) continue;
      const word = String(cols[1]||'').trim();
      if (!word) continue;
      const meaningsRaw = String(cols[3]||'').trim();
      const examplesRaw = String(cols[4]||'').trim();
      const meanings = meaningsRaw ? meaningsRaw.split(';').map(s=>s.replace(/\|/g,'').trim()).filter(Boolean) : [];
      const examples = examplesRaw ? examplesRaw.split(';').map(s=>s.trim()).filter(Boolean) : [];
      out.push({ word, meanings, examples });
    }
    return out;
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

    // Persist to database (Supabase)
    (async () => {
      try{
        await tryAppendToSheet(item);
        // Refresh list from Supabase
        await refreshDatasetSummary();
        showToast('Đã lưu lên Database và cập nhật danh sách', 'success');
      }catch(err){
        console.warn('Append failed:', err);
        showToast('Không lưu được lên Database.', 'error');
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

  // (Sheets removed) getSheetDataset/pushDeltasToSheet deleted.

  // Full sync: pull from sheet (merge to local) then push new local items to sheet (if write URL configured)
  // Sync button removed: local ↔ sheet bidirectional sync is deprecated.

  // Removed feature: vocab.json -> Sheet one-way sync

  // init
  ensureOneDef();
  ensureOneExample();
  loadSrsConfig();
  // If no sheet configured, populate Local Storage from vocab.json once
  (async function bootstrapLocalFromFileIfNeeded(){
    // No local bootstrap from vocab.json: app uses Sheet as source of truth.
    try{
      await refreshDatasetSummary();
    }catch(e){ console.warn('refreshDatasetSummary failed', e); }
    // First-load: check connectivity to Supabase
    try{
      const useSupabase = (APP_CFG && APP_CFG.DATA_SOURCE === 'supabase' && APP_CFG.SUPABASE_URL);
      if (useSupabase){ await supabasePing(); }
    }catch(e){ console.warn('Supabase bootstrap failed', e); }
  })();

  // Sheet handlers removed

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

  // (Sheets removed) btnSheetLoad deleted.

  // Supabase tools handlers
  btnSupabaseCheck?.addEventListener('click', async ()=>{ await supabasePing(); });
  btnSupabasePasteImport?.addEventListener('click', async ()=>{
    try{
      const useSupabase = (APP_CFG && APP_CFG.DATA_SOURCE === 'supabase' && APP_CFG.SUPABASE_URL);
      if (!useSupabase){ alert('Chưa bật chế độ Database (Supabase)'); return; }
      const raw = pasteDataEl?.value || '';
      if (!raw.trim()){ alert('Vui lòng dán dữ liệu vào ô trước'); return; }
      const rows = parsePastedRows(raw);
      if (!rows.length){ alert('Không phân tích được dòng nào hợp lệ'); return; }
      if (!confirm(`Nhập ${rows.length} mục lên Supabase?`)) return;
      const chunks = 200; let done=0, failed=0;
      for (let i=0;i<rows.length;i+=chunks){
        const batch = rows.slice(i,i+chunks);
        setSupabaseStatus(`Đang nhập từ văn bản… ${Math.min(i+chunks, rows.length)}/${rows.length}`);
        // eslint-disable-next-line no-await-in-loop
        try{ await LE.appendRowsToSheet('', batch); done += batch.length; }
        catch(e){ console.warn('Batch upsert failed', e); failed += batch.length; }
      }
      setSupabaseStatus(`Nhập xong: ${done} mục${failed?`, lỗi ${failed}`:''}.`, failed? 'warn' : 'success');
      await refreshDatasetSummary();
    }catch(e){
      console.warn('Paste import failed', e);
      setSupabaseStatus('Nhập từ văn bản thất bại', 'error');
    }
  });

  // Append to database on local add
  async function tryAppendToSheet(newItem){
    try{
      await LE.appendRowsToSheet('', [newItem]);
      showToast('Đã lưu lên Database (Supabase)', 'success');
    } catch(err){
      console.warn('Append failed:', err);
      showToast('Gửi dữ liệu thất bại', 'error');
    }
  }

  // (Sheets removed) hash navigation not needed.

  // Excel import/export removed: using Google Sheet (Apps Script) as single source of truth
})();
