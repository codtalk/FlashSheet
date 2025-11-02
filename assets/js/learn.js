// learn.js - Flashcard learning logic

(function(){
  const modeSelect = document.getElementById('modeSelect');
  const btnShuffle = document.getElementById('btnShuffle');
  const importFile = document.getElementById('importFile');
  const card = document.getElementById('card');
  const questionText = document.getElementById('questionText');
  const answerArea = document.getElementById('answerArea');
  const feedback = document.getElementById('feedback');
  const btnNext = document.getElementById('btnNext');
  const qIndex = document.getElementById('qIndex');
  const confettiCanvas = document.getElementById('confettiCanvas');
  const statCorrect = document.getElementById('statCorrect');
  const statWrong = document.getElementById('statWrong');
  const btnSheetReload = document.getElementById('btnSheetReload');

  let dataset = [];
  let queue = []; // array of indices
  let current = -1;
  let correctCount = 0;
  let wrongCount = 0;
  let answered = false;
  let sheetCfg = LE.loadSheetConfig ? (LE.loadSheetConfig() || {}) : {};
  let refreshTimer = null;

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

  function nextQuestion(){
    if (queue.length === 0) return;
    current = (current + 1) % queue.length;
    setQuestion(queue[current]);
  }

  function reshuffle(){
    queue = LE.shuffle(dataset.map((_, idx) => idx));
    current = -1;
    nextQuestion();
  }

  function getCurrentMode(){
    return modeSelect.value;
  }

  btnShuffle.addEventListener('click', reshuffle);
  btnNext.addEventListener('click', nextQuestion);
  modeSelect.addEventListener('change', () => setQuestion(queue[current] ?? 0));
  btnSheetReload?.addEventListener('click', async () => {
    try{
      if (!sheetCfg.csvUrl) { alert('Chưa cấu hình Google Sheet CSV URL trong trang Nhập dữ liệu'); return; }
      const data = await LE.fetchSheetCSV(sheetCfg.csvUrl);
      dataset = Array.isArray(data) ? data : [];
      LE.saveDatasetToLocal(dataset);
      reshuffle();
    }catch(err){
      alert(err.message || 'Không thể tải từ Sheet');
    }
  });

  importFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try{
      const data = await LE.importDatasetFromFile(file);
      dataset = Array.isArray(data) ? data : [];
      LE.saveDatasetToLocal(dataset);
      reshuffle();
    } catch(err){
      alert('Không thể đọc JSON: ' + err.message);
    } finally {
      importFile.value='';
    }
  });

  async function init(){
    // If auto-on-learn enabled and CSV configured, fetch from Sheet first
    if (sheetCfg && sheetCfg.autoOnLearn && sheetCfg.csvUrl) {
      try { dataset = await LE.fetchSheetCSV(sheetCfg.csvUrl); }
      catch { dataset = await LE.loadDataset(); }
    } else {
      dataset = await LE.loadDataset();
    }
    if (!Array.isArray(dataset)) dataset = [];
    if (dataset.length === 0) {
      questionText.textContent = 'Chưa có dữ liệu. Hãy vào trang Nhập dữ liệu để thêm từ.';
      qIndex.textContent = '0/0';
      return;
    }
    reshuffle();

    // Set up auto-refresh from Sheet if configured
    if (sheetCfg && sheetCfg.autoOnLearn && sheetCfg.csvUrl) {
      const ms = Math.max(15000, (sheetCfg.refreshSec || 120) * 1000);
      refreshTimer = setInterval(async () => {
        try{
          const data = await LE.fetchSheetCSV(sheetCfg.csvUrl);
          if (Array.isArray(data) && data.length) {
            dataset = data;
            LE.saveDatasetToLocal(dataset);
            // keep current index meaningfully: re-render current question
            setQuestion(queue[current] ?? 0);
          }
        }catch{}
      }, ms);
    }
  }

  init();
})();
