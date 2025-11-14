// study.js — Simple flip-card viewer for vocabulary
(function(){
  const flipCard = document.getElementById('flipCard');
  const fcIndex = document.getElementById('fcIndex');
  const fcIndexBack = document.getElementById('fcIndexBack');
  const fcWord = document.getElementById('fcWord');
  const fcPos = document.getElementById('fcPos');
  const fcImage = document.getElementById('fcImage');
  const fcDefs = document.getElementById('fcDefs');
  const fcMeaning = document.getElementById('fcMeaning');
  const fcExplain = document.getElementById('fcExplain');
  const btnSpeakWord = document.getElementById('btnSpeakWord');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnShuffleOrder = document.getElementById('btnShuffleOrder');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const btnSlidePrev = document.getElementById('btnSlidePrev');
  const btnSlideNext = document.getElementById('btnSlideNext');
  const btnSelectForPractice = document.getElementById('btnSelectForPractice');
  const transCache = new Map(); // cache inline translations per text

  let fsBackdrop = null;

  let dataset = [];
  let srsSet = new Set(); // words already selected by current user (from srs_user)
  let order = [];
  let cur = 0;
  let touchStartX = null;
  const logPrefix = '[Study/TTS]';
  const TODAY_PLAN_KEY = 'fs_today_plan';
  const DAILY_NEW_LIMIT_KEY = 'fs_srs_daily_new_limit';

  function showToast(msg, kind='error'){
    try{
      let t = document.querySelector('.toast');
      if (!t){
        t = document.createElement('div');
        t.className = 'toast';
        document.body.appendChild(t);
      }
      t.textContent = String(msg||'');
      t.classList.remove('success','error');
      if (kind) t.classList.add(kind);
      // force reflow then show
      void t.offsetWidth;
      t.classList.add('show');
      setTimeout(()=>{ t && t.classList.remove('show'); }, 2200);
    }catch{}
  }

  function containsVietnamese(text){
    return /[ăâđêôơưÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬáàảãạắằẳẵặấầẩẫậĐđÉÈẺẼẸÊẾỀỂỄỆéèẻẽẹếềểễệÍÌỈĨỊíìỉĩịÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢóòỏõọốồổỗộớờởỡợÚÙỦŨỤƯỨỪỬỮỰúùủũụứừửữựÝỲỶỸỴýỳỷỹỵ]/.test((text||''));
  }

  function preferredTranslation(item){
    const defs = Array.isArray(item.meanings) && item.meanings.length ? item.meanings : [];
    if (!defs.length) return '';
    const vn = defs.find(d => containsVietnamese(d));
    if (vn) return vn;
    const firstNonCloze = defs.find(d => !/_{2,}/.test(d));
    return firstNonCloze || defs[0];
  }

  // Return a short normalized POS label (e.g. "n.", "v.", "adj.") if available
  function getPosLabel(item){
    if (!item) return '';
    const keys = ['pos','posTag','type','wordClass','tuloai','class'];
    let raw = '';
    for (const k of keys){
      if (!k) continue;
      if (Object.prototype.hasOwnProperty.call(item, k) && item[k] != null){ raw = String(item[k]).trim(); if (raw) break; }
      // also check case-insensitive property names
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
    // try exact map
    if (map[lower]) return map[lower];
    // try tokenized
    const tokens = lower.split(/\s|,|;|\//).map(t=>t.trim()).filter(Boolean);
    for (const t of tokens){ if (map[t]) return map[t]; }
    // fallback: if short (<=4) return as-is (with a dot)
    if (lower.length <= 4) return lower.endsWith('.') ? lower : (lower + '.');
    // else return original trimmed but shortened to first word
    const first = tokens[0] || lower;
    return first.length <= 6 ? (first.endsWith('.') ? first : first + '.') : '';
  }

  function fillCloze(text, word){
    const w = (word||'').toString();
    if (!text) return '';
    let s = String(text);
    s = s.replace(/_{2,}/g, w);
    s = s.replace(/\{\{?\s*word\s*\}?\}/gi, w);
    s = s.replace(/\[\s*word\s*\]/gi, w);
    return s;
  }

  function exampleSentences(item){
    // Prefer explicit examples field; fallback to English meanings
    const examples = Array.isArray(item.examples) && item.examples.length ? item.examples : (Array.isArray(item.meanings) ? item.meanings : []);
    const eng = examples.filter(d => !containsVietnamese(d));
    const w = item.word || '';
    const filled = eng.map(e => fillCloze(e, w)).filter(Boolean);
    // pick up to 2 examples
    return filled.slice(0,2);
  }

  function imageFromItem(item){
    if (!item) return '';
    if (item.image) return item.image;
    if (Array.isArray(item.images) && item.images.length) return item.images[0];
    return '';
  }

  function updateIndex(){
    const idxText = `${order.length ? (order.indexOf(cur)+1) : 0}/${order.length}`;
    if (fcIndex) fcIndex.textContent = idxText;
    if (fcIndexBack) fcIndexBack.textContent = idxText;
  }

  function render(){
    if (flipCard) flipCard.classList.remove('fading');
    if (!dataset.length){
      fcWord.textContent = 'Chưa có dữ liệu. Vào Nhập dữ liệu để thêm từ.';
      fcDefs.innerHTML = '';
      fcMeaning.textContent = '';
      fcExplain.textContent = '';
      if (fcImage){ fcImage.hidden = true; fcImage.innerHTML = ''; }
      updateIndex();
      return;
    }
    const item = dataset[cur];
    fcWord.textContent = item.word || '';
  // show POS if available
  try{ const p = getPosLabel(item); if (fcPos){ fcPos.textContent = p; fcPos.hidden = !p; } }catch(e){}
    // image
    const img = imageFromItem(item);
    if (img){
      fcImage.hidden = false;
      fcImage.innerHTML = `<img src="${img}" alt="${item.word||''}" />`;
    } else {
      fcImage.hidden = true; fcImage.innerHTML = '';
    }
  // front: list only NON-Vietnamese meanings/examples (không hiển thị nghĩa tiếng Việt)
  const defs = Array.isArray(item.meanings) && item.meanings.length ? item.meanings : [];
    const enDefs = defs.filter(d => !containsVietnamese(d));
    if (enDefs.length){
      // Replace cloze underscores with visible dashes for easier counting
      const conv = (window.LE && LE.clozeToDashes) ? LE.clozeToDashes : (s=>s);
      fcDefs.innerHTML = enDefs.map(d => {
        const txt = conv(d);
        return `<li><span class="line-text">${txt}</span><button class="trans-btn" title="Dịch" aria-label="Dịch dòng này">Dịch</button><div class="inline-trans" hidden></div></li>`;
      }).join('');
    } else {
      fcDefs.innerHTML = `<li class="muted">(Không có định nghĩa tiếng Anh để hiển thị)</li>`;
    }

    // back: translation + explanation (2 example sentences if available)
    const trans = preferredTranslation(item);
    fcMeaning.innerHTML = trans ? `<div class="translation-row"><span class="muted">Dịch:</span> <strong>${trans}</strong></div>` : '';
    const examples = exampleSentences(item);
    if (examples.length){
      fcExplain.innerHTML = `
        <div class="translation-row"><span class="muted">Ví dụ:</span></div>
        <ul class="fc-ex-list">${examples.map(e => `<li><span class="line-text">${e}</span><button class="trans-btn" title="Dịch" aria-label="Dịch câu này">Dịch</button><div class="inline-trans" hidden></div></li>`).join('')}</ul>`;
    } else {
      fcExplain.innerHTML = '';
    }
    updateIndex();
    // update select-for-practice button state
    try{
      const item = dataset[cur];
      const isSelected = (item && (item.selectedForStudy === '1' || item.selectedForStudy === 1 || item.selectedForStudy === true || item.selected === '1' || item.selected === true));
      if (btnSelectForPractice){
        btnSelectForPractice.disabled = !!isSelected;
        btnSelectForPractice.textContent = isSelected ? 'Đã chọn' : 'Học từ này';
      }
    }catch(e){ /* ignore */ }
    // trigger fade animation after content changes
    if (flipCard){
      // force reflow
      void flipCard.offsetWidth;
      flipCard.classList.add('fading');
      setTimeout(()=> flipCard && flipCard.classList.remove('fading'), 220);
    }
  }

  function setIndex(i){
    if (!dataset.length) return;
    if (i < 0) i = 0; if (i >= dataset.length) i = dataset.length - 1;
    cur = i; render();
  }

  function shuffleOrder(){
    order = Array.from({length: dataset.length}, (_,i)=>i);
    order = (window.LE && LE.shuffle) ? LE.shuffle(order) : order.sort(()=>Math.random()-0.5);
    cur = order[0] || 0;
    render();
  }

  function move(delta){
    if (!dataset.length) return;
    const pos = order.indexOf(cur);
    let nextPos = pos + delta;
    if (nextPos < 0) nextPos = order.length - 1;
    if (nextPos >= order.length) nextPos = 0;
    cur = order[nextPos];
    render();
  }

  function flip(){
    if (!flipCard) return;
    const nowFlipped = !flipCard.classList.contains('is-flipped');
    flipCard.classList.toggle('is-flipped');
    flipCard.setAttribute('aria-pressed', nowFlipped ? 'true' : 'false');
  }

  // keyboard
  function onKey(e){
    if (e.key === 'ArrowRight') { move(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { move(-1); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { flip(); e.preventDefault(); }
    else if (e.key === 'Escape') { exitFullscreen(); }
  }

  // fullscreen modal-like
  function enterFullscreen(){
    if (!flipCard || flipCard.classList.contains('fullscreen')) return;
    fsBackdrop = document.createElement('div');
    fsBackdrop.className = 'modal-backdrop fs-backdrop';
    fsBackdrop.addEventListener('click', exitFullscreen);
    document.body.appendChild(fsBackdrop);
    flipCard.classList.add('fullscreen');
    flipCard.focus();
  }
  function exitFullscreen(){
    if (!flipCard || !flipCard.classList.contains('fullscreen')) return;
    flipCard.classList.remove('fullscreen');
    if (fsBackdrop && fsBackdrop.parentNode){ fsBackdrop.parentNode.removeChild(fsBackdrop); }
    fsBackdrop = null;
  }

  async function init(){
    // Ensure username exists
    try{ ensureUserPrompt(''); }catch{}
    // Load shared dataset
    try{ dataset = await LE.loadDefaultDataset(); }
    catch(err){ dataset = []; console.warn('LE.loadDefaultDataset failed', err); }
    if (!Array.isArray(dataset)) dataset = [];
    // Load user's SRS and exclude words already present
    try{
      const srs = await LE.loadDataset();
      srsSet = new Set((Array.isArray(srs)?srs:[]).map(r => String((r && r.word) || '').toLowerCase()).filter(Boolean));
      dataset = dataset.filter(d => !srsSet.has(String(d.word||'').toLowerCase()));
    }catch(e){ console.warn('Exclude words by srs_user failed', e); }
    if (dataset.length === 0){
      // No data available — show helpful message
      fcWord.textContent = 'Chưa có dữ liệu. Vui lòng thêm dữ liệu trong trang Nhập dữ liệu (admin.html).';
      fcDefs.innerHTML = '';
      fcMeaning.textContent = '';
      fcExplain.textContent = '';
      updateIndex();
      return;
    }
    // TTS availability
    try{
      const supported = !!(window.LE && LE.tts && LE.tts.supported && LE.tts.supported());
      console.debug(logPrefix, 'supported =', supported);
      if (btnSpeakWord){ btnSpeakWord.disabled = !supported; btnSpeakWord.hidden = !supported; }
      if (supported){
        try{
          const voices = window.speechSynthesis?.getVoices?.() || [];
          console.debug(logPrefix, 'voices =', voices.length, voices.map(v=>v.lang+':'+v.name));
          if (!voices.length){
            showToast('TTS bật nhưng chưa tải được giọng đọc. Hãy mở bằng Chrome/Safari và thử lại sau 1–2 giây.', 'error');
          }
        }catch(e){ console.debug(logPrefix, 'voices read error', e); }
      }
    }catch{}
    order = Array.from({length: dataset.length}, (_,i)=>i);
    cur = order[0] || 0;
    render();
  }

  // Helper: determine if an item is marked selected for practice
  // No longer rely on selected flags in shared table; selection is per-user in srs_user
  function itemIsSelected(item){
    try{ return !!(item && srsSet.has(String(item.word||'').toLowerCase())); }catch{ return false; }
  }

  // Select current word for practice: mark locally and persist to srs_user (Supabase)
  // Sync daily plan (new words) to Supabase users table
  async function syncDailyPlanToSupabase(newsDone) {
    try {
      const appCfg = (window.APP_CONFIG||{});
      const isSB = appCfg.DATA_SOURCE === 'supabase' && appCfg.SUPABASE_URL && appCfg.SUPABASE_ANON_KEY;
      if (!isSB) return;
      const username = (typeof loadUser === 'function') ? (loadUser() || '') : '';
      if (!username) return;
      const table = appCfg.SUPABASE_USERS_TABLE || 'users';
      const url = `${appCfg.SUPABASE_URL}/rest/v1/${table}?on_conflict=username`;
      const headers = {
        'apikey': appCfg.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${appCfg.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      };
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const ext = [{ username, new_words_today: Number(newsDone||0), new_words_date: todayKey }];
      await fetch(url, { method:'POST', headers, body: JSON.stringify(ext) });
    } catch (err) { /* swallow network/schema errors */ }
  }

  btnSelectForPractice?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!dataset || dataset.length === 0) { showToast('Không có từ để chọn', 'error'); return; }
    const item = dataset[cur];
    if (!item || !item.word) { showToast('Không có từ để chọn', 'error'); return; }
    if (itemIsSelected(item)) { showToast('Từ đã được chọn', 'success'); return; }
    // Mark in-memory set for button state
    try{ srsSet.add(String(item.word).toLowerCase()); }catch{}
    showToast('Đã chọn từ để học. Đang chuyển…', 'success');
    // Immediately hide this card from Study tab and move to next
    try{
      // Remove current item from dataset
      dataset.splice(cur, 1);
      // Rebuild order over remaining items
      order = Array.from({length: dataset.length}, (_,i)=>i);
      // Clamp current index and render next card
      if (dataset.length > 0){
        if (cur >= dataset.length) cur = 0;
        render();
      } else {
        // No items left: clear UI
        fcWord.textContent = 'Đã ẩn tất cả các thẻ đã chọn để học.';
        fcDefs.innerHTML = '';
        fcMeaning.textContent = '';
        fcExplain.textContent = '';
        updateIndex();
      }
    }catch(remErr){ console.warn('Remove & advance failed', remErr); }
    // Best-effort push selection to backend (Supabase srs_user)
    try{
      const appCfg = (window.APP_CONFIG || {});
      const useSupabase = appCfg.DATA_SOURCE === 'supabase' && appCfg.SUPABASE_URL;
      // include SRS fields if available; ensure we create a per-user SRS record immediately
      const srsStore = (window.SRS && SRS.loadStore && SRS.loadStore()) || {};
      const key = (item.word||'').toLowerCase();
      let srs = srsStore[key] || {};
      // Ensure local SRS card exists (in-memory) so buildQueue won't treat it as 'news'
      try{ if (window.SRS && SRS.ensureCard) { SRS.ensureCard(srsStore, item.word); srs = srsStore[key]; } }catch(e){}
      // Ensure flat-case fields for backend
      if (!srs.addedat && !srs.added_at && !srs.addedAt) srs.addedat = Date.now();
  // If reps isn't set, set to 1 so the card is considered 'learned' and eligible for review queue; set due to now
  if (srs.reps === undefined || srs.reps === null) srs.reps = 1;
      if (!srs.due && !srs.due_at && !srs.dueAt) srs.due = Date.now();
  const row = Object.assign({ word: item.word, meanings: (item.meanings || []), examples: (item.examples || []) }, srs);
  // include per-user identifier field 'user' so backend record associates with this user
  try{ const username = (typeof loadUser === 'function') ? (loadUser() || '') : ''; if (username) row.user = username; }catch(e){}
  if (useSupabase){ await LE.appendRowsToSheet('', [row]); }
      // also update local in-memory store if present
      try{ if (window.SRS && SRS.loadStore && SRS.saveStore){ SRS.loadStore()[key] = srs; SRS.saveStore(SRS.loadStore()); } }catch(e){}
    }catch(err){ console.warn('Persist selection failed', err); }
    // Update today's "new words" counter immediately when user opts-in to learn this word
    try{
      const today = todayKey();
      const loadPlan = ()=>{
        try{ const x = JSON.parse(localStorage.getItem(TODAY_PLAN_KEY)||'null');
          if (x && x.date === today){ return {
            date: x.date,
            reviewsDone: Number(x.reviewsDone||0),
            newsDone: Number(x.newsDone||0),
            reviewedSet: new Set(Array.isArray(x.reviewed)?x.reviewed:[]),
            newSet: new Set(Array.isArray(x.newed)?x.newed:[])
          }; }
        }catch{}
        return { date: today, reviewsDone:0, newsDone:0, reviewedSet:new Set(), newSet:new Set() };
      };
      const savePlan = (p)=>{
        try{ localStorage.setItem(TODAY_PLAN_KEY, JSON.stringify({
          date: p.date,
          reviewsDone: Number(p.reviewsDone||0),
          newsDone: Number(p.newsDone||0),
          reviewed: Array.from(p.reviewedSet||[]),
          newed: Array.from(p.newSet||[])
        })); }catch{}
      };
      const plan = loadPlan();
      const wordKey = String(item.word||'').toLowerCase();
      if (wordKey){ plan.newSet.add(wordKey); plan.newsDone = plan.newSet.size; }
      savePlan(plan);
      // Sync lên Supabase
      syncDailyPlanToSupabase(plan.newsDone);
    }catch(err){ /* ignore plan update errors */ }
  // Previously we auto-redirected the user to the practice tab here.
  // Keep the user on the Study page after selecting a word for practice so they can continue browsing.
  // If you want to navigate programmatically, you can uncomment the line below.
  // try{ window.location.href = 'index.html'; }catch(e){}
  });

  // events
  flipCard?.addEventListener('click', flip);
  flipCard?.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' '){ flip(); e.preventDefault(); }
  });
  btnPrev?.addEventListener('click', ()=> move(-1));
  btnNext?.addEventListener('click', ()=> move(1));
  btnShuffleOrder?.addEventListener('click', shuffleOrder);
  btnSpeakWord?.addEventListener('click', async (e)=>{
    e.stopPropagation();
    try{
      const supported = !!(LE && LE.tts && LE.tts.supported && LE.tts.supported());
      console.debug(logPrefix, 'click speak, supported =', supported);
      if (!supported){
        showToast('Trình duyệt không hỗ trợ đọc to (TTS).', 'error');
        return;
      }
      // try to ensure voices ready before speaking (Chrome đôi khi tải chậm)
      try{ await (LE.tts.ensureVoices && LE.tts.ensureVoices(4000)); }catch{}
      const item = dataset[cur];
      const word = (item && item.word) ? String(item.word).trim() : '';
      if (!word) return;
      console.debug(logPrefix, 'speaking:', word);
      let ok = await LE.tts.speak(word, { lang: 'en-US', rate: 0.95 });
      console.debug(logPrefix, 'speak result =', ok);
      if (!ok){
        // Retry once after a short delay (voices có thể vừa được nạp)
        try{ await new Promise(r=>setTimeout(r, 800)); }catch{}
        ok = await LE.tts.speak(word, { lang: 'en-US', rate: 0.95 });
        console.debug(logPrefix, 'retry speak result =', ok);
      }
      if (!ok){
        // Attempt audio-based fallback only if configured
        let ok2 = false;
        try{ ok2 = await (LE.tts.speakViaAudio && LE.tts.speakViaAudio(word, { lang: 'en' })); }catch{}
        console.debug(logPrefix, 'fallback audio result =', ok2);
        if (!ok2){
          showToast('Không phát được âm. Hãy mở bằng Chrome/Safari và thử lại sau vài giây.', 'error');
        }
      }
    }catch(err){
      console.error(logPrefix, 'speak error', err);
      showToast('Lỗi TTS: ' + (err && err.message ? err.message : String(err||'')), 'error');
    }
  });
  btnSlidePrev?.addEventListener('click', (e)=>{ e.stopPropagation(); move(-1); });
  btnSlideNext?.addEventListener('click', (e)=>{ e.stopPropagation(); move(1); });
  btnFullscreen?.addEventListener('click', enterFullscreen);
  document.addEventListener('keydown', onKey);

  // Inline translate: event delegation on definitions and examples
  async function handleTranslateClick(e){
    const btn = e.target && e.target.closest && e.target.closest('.trans-btn');
    if (!btn) return;
    e.stopPropagation(); e.preventDefault();
    const li = btn.closest('li'); if (!li) return;
    const textEl = li.querySelector('.line-text');
    const out = li.querySelector('.inline-trans');
    const raw = (textEl && textEl.textContent) ? textEl.textContent.trim() : '';
    if (!raw) return;
    if (out){ out.hidden = false; out.innerHTML = '<span class="muted">Đang dịch…</span>'; }
    try{
      const key = raw.toLowerCase();
      if (transCache.has(key)){
        const vi = transCache.get(key) || '';
        if (out) out.textContent = vi;
        return;
      }
      if (window.LE && LE.translate){
        const vi = await LE.translate(raw, 'en', 'vi');
        const text = vi || '(Không dịch được)';
        transCache.set(key, text);
        if (out) out.textContent = text;
      } else {
        // Fallback: open Google Translate in new tab
        const url = `https://translate.google.com/?sl=en&tl=vi&text=${encodeURIComponent(raw)}&op=translate`;
        try{ window.open(url, '_blank', 'noopener'); }catch{}
        if (out) out.innerHTML = `<a target="_blank" rel="noopener" href="${url}">Mở Google Dịch</a>`;
      }
    }catch(err){ if (out) out.textContent = '(Lỗi dịch)'; }
  }
  fcDefs?.addEventListener('click', handleTranslateClick);
  fcExplain?.addEventListener('click', handleTranslateClick);

  // touch swipe
  flipCard?.addEventListener('touchstart', (e)=>{
    if (!e.touches || e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
  }, { passive:true });
  flipCard?.addEventListener('touchend', (e)=>{
    if (touchStartX == null) return; const x = (e.changedTouches && e.changedTouches[0].clientX) || 0;
    const dx = x - touchStartX; touchStartX = null;
    const TH = 40; // threshold px
    if (dx > TH) move(-1); else if (dx < -TH) move(1);
  });

  init();
})();
