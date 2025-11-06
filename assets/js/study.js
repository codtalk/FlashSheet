// study.js — Simple flip-card viewer for vocabulary
(function(){
  const flipCard = document.getElementById('flipCard');
  const fcIndex = document.getElementById('fcIndex');
  const fcIndexBack = document.getElementById('fcIndexBack');
  const fcWord = document.getElementById('fcWord');
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

  let fsBackdrop = null;

  let dataset = [];
  let order = [];
  let cur = 0;
  let touchStartX = null;
  const logPrefix = '[Study/TTS]';

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
    const defs = Array.isArray(item.definitions) ? item.definitions : [];
    if (!defs.length) return '';
    const vn = defs.find(d => containsVietnamese(d));
    if (vn) return vn;
    const firstNonCloze = defs.find(d => !/_{2,}/.test(d));
    return firstNonCloze || defs[0];
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
    const defs = Array.isArray(item.definitions) ? item.definitions : [];
    const eng = defs.filter(d => !containsVietnamese(d));
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
    // image
    const img = imageFromItem(item);
    if (img){
      fcImage.hidden = false;
      fcImage.innerHTML = `<img src="${img}" alt="${item.word||''}" />`;
    } else {
      fcImage.hidden = true; fcImage.innerHTML = '';
    }
    // front: list only NON-Vietnamese definitions/examples (không hiển thị nghĩa tiếng Việt)
    const defs = Array.isArray(item.definitions) ? item.definitions : [];
    const enDefs = defs.filter(d => !containsVietnamese(d));
    if (enDefs.length){
      fcDefs.innerHTML = enDefs.map(d => `<li>${d}</li>`).join('');
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
        <ul class="fc-ex-list">${examples.map(e => `<li>${e}</li>`).join('')}</ul>`;
    } else {
      fcExplain.innerHTML = '';
    }
    updateIndex();
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
    // load dataset from local, fallback to file
    try{
      dataset = await LE.loadDataset();
      if (!Array.isArray(dataset) || dataset.length === 0){
        const fromFile = await LE.loadDatasetFromFile();
        if (Array.isArray(fromFile) && fromFile.length){
          LE.saveDatasetToLocal(fromFile);
          dataset = fromFile;
        } else { dataset = []; }
      }
    }catch{ dataset = []; }
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
          showToast('Không phát được âm. Hãy mở bằng Chrome/Safari và/hoặc cấu hình Apps Script TTS URL trong Nhập dữ liệu.', 'error');
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
