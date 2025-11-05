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

  let dataset = [];
  let queue = []; // array of indices
  let current = -1;
  let correctCount = 0;
  let wrongCount = 0;
  let answered = false;
  let sheetCfg = LE.loadSheetConfig ? (LE.loadSheetConfig() || {}) : {};
  let refreshTimer = null;
  const PROGRESS_KEY = 'fs_progress';
  let progress = {}; // { [wordKey]: { seen, correct, wrong, lastSeen, streak } }
  const FEEDBACK_BUF_KEY = 'fs_feedback_buffer';
  const FEEDBACK_USER_KEY = 'fs_feedback_user';
  let lastDef = '';
  const SHEET_PROMPT_KEY = 'fs_sheet_prompt_date';
  const AUTO_TTS_KEY = 'fs_auto_tts';
  const AUTO_TRANS_KEY = 'fs_auto_trans';
  let lastSpeakParts = [];

  function loadProgress(){
    try{ progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') || {}; }
    catch{ progress = {}; }
  }
  function saveProgress(){
    try{ localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch{}
  }
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

  function setQuestion(index){
    const item = dataset[index];
    const defs = item.definitions || [];
    // pick a random definition for the flashcard front
    const def = defs[Math.floor(Math.random()*defs.length)];
    questionText.textContent = def;
    lastDef = def;
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
    const ok = normalize(value) === normalize(dataset[index].word);
    handleResult(ok, index);
  }

  function submitChoice(choice, index, el){
    if (answered) return;
    const ok = normalize(choice) === normalize(dataset[index].word);
    handleResult(ok, index, el);
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
    } else {
      wrongCount++;
      feedback.textContent = `Sai rồi. Đáp án: ${dataset[index].word}`;
      card.classList.add('wrong');
      if (choiceEl) choiceEl.classList.add('wrong');
    }
    updateStats();
    answered = true;
    // disable inputs
    answerArea.querySelectorAll('input,button.choice,.btn.primary').forEach(el => {
      el.disabled = true;
    });

    // Post-answer: read aloud and show translation
    try{ doPostAnswer(item, ok); }catch{}
  }

  function containsVietnamese(text){
    // basic check for Vietnamese diacritics
    return /[ăâđêôơưÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬáàảãạắằẳẵặấầẩẫậĐđÉÈẺẼẸÊẾỀỂỄỆéèẻẽẹếềểễệÍÌỈĨỊíìỉĩịÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢóòỏõọốồổỗộớờởỡợÚÙỦŨỤƯỨỪỬỮỰúùủũụứừửữựÝỲỶỸỴýỳỷỹỵ]/.test((text||''));
  }

  function getPreferredTranslation(item){
    const defs = Array.isArray(item.definitions) ? item.definitions : [];
    if (!defs.length) return '';
    // Prefer: first def that looks Vietnamese
    const vn = defs.find(d => containsVietnamese(d));
    if (vn) return vn;
    // Next: the first definition if it's not a cloze with ____
    const firstNonCloze = defs.find(d => !/_{2,}/.test(d));
    return firstNonCloze || defs[0];
  }

  function renderPostAnswer(item){
    if (!postAnswer) return;
    const showTrans = !!(toggleTrans?.checked);
    const trans = getPreferredTranslation(item);
    let shown = false;
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
    postAnswer.hidden = !shown && !(btnReplayTTS && !btnReplayTTS.disabled);
  }

  function doPostAnswer(item, ok){
    // Build speak parts
    lastSpeakParts = [];
    if (item && item.word){
      lastSpeakParts.push({ text: item.word, lang: 'en-US', rate: 0.95 });
    }
    const trans = getPreferredTranslation(item);
    if (trans){
      lastSpeakParts.push({ text: trans, lang: 'vi-VN', rate: 1 });
    }

    // Render UI
    renderPostAnswer(item);

    // Auto TTS if enabled and supported
    const canSpeak = !!(window.LE && LE.tts && LE.tts.supported && LE.tts.supported());
    if (btnReplayTTS){ btnReplayTTS.disabled = !canSpeak; }
    if (canSpeak && toggleTTS?.checked && lastSpeakParts.length){
      // fire and forget
      LE.tts.chainSpeak(lastSpeakParts);
    }
    if (postAnswer && (!postAnswer.hidden)){
      // nothing else
    }
  }

  function computeWeights(){
    const now = Date.now();
    const FIFTEEN_MIN = 15 * 60 * 1000;
    return dataset.map((item, idx) => {
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
    const next = pickNextIndex();
    if (next < 0) return;
    current = next;
    setQuestion(current);
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
  btnNext.addEventListener('click', nextQuestion);
  modeSelect.addEventListener('change', () => setQuestion(queue[current] ?? 0));
  // Removed: reload from file and import JSON/CSV on learn page

  function loadFeedbackBuffer(){
    try{ return JSON.parse(localStorage.getItem(FEEDBACK_BUF_KEY)||'[]') || []; }catch{ return []; }
  }
  function saveFeedbackBuffer(buf){
    try{ localStorage.setItem(FEEDBACK_BUF_KEY, JSON.stringify(buf||[])); }catch{}
  }
  async function flushFeedbackBuffer(){
    const central = LE && LE.FEEDBACK_URL;
    if (!central) return;
    const buf = loadFeedbackBuffer();
    if (!buf.length) return;
    try{
      const rows = buf.map(item => {
        if (typeof item === 'string') return { type:'feedback', message: item, ctx:'', user:'' };
        return { type:'feedback', message: item.message||'', ctx:item.ctx||'', user:item.user||'' };
      });
      await LE.appendRowsToSheet(central, rows);
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
    const central = LE && LE.FEEDBACK_URL;
    if (!central) {
      const buf = loadFeedbackBuffer(); buf.push({ message: full, ctx:'', user:name }); saveFeedbackBuffer(buf);
      feedbackText.value = '';
      alert('Không có endpoint góp ý. Đã lưu tạm góp ý và sẽ gửi khi có cấu hình.');
      return;
    }
    try{
      await LE.appendRowsToSheet(central, [{ type:'feedback', message: full, ctx:'', user:name }]);
      feedbackText.value = '';
      alert('Đã gửi góp ý. Cám ơn bạn!');
    }catch(err){
      const buf = loadFeedbackBuffer(); buf.push({ message: full, ctx:'', user:name }); saveFeedbackBuffer(buf);
      alert('Không gửi được góp ý, đã lưu tạm và sẽ gửi lại sau.');
    }
  });

  btnResetProgress?.addEventListener('click', () => {
    if (confirm('Xoá tiến độ học (thống kê và lịch nhắc lại)?')){
      localStorage.removeItem(PROGRESS_KEY);
      loadProgress();
      correctCount = 0; wrongCount = 0; updateStats();
      // render lại câu hiện tại để bỏ trạng thái đã trả lời
      if (current >= 0) setQuestion(current); else nextQuestion();
      alert('Đã xoá tiến độ.');
    }
  });

  async function init(){
    loadProgress();
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
    // Persist toggles
    toggleTTS?.addEventListener('change', ()=>{
      try{ localStorage.setItem(AUTO_TTS_KEY, toggleTTS.checked ? '1':'0'); }catch{}
    });
    toggleTrans?.addEventListener('change', ()=>{
      try{ localStorage.setItem(AUTO_TRANS_KEY, toggleTrans.checked ? '1':'0'); }catch{}
      // re-render post answer for current item if answered
      if (answered && current >= 0) renderPostAnswer(dataset[current]);
    });
    btnReplayTTS?.addEventListener('click', ()=>{
      if (LE && LE.tts && lastSpeakParts.length) LE.tts.chainSpeak(lastSpeakParts);
    });
    // load stored feedback user name if any
    try{
      const savedName = localStorage.getItem(FEEDBACK_USER_KEY) || '';
      if (feedbackUser && savedName) feedbackUser.value = savedName;
      feedbackUser?.addEventListener('change', ()=>{
        try{ localStorage.setItem(FEEDBACK_USER_KEY, (feedbackUser.value||'').trim()); }catch{}
      });
    }catch{}
  // Always prefer Local Storage; if empty, bootstrap from vocab.json into Local
    dataset = await LE.loadDataset();
    if (!Array.isArray(dataset) || dataset.length === 0) {
      const fileData = await LE.loadDatasetFromFile();
      if (Array.isArray(fileData) && fileData.length) {
        LE.saveDatasetToLocal(fileData);
        dataset = fileData;
      } else {
        dataset = [];
      }
    }
    if (!Array.isArray(dataset)) dataset = [];
    if (dataset.length === 0) {
      questionText.textContent = 'Chưa có dữ liệu. Hãy vào trang Nhập dữ liệu để thêm từ.';
      qIndex.textContent = '0/0';
      return;
    }
    reshuffle();

    // No auto-refresh from Sheet; use the reload button to refresh from file
    // attempt to flush any pending feedback if write URL is available
    flushFeedbackBuffer();

    // Daily prompt to set up Google Sheet (Write URL) if missing
    try{
      const cfg = (LE.loadSheetConfig && LE.loadSheetConfig()) || {};
      const writeMissing = !cfg.writeUrl;
      if (writeMissing) {
        const today = new Date();
        const dayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`; // local YYYY-MM-DD
        const last = localStorage.getItem(SHEET_PROMPT_KEY) || '';
        if (last !== dayKey) {
          // show modal
          if (sheetModal) { sheetModal.style.display = 'block'; sheetModal.setAttribute('aria-hidden','false'); }
          localStorage.setItem(SHEET_PROMPT_KEY, dayKey);
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
})();
