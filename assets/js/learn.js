// learn.js - Flashcard learning logic

(function(){
  const modeSelect = document.getElementById('modeSelect');
  const btnShuffle = document.getElementById('btnShuffle');
  const card = document.getElementById('card');
  const questionText = document.getElementById('questionText');
  const answerArea = document.getElementById('answerArea');
  const feedback = document.getElementById('feedback');
  const btnNext = document.getElementById('btnNext');
  const qIndex = document.getElementById('qIndex');
  const confettiCanvas = document.getElementById('confettiCanvas');
  const statCorrect = document.getElementById('statCorrect');
  const statWrong = document.getElementById('statWrong');
  // Streak elements
  const streakWidget = document.getElementById('streakWidget');
  const streakCountEl = document.getElementById('streakCount');
  const bestStreakEl = document.getElementById('bestStreak');
  
  const btnResetProgress = document.getElementById('btnResetProgress');
  const btnSendFeedback = document.getElementById('btnSendFeedback');
  const feedbackText = document.getElementById('feedbackText');
  const feedbackUser = document.getElementById('feedbackUser');
  const sheetModal = document.getElementById('sheetModal');
  const btnGoSheetCfg = document.getElementById('btnGoSheetCfg');
  const btnModalClose = document.getElementById('btnModalClose');
  const toggleTTS = document.getElementById('toggleTTS');
  const toggleTrans = document.getElementById('toggleTrans');
  const postAnswer = document.getElementById('postAnswer');
  const translationBox = document.getElementById('translation');
  const btnReplayTTS = document.getElementById('btnReplayTTS');
  const btnTransReadSentence = document.getElementById('btnTransReadSentence');
  const questionPos = document.getElementById('questionPos');
  // Daily plan DOM
  const planDueCountEl = document.getElementById('planDueCount');
  const planNewTargetEl = document.getElementById('planNewTarget');
  const planTotalLeftEl = document.getElementById('planTotalLeft');
  const inpDailyNewLimit = document.getElementById('inpDailyNewLimit');
  const inpDailyReviewLimit = document.getElementById('inpDailyReviewLimit');
  const barReviews = document.getElementById('barReviews');
  const barNews = document.getElementById('barNews');
  const planReviewsDoneEl = document.getElementById('planReviewsDone');
  const planReviewsTotalEl = document.getElementById('planReviewsTotal');
  const planNewsDoneEl = document.getElementById('planNewsDone');
  const planNewTarget2El = document.getElementById('planNewTarget2');

  let dataset = [];
  let queue = []; // array of indices
  let current = -1;
  let correctCount = 0;
  let wrongCount = 0;
  let answered = false;
  let sheetCfg = LE.loadSheetConfig ? (LE.loadSheetConfig() || {}) : {};
  let refreshTimer = null;
  // Removed local persistence for progress: keep ephemeral in-memory only.
  const PROGRESS_KEY = 'fs_progress'; // legacy key (unused)
  let progress = {}; // { [wordKey]: { seen, correct, wrong, lastSeen, streak } } (in-memory)
  const FEEDBACK_BUF_KEY = 'fs_feedback_buffer';
  const FEEDBACK_USER_KEY = 'fs_feedback_user';
  let lastDef = '';
  let lastOriginal = '';
  let lastSource = '';
  const SHEET_PROMPT_KEY = 'fs_sheet_prompt_date';
  const AUTO_TTS_KEY = 'fs_auto_tts';
  const AUTO_TRANS_KEY = 'fs_auto_trans';
  let lastSpeakParts = [];
  let lastSfxPromise = Promise.resolve();
  // SRS store
  let srsStore = {};
  let srsQueue = []; // array of word keys (due first then new)
  // small ring buffer of recently-seen word keys to avoid immediate repeats
  let recentSeen = [];
  const DAILY_NEW_LIMIT_KEY = 'fs_srs_daily_new_limit';
  const DEFAULT_DAILY_NEW_LIMIT = 20;
  const DAILY_REVIEW_LIMIT_KEY = 'fs_srs_daily_review_limit';
  const TODAY_PLAN_KEY = 'fs_today_plan';
  let mustTypeCorrect = false; // require user to type correct answer after a wrong submission
  let correctionWord = '';
  // Streak storage
  const STREAK_KEY = 'fs_streak';

  function loadProgress(){ /* no-op: progress starts empty each session */ progress = {}; }
  function saveProgress(){ /* no-op: persistence removed */ }
  function keyForWord(w){ return (w||'').toString().trim().toLowerCase(); }
  function touchProgress(word){
    const k = keyForWord(word);
    if (!progress[k]) progress[k] = { seen:0, correct:0, wrong:0, lastSeen:0, streak:0 };
    return progress[k];
  }

  function updateStats(){
    statCorrect.textContent = String(correctCount);
    statWrong.textContent = String(wrongCount);
  }

  // --- Streak helpers ---
  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function loadStreak(){
    try{
      const s = JSON.parse(localStorage.getItem(STREAK_KEY)||'null');
      if (s && typeof s === 'object') return s;
    }catch{}
    return { count: 0, best: 0, lastDay: '' };
  }
  function saveStreak(s){
    try{ localStorage.setItem(STREAK_KEY, JSON.stringify(s)); }catch{}
  }
  function updateStreakOnOpen(){
    const s = loadStreak();
    const today = todayKey();
    if (s.lastDay === today){
      renderStreak(s); return;
    }
    // compute if consecutive (yesterday)
    const prev = s.lastDay ? new Date(s.lastDay+'T00:00:00') : null;
    const now = new Date(today+'T00:00:00');
    let inc = 1; // first day becomes 1
    if (prev){
      const diff = Math.round((now - prev) / 86400000);
      if (diff === 1) inc = (s.count||0) + 1; // consecutive
      else inc = 1; // reset streak
    }
    s.count = inc;
    if (!s.best || inc > s.best) s.best = inc;
    s.lastDay = today;
    saveStreak(s);
    renderStreak(s, { pulse: true, celebrate: true });
    // Sync streak to Supabase users table (best-effort)
    try{ syncStreakToSupabase(s); }catch{}
  }
  function renderStreak(s, opts={}){
    try{
      if (streakCountEl) streakCountEl.textContent = String(s.count||0);
      if (bestStreakEl) bestStreakEl.textContent = String(s.best||0);
      if (opts.pulse && streakWidget){
        streakWidget.classList.add('pulse');
        setTimeout(()=> streakWidget && streakWidget.classList.remove('pulse'), 900);
      }
      if (opts.celebrate && confettiCanvas && window.LE && LE.confettiBurst){
        LE.confettiBurst(confettiCanvas);
      }
    }catch{}
  }

  // Push streak to Supabase users table if available
  async function syncStreakToSupabase(streak){
    try{
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
      const nowIso = new Date().toISOString();
      const ext = [{ username, streak_count: Number(streak.count||0), best_streak: Number(streak.best||0), last_active: nowIso }];
      // Try extended payload first; if fails (columns missing), fallback to minimal to at least ensure user exists
      const resp = await fetch(url, { method:'POST', headers, body: JSON.stringify(ext) });
      if (!resp.ok){
        const minimal = [{ username }];
        await fetch(url, { method:'POST', headers, body: JSON.stringify(minimal) }).catch(()=>{});
      }
    }catch(err){ /* swallow network/schema errors */ }
  }

  // Helper: determine if an item is marked selected for practice
  function itemIsSelected(item){
    if (!item) return false;
    try{
      if (item.selectedForStudy === '1' || item.selectedForStudy === 1 || item.selectedForStudy === true) return true;
      if (item.selected === '1' || item.selected === 1 || item.selected === true) return true;
      for (const k in item){
        if (!k) continue;
        if (k.toLowerCase().includes('select')){
          const v = item[k]; if (v === '1' || v === 1 || String(v).toLowerCase() === 'true') return true;
        }
      }
    }catch(e){}
    return false;
  }

  function setQuestion(index){
    if (index == null || index < 0 || !dataset || index >= dataset.length) return;
    current = index;
    const item = dataset[index];
  const meanings = Array.isArray(item.meanings) ? item.meanings : [];
    const examples = Array.isArray(item.examples) ? item.examples : [];
    // Decide whether to show a meaning or an example as the question
    let displayed = '';
    lastOriginal = '';
    lastSource = '';
    if (examples.length > 0 && meanings.length > 0) {
      // randomly choose between meaning and example
      if (Math.random() < 0.5) lastSource = 'meaning'; else lastSource = 'example';
    } else if (examples.length > 0) lastSource = 'example';
    else lastSource = 'meaning';
    if (lastSource === 'meaning'){
      const def = meanings[Math.floor(Math.random()*meanings.length)];
      // For display, replace cloze underscores with visible dashes so user can see how many words are missing
      try{ displayed = (window.LE && LE.clozeToDashes) ? LE.clozeToDashes(def) : def; }catch(e){ displayed = def; }
      lastOriginal = def || '';
    } else {
      // example: mask the target word inside the sentence
      const ex = examples[Math.floor(Math.random()*examples.length)];
      lastOriginal = ex || '';
      // mask occurrences of the word (handle simple plural 's')
      try{
        const w = (item.word||'').toString().trim();
        function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }
        if (w){
          const re = new RegExp('\\b' + escapeRegExp(w) + '(s)?\\b','gi');
          displayed = (ex||'').replace(re, (m)=> '-'.repeat(m.length));
        } else {
          displayed = ex;
        }
      }catch(e){ displayed = ex; }
    }
    questionText.textContent = displayed;
  // show pos if available
  try{ const p = getPosLabel(item); if (questionPos){ questionPos.textContent = p; questionPos.hidden = !p; } }catch(e){}
    lastDef = displayed;
    qIndex.textContent = `${queue.indexOf(index)+1}/${queue.length}`;

    renderAnswerUI(index);
    feedback.textContent = '';
    card.classList.remove('correct','wrong');
    answered = false;
    // reset post-answer area
    if (postAnswer){ postAnswer.hidden = true; }
    if (translationBox){ translationBox.innerHTML = ''; }
    
  }

  function renderAnswerUI(index){
    answerArea.innerHTML = '';
    const mode = getCurrentMode();
    if (mode === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'answer-input';
      input.placeholder = 'Nhập đáp án (từ vựng)';
      input.autofocus = true;
      input.addEventListener('keydown', (e)=>{
        if (e.key === 'Enter') submitText(input.value, index);
      });
      const submit = document.createElement('button');
      submit.className = 'btn primary';
      submit.textContent = 'Nộp';
      submit.addEventListener('click', ()=> submitText(input.value, index));
      answerArea.appendChild(input);
      answerArea.appendChild(submit);
    } else if (mode === 'mc') {
      const choices = LE.buildChoices(dataset, index, Math.min(4, dataset.length));
      choices.forEach((c) => {
        const btn = document.createElement('button');
        btn.className = 'choice';
        btn.textContent = c;
        btn.addEventListener('click', ()=>submitChoice(c, index, btn));
        answerArea.appendChild(btn);
      });
    } else { // mixed
      // 50% text, 50% multiple
      if (Math.random() < 0.5 || dataset.length < 3) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'answer-input';
        input.placeholder = 'Nhập đáp án (từ vựng)';
        input.autofocus = true;
        input.addEventListener('keydown', (e)=>{
          if (e.key === 'Enter') submitText(input.value, index);
        });
        const submit = document.createElement('button');
        submit.className = 'btn primary';
        submit.textContent = 'Nộp';
        submit.addEventListener('click', ()=> submitText(input.value, index));
        answerArea.appendChild(input);
        answerArea.appendChild(submit);
      } else {
        const choices = LE.buildChoices(dataset, index, Math.min(4, dataset.length));
        choices.forEach((c) => {
          const btn = document.createElement('button');
          btn.className = 'choice';
          btn.textContent = c;
          btn.addEventListener('click', ()=>submitChoice(c, index, btn));
          answerArea.appendChild(btn);
        });
      }
    }
  }

  function normalize(s){
    return (s||'').toString().trim().toLowerCase();
  }

  function submitText(value, index){
    if (answered) return;
    // Always trust the current active index set by setQuestion
    let idx = (current != null && current >= 0) ? current : undefined;
    // Fallback to provided index if current is not set (defensive)
    if ((idx == null || idx < 0) && Number.isInteger(index) && index >= 0 && index < (dataset?.length || 0)) idx = index;
    if (idx == null || idx < 0 || !dataset[idx]) return;
    const ok = normalize(value) === normalize(dataset[idx].word);
    handleResult(ok, idx);
  }

  function submitChoice(choice, index, el){
    if (answered) return;
    // Always trust the current active index set by setQuestion
    let idx = (current != null && current >= 0) ? current : undefined;
    // Fallback to provided index if current is not set (defensive)
    if ((idx == null || idx < 0) && Number.isInteger(index) && index >= 0 && index < (dataset?.length || 0)) idx = index;
    if (idx == null || idx < 0 || !dataset[idx]) return;
    const ok = normalize(choice) === normalize(dataset[idx].word);
    handleResult(ok, idx, el);
  }

  function handleResult(ok, index, choiceEl){
    if (answered) return;
    // update per-word progress
    const item = dataset[index];
    const p = touchProgress(item.word);
    p.seen += 1; p.lastSeen = Date.now();
    if (ok) { p.correct += 1; p.streak = (p.streak||0) + 1; }
    else { p.wrong += 1; p.streak = 0; }
    saveProgress();

    if (ok) {
      correctCount++;
      feedback.textContent = 'Chính xác!';
      card.classList.add('correct');
      LE.confettiBurst(confettiCanvas);
      if (choiceEl) choiceEl.classList.add('correct');
      mustTypeCorrect = false; correctionWord = '';
      // re-enable Next button if it was disabled due to correction
      if (btnNext) btnNext.disabled = false;
    } else {
      wrongCount++;
      const ans = dataset[index].word;
      feedback.textContent = `Sai rồi. Đáp án: ${ans}. Hãy gõ lại chính xác để tiếp tục.`;
      card.classList.add('wrong');
      if (choiceEl) choiceEl.classList.add('wrong');
      // Force user to type the correct answer before proceeding
      mustTypeCorrect = true; correctionWord = ans;
      if (btnNext) btnNext.disabled = true;
    }
    updateStats();
    answered = true;
    // disable inputs
    answerArea.querySelectorAll('input,button.choice,.btn.primary').forEach(el => {
      el.disabled = true;
    });

    // If the answer was wrong, render the correction input AFTER disabling the
    // existing answer controls so the correction input stays enabled and focusable.
    if (!ok){ try{ renderCorrectionInput(dataset[index].word); }catch{} }

    // Play SFX feedback
    try{
      if (window.LE && LE.sfx && LE.sfx.play){
        lastSfxPromise = LE.sfx.play(ok ? 'true' : 'false');
      }
    }catch{}

    // Post-answer: read aloud and show translation
    try{ doPostAnswer(item, ok); }catch{}
    // Auto-schedule SRS based on result (no manual quality selection)
    try{ autoSchedule(item, ok, p); }catch{}
  }

  // Show a small input box to force the correct answer after a wrong attempt
  function renderCorrectionInput(answer){
    if (!answerArea) return;
    // Remove existing correction box if any
    const old = document.getElementById('correctionBox');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const box = document.createElement('div');
    box.id = 'correctionBox';
    box.className = 'correction-box';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'answer-input';
    input.placeholder = 'Gõ lại đáp án đúng để tiếp tục';
    const btn = document.createElement('button');
    btn.className = 'btn secondary';
    btn.textContent = 'Xác nhận';
    const check = ()=>{
      const ok = normalize(input.value) === normalize(answer);
      if (ok){
        mustTypeCorrect = false; correctionWord = '';
        // visually acknowledge
        box.innerHTML = '<div class="hint">Đã nhập đúng. Bạn có thể tiếp tục.</div>';
        if (btnNext) btnNext.disabled = false;
      } else {
        // keep disabled
        if (btnNext) btnNext.disabled = true;
      }
    };
    input.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ check(); }});
    btn.addEventListener('click', check);
    box.appendChild(input); box.appendChild(btn);
    answerArea.appendChild(box);
    // focus for convenience
    try{ input.focus(); }catch{}
  }
  
  // Auto-schedule SRS after each answer (no manual quality selection)
  function autoSchedule(item, ok, progressEntry){
    if (!item || !window.SRS) return;
    const wordKey = keyForWord(item.word);
    const card = SRS.ensureCard(srsStore, item.word);
    if (!card) return;
    // Heuristic for mapping result -> quality
    // If correct: boost quality depending on recent streak
    // If incorrect: schedule again or hard depending on whether it's first encounter
    let quality = 4; // default Good
    try{
      const streak = (progressEntry && progressEntry.streak) ? progressEntry.streak : 0;
      if (ok){
        if (streak >= 3) quality = 5; // Easy if long streak
        else if (streak === 0) quality = 4; // first correct -> Good
        else quality = 4; // modest boost
      } else {
        // incorrect
        const seen = (progressEntry && progressEntry.seen) ? progressEntry.seen : 0;
        if (seen <= 1) quality = 0; // Again for brand-new items
        else quality = 2; // Hard otherwise
      }
    }catch(e){ quality = ok ? 4 : 0; }

    try{
      SRS.schedule(card, quality);
      srsStore[keyForWord(item.word)] = card;
      SRS.saveStore(srsStore);
    }catch(e){ console.warn('SRS schedule failed', e); }

    // Best-effort: push SRS update so other devices can pick it up (Supabase or Sheet)
    try{
      const appCfg = (window.APP_CONFIG || {});
      const useSupabase = appCfg.DATA_SOURCE === 'supabase' && appCfg.SUPABASE_URL;
      const writeUrl = (sheetCfg && sheetCfg.writeUrl) || '';
      if ((useSupabase || writeUrl) && window.LE && LE.appendRowsToSheet){
        // Send flat-case keys to match your srs_user schema (addedat, lastreview)
        LE.appendRowsToSheet(writeUrl, [{
          word: item.word,
          meanings: (item.meanings || []),
          examples: (item.examples || []),
          addedat: card.addedAt,
          reps: card.reps,
          lapses: card.lapses,
          ease: card.ease,
          interval: card.interval,
          due: card.due,
          lastreview: card.lastReview,
        }]).catch(()=>{});
      }
    }catch(e){ /* ignore */ }
    // NOTE: do NOT auto-advance to the next card here. Keep the user on the current card
    // so they can review the answer, replay TTS, or inspect the translation before moving.
    // advanceSRSQueue();
  }

  function buildSRSQueue(){
    if (!(window.SRS)) return [];
    const now = Date.now();
    // Chỉ lấy thẻ đã học (reps > 0) và đến hạn (due <= bây giờ)
    const hasSelection = dataset.some(itemIsSelected);
    const practiceDataset = (hasSelection ? dataset.filter(d => itemIsSelected(d)) : dataset) || [];
    // Include any card that has a due timestamp <= now so that newly-selected words (with due set)
    // are included for practice even if reps === 0. This prevents new words from being skipped
    // when we set due=now on selection while avoiding artificially bumping their reps.
    srsQueue = practiceDataset.filter(card => ((Number(card.due) || 0) <= now));
  }

  function advanceSRSQueue(){
    // remove current word key
    const currentWord = (current >=0 && dataset[current]) ? keyForWord(dataset[current].word) : null;
    if (currentWord){
      // srsQueue contains card objects; remove entries whose word matches currentWord
      srsQueue = srsQueue.filter(k => {
        try{ return keyForWord(k.word) !== currentWord; }catch(e){ return true; }
      });
    }
    // Rebuild queue to include any newly due cards (e.g., Again after 10m) but skip immediate if due not yet passed
    buildSRSQueue();
    // pick next by mapping word key to dataset index
    // First try to avoid recently-seen words to reduce repeats
    for (const wk of srsQueue){
      try{
        const wkKey = keyForWord(wk && wk.word ? wk.word : wk);
        if (recentSeen.indexOf(wkKey) >= 0) continue;
        const idx = dataset.findIndex(d => keyForWord(d.word) === wkKey);
        if (idx >= 0){ current = idx; // push into recentSeen ring buffer
          recentSeen.push(wkKey); if (recentSeen.length > 5) recentSeen.shift();
          setQuestion(idx); return; }
      }catch(e){ /* ignore malformed wk */ }
    }
    // If all candidates were recently seen or skipped, allow any due card
    for (const wk of srsQueue){
      try{
        const wkKey = keyForWord(wk && wk.word ? wk.word : wk);
        const idx = dataset.findIndex(d => keyForWord(d.word) === wkKey);
        if (idx >= 0){ current = idx; recentSeen.push(wkKey); if (recentSeen.length > 5) recentSeen.shift(); setQuestion(idx); return; }
      }catch(e){ /* ignore malformed wk */ }
    }
    // fallback: use weight-based selection
    nextQuestion();
  }

  function containsVietnamese(text){
    // basic check for Vietnamese diacritics
    return /[ăâđêôơưÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬáàảãạắằẳẵặấầẩẫậĐđÉÈẺẼẸÊẾỀỂỄỆéèẻẽẹếềểễệÍÌỈĨỊíìỉĩịÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢóòỏõọốồổỗộớờởỡợÚÙỦŨỤƯỨỪỬỮỰúùủũụứừửữựÝỲỶỸỴýỳỷỹỵ]/.test((text||''));
  }

  function isEnglish(text){
    const t = (text||'').toString();
    return !containsVietnamese(t) && /[A-Za-z]/.test(t);
  }

  // Return a short normalized POS label (e.g. "n.", "v.", "adj.") if available
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

  function buildFilledSentence(item){
    const q = (lastOriginal || lastDef || '').toString();
    if (!q || !isEnglish(q)) return '';
    const w = (item && item.word) ? String(item.word) : '';
    if (!w) return q;
    // Replace common cloze patterns with the answer
    let s = q;
    s = s.replace(/_{2,}/g, w);        // ____ or ___
    s = s.replace(/\{\{?\s*word\s*\}?\}/gi, w); // {{word}} or {word}
    s = s.replace(/\[\s*word\s*\]/gi, w);        // [word]
    return s;
  }

  function getPreferredTranslation(item){
  const defs = Array.isArray(item.meanings) && item.meanings.length ? item.meanings : [];
    if (!defs.length) return '';
    // Prefer: first def that looks Vietnamese
    const vn = defs.find(d => containsVietnamese(d));
    if (vn) return vn;
  // Next: the first meaning if it's not a cloze with ____
  const firstNonCloze = defs.find(d => !/_{2,}/.test(d));
    return firstNonCloze || defs[0];
  }

  function renderPostAnswer(item){
    if (!postAnswer) return;
    const showTrans = !!(toggleTrans?.checked);
    const trans = getPreferredTranslation(item);
    let shown = false;
    // Determine availability of sentence-read button
    const ttsSupported = !!(window.LE && LE.tts && LE.tts.supported && LE.tts.supported());
    const englishQ = isEnglish(lastOriginal || lastDef);
    const canSentence = !!(btnTransReadSentence && ttsSupported && englishQ);
    if (btnTransReadSentence){
      btnTransReadSentence.hidden = !canSentence;
      btnTransReadSentence.disabled = !canSentence;
    }
    if (translationBox){
      if (showTrans && trans){
        translationBox.innerHTML = `
          <div class="translation-row"><span class="muted">Từ:</span> <strong>${item.word}</strong></div>
          <div class="translation-row"><span class="muted">Dịch:</span> <span>${trans}</span></div>
          <div class="translation-links">
            <a class="nav-btn secondary" target="_blank" rel="noopener" href="https://translate.google.com/?sl=en&tl=vi&text=${encodeURIComponent(item.word)}&op=translate">Dịch trên Google</a>
            <a class="nav-btn secondary" target="_blank" rel="noopener" href="https://youglish.com/search/${encodeURIComponent(item.word)}/english">Phát âm (YouGlish)</a>
          </div>`;
        shown = true;
      } else {
        translationBox.innerHTML = '';
      }
    }
    postAnswer.hidden = !shown && !(btnReplayTTS && !btnReplayTTS.disabled) && !canSentence;
  }

  async function doPostAnswer(item, ok){
    // Build speak parts
    lastSpeakParts = [];
    if (item && item.word){
      lastSpeakParts.push({ text: item.word, lang: 'en-US', rate: 0.95 });
    }
    // Do NOT read Vietnamese translation

    // Render UI
    renderPostAnswer(item);

    // Auto TTS if enabled and supported
    const canSpeak = !!(window.LE && LE.tts && LE.tts.supported && LE.tts.supported());
    if (btnReplayTTS){ btnReplayTTS.disabled = !canSpeak; }
    if (canSpeak && toggleTTS?.checked && lastSpeakParts.length){
      // Wait for SFX to finish (best-effort) then speak English only
      try{ await lastSfxPromise; }catch{}
      LE.tts.chainSpeak(lastSpeakParts);
    }
    if (postAnswer && (!postAnswer.hidden)){
      // nothing else
    }
  }

  function computeWeights(){
    const now = Date.now();
    const FIFTEEN_MIN = 15 * 60 * 1000;
    const hasSelection = dataset.some(itemIsSelected);
    return dataset.map((item, idx) => {
      // If user has explicitly selected some words, skip unselected ones
      if (hasSelection && !itemIsSelected(item)) return 0.0;
      const k = keyForWord(item.word);
      const p = progress[k] || { seen:0, correct:0, wrong:0, lastSeen:0, streak:0 };
      let w = 1;
      if (p.seen === 0) w += 2; // ưu tiên từ mới vừa phải
      w += (p.wrong || 0) * 3;  // sai nhiều → ưu tiên hơn
      const since = p.lastSeen ? (now - p.lastSeen) : Number.MAX_SAFE_INTEGER;
      w += Math.min(10, Math.max(0, since / FIFTEEN_MIN)); // càng lâu không gặp → càng tăng trọng số (giới hạn 10)
      w -= Math.min(3, p.streak || 0); // đúng liên tiếp → giảm trọng số nhẹ
      if (idx === current) w *= 0.2; // hạn chế lặp lại ngay lập tức
      return Math.max(0.1, w);
    });
  }

  function pickNextIndex(){
    if (!dataset.length) return -1;
    const weights = computeWeights();
    const hasSelection = dataset.some(itemIsSelected);
    // If selection exists, only pick among selected indices
    if (hasSelection){
      const allowed = weights.map((w,i) => (itemIsSelected(dataset[i]) ? w : 0));
      const total = allowed.reduce((a,b)=>a+b,0);
      if (!isFinite(total) || total <= 0){
        // fallback: pick any selected index uniformly
        const selIdx = dataset.map((d,i)=> itemIsSelected(d) ? i : -1).filter(i=>i>=0);
        if (!selIdx.length) return -1;
        return selIdx[Math.floor(Math.random()*selIdx.length)];
      }
      let r = Math.random() * total;
      for (let i=0;i<allowed.length;i++){
        if ((r -= allowed[i]) <= 0) return i;
      }
      return Math.floor(Math.random()*dataset.length);
    }
    // Default: pick among all
    let total = weights.reduce((a,b)=>a+b,0);
    if (!isFinite(total) || total <= 0) return Math.floor(Math.random()*dataset.length);
    let r = Math.random() * total;
    for (let i=0;i<weights.length;i++){
      if ((r -= weights[i]) <= 0) return i;
    }
    return Math.floor(Math.random()*dataset.length);
  }

  function nextQuestion(){
    if (!dataset.length) return;
    // Luôn rebuild SRS queue trước khi chọn câu hỏi
    buildSRSQueue();
    if (srsQueue && srsQueue.length){
      // Chỉ lấy thẻ đến hạn ôn lại
      const idx = dataset.findIndex(d => keyForWord(d.word) === keyForWord(srsQueue[0].word));
      if (idx >= 0){ current = idx; setQuestion(idx); return; }
    }
    // Không còn thẻ đến hạn ôn lại
    try{
      questionText.textContent = 'Hôm nay bạn đã hoàn thành hết các thẻ cần ôn lại!';
      qIndex.textContent = '0/0';
      if (btnNext) btnNext.disabled = true;
    }catch{}
  }

  function reshuffle(){
    queue = LE.shuffle(dataset.map((_, idx) => idx));
    // không dùng tuần tự nữa, nhưng giữ queue để hiển thị tổng số
    current = -1;
    nextQuestion();
  }

  function getCurrentMode(){
    return modeSelect.value;
  }

  btnShuffle.addEventListener('click', reshuffle);
  btnNext.addEventListener('click', () => {
    // Do not allow advancing until user typed the correct answer after a wrong attempt
    if (mustTypeCorrect){
      // gentle nudge: shake feedback
      try{ card.classList.remove('wrong'); void card.offsetWidth; card.classList.add('wrong'); }catch{}
      return;
    }
    // Update daily counters for the current card before moving on
    try{ tallyTodayForCurrent(); }catch{}
    // If using SRS queue, advance it properly to avoid repeating the same word
    if (srsQueue && srsQueue.length) return advanceSRSQueue();
    // Fallback to weight-based next
    return nextQuestion();
  });
  modeSelect.addEventListener('change', () => {
    const idx = (current != null && current >= 0 && dataset[current]) ? current : 0;
    if (dataset && dataset.length) setQuestion(idx);
  });
  // Removed: reload from file and import JSON/CSV on learn page

  function loadFeedbackBuffer(){
    try{ return JSON.parse(localStorage.getItem(FEEDBACK_BUF_KEY)||'[]') || []; }catch{ return []; }
  }
  function saveFeedbackBuffer(buf){
    try{ localStorage.setItem(FEEDBACK_BUF_KEY, JSON.stringify(buf||[])); }catch{}
  }
  async function flushFeedbackBuffer(){
    const appCfg = (window.APP_CONFIG || {});
    const useSupabase = appCfg.DATA_SOURCE === 'supabase' && !!appCfg.SUPABASE_URL;
    const central = LE && LE.FEEDBACK_URL;
    const buf = loadFeedbackBuffer();
    if (!buf.length) return;
    try{
      const rows = buf.map(item => {
        if (typeof item === 'string') return { type:'feedback', message: item, ctx:'', user:'' };
        return { type:'feedback', message: item.message||'', ctx:item.ctx||'', user:item.user||'' };
      });
      // In Supabase mode, endpoint is ignored; pass empty string safely
      await LE.appendRowsToSheet(useSupabase ? '' : central, rows);
      saveFeedbackBuffer([]);
    }catch(err){ /* keep buffer */ }
  }

  btnSendFeedback?.addEventListener('click', async () => {
    const msg = (feedbackText?.value || '').trim();
    if (!msg) { alert('Vui lòng nhập nội dung góp ý'); return; }
    const ctxWord = (current >= 0 && dataset[current]) ? dataset[current].word : '';
    const ctx = ctxWord ? ` | ctx: word=${ctxWord}` : '';
    const name = (feedbackUser?.value || '').trim();
    const full = `${msg}${ctx}`;
    const appCfg = (window.APP_CONFIG || {});
    const useSupabase = appCfg.DATA_SOURCE === 'supabase' && !!appCfg.SUPABASE_URL;
    const central = LE && LE.FEEDBACK_URL;
    try{
      // Prefer Supabase table if configured; fall back to central endpoint if present
      await LE.appendRowsToSheet(useSupabase ? '' : central, [{ type:'feedback', message: full, ctx:'', user:name }]);
      feedbackText.value = '';
      alert('Đã gửi góp ý. Cám ơn bạn!');
    }catch(err){
      const buf = loadFeedbackBuffer(); buf.push({ message: full, ctx:'', user:name }); saveFeedbackBuffer(buf);
      alert('Không gửi được góp ý, đã lưu tạm và sẽ gửi lại sau.');
    }
  });

  btnResetProgress?.addEventListener('click', () => {
    if (confirm('Xoá tiến độ học (thống kê phiên này)?')){
      // Clear in-memory only
      loadProgress();
      correctCount = 0; wrongCount = 0; updateStats();
      if (current >= 0) setQuestion(current); else nextQuestion();
      alert('Đã xoá tiến độ tạm thời (không lưu local).');
    }
  });

  async function init(){
    // Ensure username exists on first visit and upsert to users table
    try{ ensureUserPrompt(''); }catch{}
    loadProgress();
    // Update & render streak on app open
    try{ updateStreakOnOpen(); }catch{}
    // Do not prompt for username here to avoid blocking page load on some browsers
    // Load toggles from localStorage
    try{
      const tts = localStorage.getItem(AUTO_TTS_KEY); if (toggleTTS && tts !== null) toggleTTS.checked = tts === '1';
      const trn = localStorage.getItem(AUTO_TRANS_KEY); if (toggleTrans && trn !== null) toggleTrans.checked = trn === '1';
    }catch{}
    // Feature availability: TTS
    const ttsSupported = !!(window.LE && LE.tts && LE.tts.supported && LE.tts.supported());
    if (btnReplayTTS){ btnReplayTTS.disabled = !ttsSupported; }
    if (toggleTTS && !ttsSupported){
      toggleTTS.checked = false;
      toggleTTS.disabled = true;
      toggleTTS.parentElement?.setAttribute('title','Trình duyệt không hỗ trợ đọc to');
    }
    // Preload sound effects for snappy feedback
    try{ if (LE && LE.sfx && LE.sfx.preload) LE.sfx.preload(); }catch{}
    // Persist toggles
    toggleTTS?.addEventListener('change', ()=>{
      try{ localStorage.setItem(AUTO_TTS_KEY, toggleTTS.checked ? '1':'0'); }catch{}
    });
    toggleTrans?.addEventListener('change', ()=>{
      try{ localStorage.setItem(AUTO_TRANS_KEY, toggleTrans.checked ? '1':'0'); }catch{}
      // re-render post answer for current item if answered
      if (answered && current >= 0) renderPostAnswer(dataset[current]);
    });
    btnReplayTTS?.addEventListener('click', async ()=>{
      try{
        if (!(LE && LE.tts && LE.tts.supported && LE.tts.supported())) return;
        const item = (current >= 0 && dataset[current]) ? dataset[current] : null;
        const word = (item && item.word) ? String(item.word).trim() : '';
        if (!word) return;
        try{ await lastSfxPromise; }catch{}
        LE.tts.chainSpeak([{ text: word, lang: 'en-US', rate: 0.95 }]);
      }catch{}
    });
    btnTransReadSentence?.addEventListener('click', async ()=>{
      try{
        const item = (current >= 0 && dataset[current]) ? dataset[current] : null;
        const sentence = buildFilledSentence(item).trim();
        if (!sentence || !isEnglish(sentence)) return;
        // Wait for SFX to finish then speak the full English sentence
        try{ await lastSfxPromise; }catch{}
        if (LE && LE.tts && LE.tts.supported && LE.tts.supported()){
          await LE.tts.speak(sentence, { lang:'en-US', rate: 0.98 });
        }
        // Inline display: full sentence and translation
        if (translationBox){
          const showTrans = !!(toggleTrans?.checked);
          const transRef = getPreferredTranslation(item);
          // Avoid duplicating the full sentence row by tagging it
          const markerAttr = 'data-full-sentence';
          const transMarkerAttr = 'data-full-sentence-trans';
          const hasRow = translationBox.querySelector(`[${markerAttr}="1"]`);
          const parts = [];
          parts.push(`<div class=\"translation-row\" ${markerAttr}=\"1\"><span class=\"muted\">Câu đầy đủ:</span> <span>${sentence}</span></div>`);
          // Placeholder row for sentence translation (will update below)
          if (showTrans){
            parts.push(`<div class=\"translation-row\" ${transMarkerAttr}=\"1\"><span class=\"muted\">Dịch câu:</span> <span>Đang dịch…</span></div>`);
          }
          // Also keep reference word translation if any
          if (showTrans && transRef){
            parts.push(`<div class=\"translation-row\"><span class=\"muted\">Dịch (tham khảo từ):</span> <span>${transRef}</span></div>`);
          }
          if (hasRow){
            // Replace existing full-sentence block
            // Simple approach: rebuild content keeping existing links if any
            const links = translationBox.querySelector('.translation-links');
            const linksHTML = links ? links.outerHTML : '';
            translationBox.innerHTML = `${parts.join('')}${linksHTML}`;
          } else {
            // Append below any existing content
            translationBox.innerHTML = `${parts.join('')}${translationBox.innerHTML}`;
          }
          if (postAnswer){ postAnswer.hidden = false; }
          // Try live translation via LE.translate if configured
          if (showTrans && window.LE && LE.translate){
            try{
              const vi = await LE.translate(sentence, 'en', 'vi');
              const row = translationBox.querySelector(`[${transMarkerAttr}=\"1\"] span:last-child`);
              if (row){ row.textContent = vi || '(Không dịch được)'; }
            }catch{}
          }
        }
      }catch{}
    });
    // load stored feedback user name if any
    try{
      const savedName = localStorage.getItem(FEEDBACK_USER_KEY) || '';
      if (feedbackUser && savedName) feedbackUser.value = savedName;
      feedbackUser?.addEventListener('change', ()=>{
        try{ localStorage.setItem(FEEDBACK_USER_KEY, (feedbackUser.value||'').trim()); }catch{}
      });
    }catch{}
    // Helper: timeout wrapper so we don't hang forever on network issues
    const withTimeout = (p, ms=7000) => new Promise((resolve, reject)=>{
      let done = false;
      const t = setTimeout(()=>{ if (!done){ done=true; reject(new Error('timeout')); } }, ms);
      p.then(v=>{ if (!done){ done=true; clearTimeout(t); resolve(v); }}).catch(e=>{ if (!done){ done=true; clearTimeout(t); reject(e); }});
    });
    // Load dataset for PRACTICE from per-user SRS (srs_user), then map details from words_shared
    // This ensures luyện tập chỉ lấy các từ đã chọn (có trong srs_user)
    try{
      const perUser = await withTimeout(LE.loadDataset(), 7000).catch(()=>[]); // srs_user rows for current user
      const shared = await withTimeout(LE.loadDefaultDataset(), 7000).catch(()=>[]); // words_shared
      const byWord = new Map();
      (Array.isArray(shared) ? shared : []).forEach(w => {
        const key = (w && w.word) ? w.word.toString().trim().toLowerCase() : '';
        if (key) byWord.set(key, w);
      });
      const joined = [];
      (Array.isArray(perUser) ? perUser : []).forEach(u => {
        const key = (u && u.word) ? u.word.toString().trim().toLowerCase() : '';
        if (!key) return;
        const base = byWord.get(key) || { word: u.word, meanings: [], examples: [], pos: '' };
        // Normalize SRS fields: map flat-case to camel expected by SRS engine
        const addedAt = (u.addedAt != null) ? u.addedAt : (u.added_at != null ? u.added_at : (u.addedat != null ? u.addedat : null));
        const lastReview = (u.lastReview != null) ? u.lastReview : (u.last_review != null ? u.last_review : (u.lastreview != null ? u.lastreview : null));
        const row = Object.assign({}, base, {
          // Ensure canonical camel fields present for in-memory scheduling
          addedAt: addedAt,
          lastReview: lastReview,
          reps: (u.reps != null ? Number(u.reps) : null),
          lapses: (u.lapses != null ? Number(u.lapses) : null),
          ease: (u.ease != null ? Number(u.ease) : null),
          interval: (u.interval != null ? Number(u.interval) : null),
          due: (u.due != null ? Number(u.due) : null)
        });
        joined.push(row);
      });
      dataset = joined;
    }catch(err){ dataset = []; console.warn('Dataset load failed', err); }
    if (!Array.isArray(dataset)) dataset = [];
    if (dataset.length === 0) {
      // Better message if all words were filtered or nothing loaded
      questionText.textContent = 'Không tải được dữ liệu. Vào trang “Nhập dữ liệu” để thêm dữ liệu hoặc kiểm tra mạng.';
      qIndex.textContent = '0/0';
      return;
    }
    // Do NOT filter out selected items here. Learn/Practice should focus on selected items if any,
    // but still keep the full dataset to allow SRS and stats to work.
    // Load SRS progress
    try{ srsStore = (window.SRS && SRS.loadStore && SRS.loadStore()) || {}; }catch{ srsStore = {}; }
    // Build SRS queue before first question so SRS takes priority
    buildSRSQueue();
    // Now shuffle and present the first question
    reshuffle();
    // Render SRS counts after initial load
    renderSRSCounts();
  // Initialize daily plan UI
  try{ initDailyPlanUI(); renderDailyPlan(); }catch{}

    // No auto-refresh from Sheet; use the reload button to refresh from file
    // attempt to flush any pending feedback if write URL is available
    flushFeedbackBuffer();

    // Daily prompt to set up Google Sheet only if we're in Sheet mode
    try{
      const appCfg = (window.APP_CONFIG || {});
      if (appCfg.DATA_SOURCE !== 'supabase'){
        const cfg = (LE.loadSheetConfig && LE.loadSheetConfig()) || {};
        const writeMissing = !cfg.writeUrl;
        if (writeMissing) {
          const today = new Date();
          const dayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`; // local YYYY-MM-DD
          const last = localStorage.getItem(SHEET_PROMPT_KEY) || '';
          if (last !== dayKey) {
            if (sheetModal) { sheetModal.style.display = 'block'; sheetModal.setAttribute('aria-hidden','false'); }
            localStorage.setItem(SHEET_PROMPT_KEY, dayKey);
          }
        }
      }
    }catch{}

    btnGoSheetCfg?.addEventListener('click', () => {
      // Navigate and focus the sheet config section
      window.location.href = 'admin.html#sheet-config';
    });

    btnModalClose?.addEventListener('click', () => {
      if (sheetModal) { sheetModal.style.display = 'none'; sheetModal.setAttribute('aria-hidden','true'); }
    });
    sheetModal?.addEventListener('click', (e) => {
      if (e.target && e.target.getAttribute('data-close') === 'true') {
        if (sheetModal) { sheetModal.style.display = 'none'; sheetModal.setAttribute('aria-hidden','true'); }
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sheetModal && sheetModal.style.display !== 'none') {
        sheetModal.style.display = 'none'; sheetModal.setAttribute('aria-hidden','true');
      }
    });
  }

  init();

  // --- SRS Due Counts (render per level) ---
  function renderSRSCounts(){
    const wrap = document.getElementById('srsCards');
    if (!wrap) return;
    if (!dataset || !dataset.length){ wrap.innerHTML = ''; return; }
    const hasSelection = dataset.some(itemIsSelected);
    const source = hasSelection ? dataset.filter(itemIsSelected) : dataset;
    const now = Date.now();
    const buckets = [
      { key:'L1', label:'Mới', count:0 },
      { key:'L2', label:'Ôn sớm', count:0 },
      { key:'L3', label:'Đang nhớ', count:0 },
      { key:'L4', label:'Vững', count:0 },
      { key:'L5+', label:'Rất vững', count:0 }
    ];
    source.forEach(item => {
      const reps = Number(item.reps)||0;
      const due = Number(item.due)||0;
      const isDue = !due || due <= now;
      if (!isDue) return;
      if (reps <= 0) buckets[0].count++;
      else if (reps === 1) buckets[1].count++;
      else if (reps === 2) buckets[2].count++;
      else if (reps === 3) buckets[3].count++;
      else buckets[4].count++;
    });
    wrap.innerHTML = buckets.map(b => `<div class="srs-card" data-level="${b.key}"><span class="lvl">${b.key}</span><span class="cnt">${b.count}</span></div>`).join('');
  }

  // Re-render counts after scheduling updates
  function afterSchedule(){
    try{ renderSRSCounts(); }catch{}
  }
  // Monkey-patch autoSchedule to update counts after each scheduling
  const origAutoSchedule = autoSchedule;
  autoSchedule = function(item, ok, p){
    try{ origAutoSchedule(item, ok, p); }catch(e){ console.warn('orig autoSchedule error', e); }
    afterSchedule();
    try{ renderDailyPlan(); }catch{}
  };

  // ===== Daily plan logic =====
  function loadTodayPlan(){
    const today = todayKey();
    try{
      const x = JSON.parse(localStorage.getItem(TODAY_PLAN_KEY)||'null');
      if (x && x.date === today){
        x.reviewedSet = new Set(Array.isArray(x.reviewed)||[]);
        x.newSet = new Set(Array.isArray(x.newed)||[]);
        return x;
      }
    }catch{}
    return { date: today, reviewsDone:0, newsDone:0, reviewedSet:new Set(), newSet:new Set() };
  }
  function saveTodayPlan(plan){
    try{
      const obj = {
        date: plan.date,
        reviewsDone: Number(plan.reviewsDone||0),
        newsDone: Number(plan.newsDone||0),
        reviewed: Array.from(plan.reviewedSet||[]),
        newed: Array.from(plan.newSet||[])
      };
      localStorage.setItem(TODAY_PLAN_KEY, JSON.stringify(obj));
    }catch{}
  }
  function initDailyPlanUI(){
    // Seed inputs from localStorage or defaults
    const n = parseInt(localStorage.getItem(DAILY_NEW_LIMIT_KEY),10);
    const newLimit = isNaN(n) ? DEFAULT_DAILY_NEW_LIMIT : n;
    if (inpDailyNewLimit){ inpDailyNewLimit.value = String(newLimit); }
    const r = parseInt(localStorage.getItem(DAILY_REVIEW_LIMIT_KEY),10);
    if (inpDailyReviewLimit){ inpDailyReviewLimit.value = String(isNaN(r)?0:r); }
    if (planNewTargetEl){ planNewTargetEl.textContent = String(newLimit); }
    if (planNewTarget2El){ planNewTarget2El.textContent = String(newLimit); }
    inpDailyNewLimit?.addEventListener('change', ()=>{
      const v = Math.max(0, Math.min(200, parseInt(inpDailyNewLimit.value,10)||0));
      inpDailyNewLimit.value = String(v);
      try{ localStorage.setItem(DAILY_NEW_LIMIT_KEY, String(v)); }catch{}
      if (planNewTargetEl) planNewTargetEl.textContent = String(v);
      if (planNewTarget2El) planNewTarget2El.textContent = String(v);
      // rebuild queue and rerender plan
      try{ buildSRSQueue(); renderDailyPlan(); }catch{}
    });
    inpDailyReviewLimit?.addEventListener('change', ()=>{
      const v = Math.max(0, Math.min(1000, parseInt(inpDailyReviewLimit.value,10)||0));
      inpDailyReviewLimit.value = String(v);
      try{ localStorage.setItem(DAILY_REVIEW_LIMIT_KEY, String(v)); }catch{}
      try{ buildSRSQueue(); renderDailyPlan(); }catch{}
    });
  }
  function computeTodayTotals(){
    const now = Date.now();
    const plan = loadTodayPlan();
    // Totals
    const dueTotal = (Array.isArray(dataset)?dataset:[]).filter(it => {
      const due = Number(it.due)||0; const reps = Number(it.reps)||0;
      // Treat due if scheduled and due time passed; brand new (reps==0 and no due) are not in dueTotal
      return reps > 0 && due && due <= now;
    }).length;
    const dailyNewTarget = parseInt(localStorage.getItem(DAILY_NEW_LIMIT_KEY),10);
    const newTarget = isNaN(dailyNewTarget) ? DEFAULT_DAILY_NEW_LIMIT : dailyNewTarget;
    // Left counts (avoid negative)
    const reviewsDone = plan.reviewedSet ? plan.reviewedSet.size : Number(plan.reviewsDone||0);
    const reviewsLeft = Math.max(0, dueTotal - reviewsDone);
    const newsDone = plan.newSet ? plan.newSet.size : Number(plan.newsDone||0);
    const newsLeft = Math.max(0, newTarget - newsDone);
    return { plan, dueTotal, newTarget, reviewsDone, reviewsLeft, newsDone, newsLeft };
  }
  function renderDailyPlan(){
    if (!planDueCountEl) return; // UI not on this page
    const { dueTotal, newTarget, reviewsDone, reviewsLeft, newsDone, newsLeft } = computeTodayTotals();
    const totalLeft = reviewsLeft + newsLeft;
    planDueCountEl.textContent = String(dueTotal);
    if (planNewTargetEl) planNewTargetEl.textContent = String(newTarget);
    if (planTotalLeftEl) planTotalLeftEl.textContent = String(totalLeft);
    if (planReviewsDoneEl) planReviewsDoneEl.textContent = String(reviewsDone);
    if (planReviewsTotalEl) planReviewsTotalEl.textContent = String(dueTotal);
    if (planNewsDoneEl) planNewsDoneEl.textContent = String(newsDone);
    if (planNewTarget2El) planNewTarget2El.textContent = String(newTarget);
    // Bars
    try{
      const rPct = dueTotal>0 ? Math.min(100, Math.round(reviewsDone/dueTotal*100)) : 0;
      const nPct = newTarget>0 ? Math.min(100, Math.round(newsDone/newTarget*100)) : 0;
      if (barReviews) barReviews.style.width = rPct + '%';
      if (barNews) barNews.style.width = nPct + '%';
    }catch{}
  }
  function tallyTodayForCurrent(){
    if (current == null || current < 0 || !dataset[current]) return;
    const item = dataset[current];
    const w = keyForWord(item.word);
    const plan = loadTodayPlan();
    // Practice tab only counts reviews (due items). New words are counted in Study tab when user selects “Học từ này”.
    plan.reviewedSet.add(w); plan.reviewsDone = plan.reviewedSet.size;
    saveTodayPlan(plan);
    renderDailyPlan();
  }
})();
