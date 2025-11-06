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
      if (btnSpeakWord){ btnSpeakWord.disabled = !supported; btnSpeakWord.hidden = !supported; }
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
      if (!(LE && LE.tts && LE.tts.supported && LE.tts.supported())) return;
      const item = dataset[cur];
      const word = (item && item.word) ? String(item.word).trim() : '';
      if (!word) return;
      await LE.tts.speak(word, { lang: 'en-US', rate: 0.95 });
    }catch{}
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
