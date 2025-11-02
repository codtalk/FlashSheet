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
  }

  init();
})();
