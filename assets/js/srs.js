// srs.js - Spaced Repetition (SM-2 inspired) helpers
(function(){
  const SRS_KEY = 'fs_srs_progress_v1';
  const DAILY_KEY = 'fs_srs_daily_stats_v1';
  const DEFAULT_EASE = 2.5;
  const AGAIN_DELAY_MINUTES = 10; // schedule for "Again"
  const MIN_EASE = 1.3;

  function todayKey(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function loadStore(){
    try{ return JSON.parse(localStorage.getItem(SRS_KEY) || '{}') || {}; }catch{ return {}; }
  }
  function saveStore(store){
    try{ localStorage.setItem(SRS_KEY, JSON.stringify(store||{})); }catch{}
  }
  function loadDaily(){
    try{ return JSON.parse(localStorage.getItem(DAILY_KEY) || '{}') || {}; }catch{ return {}; }
  }
  function saveDaily(d){
    try{ localStorage.setItem(DAILY_KEY, JSON.stringify(d||{})); }catch{}
  }

  function ensureCard(store, word){
    const k = (word||'').toLowerCase();
    if (!k) return null;
    if (!store[k]){
      store[k] = {
        addedAt: Date.now(),
        reps: 0,
        lapses: 0,
        ease: DEFAULT_EASE,
        interval: 0, // days
        due: Date.now(), // immediate
        lastReview: 0,
      };
    }
    return store[k];
  }

  function sm2Schedule(card, quality){
    const now = Date.now();
    if (quality < 3){
      card.reps = 0;
      card.interval = 1; // after lapse review tomorrow
      card.lapses = (card.lapses||0) + 1;
      // Special immediate again delay
      card.due = now + AGAIN_DELAY_MINUTES * 60 * 1000;
    } else {
      if (card.reps === 0) card.interval = 1;
      else if (card.reps === 1) card.interval = 6;
      else card.interval = Math.max(1, Math.round(card.interval * card.ease));
      card.reps += 1;
      // quality mapping influences ease
      const efChange = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
      card.ease = Math.max(MIN_EASE, card.ease + efChange);
      card.due = now + card.interval * 86400000;
    }
    card.lastReview = now;
    return card;
  }

  // Predict next interval (days or minutes string) without mutating
  function predict(card, quality){
    const clone = JSON.parse(JSON.stringify(card));
    sm2Schedule(clone, quality);
    const now = Date.now();
    const delta = clone.due - now;
    if (delta < 60*60*1000){
      const mins = Math.round(delta/60000);
      return `${mins}m`;
    }
    const days = Math.round(delta/86400000*10)/10; // one decimal
    return `${days}d`;
  }

  function buildQueue(dataset, opts={}){
    const store = loadStore();
    const daily = loadDaily();
    const keyToday = todayKey();
    if (daily.date !== keyToday){ daily.date = keyToday; daily.newCount = 0; saveDaily(daily); }
    const dailyNewLimit = opts.dailyNewLimit || 20;
    const dailyReviewLimit = (opts.dailyReviewLimit || 0) | 0; // 0 = unlimited
    const now = Date.now();
    const reviews = [];
    const news = [];
    dataset.forEach(item => {
      const k = (item.word||'').toLowerCase();
      if (store[k]){
        if (store[k].due <= now) reviews.push(k);
      } else if (daily.newCount < dailyNewLimit){
        news.push(k);
        daily.newCount += 1;
      }
    });
    saveDaily(daily);
    const limitedReviews = dailyReviewLimit > 0 ? reviews.slice(0, dailyReviewLimit) : reviews;
    return { reviews: limitedReviews, news, combined: [...limitedReviews, ...news] };
  }

  window.SRS = {
    loadStore,
    saveStore,
    ensureCard,
    schedule: sm2Schedule,
    predict,
    buildQueue,
    DEFAULT_EASE,
  };
})();