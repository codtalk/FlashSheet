// srs.js - Spaced Repetition (SM-2 inspired) helpers
(function(){
  // Removed Local Storage persistence: Sheet is single source of truth.
  // All SRS progress is kept in-memory and periodically written back to Sheet via appendRows.
  const DEFAULT_EASE = 2.5;
  const AGAIN_DELAY_MINUTES = 10; // schedule for "Again"
  const MIN_EASE = 1.3;

  const internalStore = {}; // { wordKey: card }
  let internalDaily = { date: null, newCount: 0 }; // ephemeral per day

  function todayKey(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function loadStore(){ return internalStore; }
  function saveStore(_store){ /* no-op: persistence removed */ }
  function loadDaily(){ return internalDaily; }
  function saveDaily(d){ internalDaily = d; }

  function ensureCard(store, word){
    const k = (word||'').toLowerCase();
    if (!k) return null;
    if (!store[k]){
      store[k] = {
        addedat: Date.now(),
        reps: 0,
        lapses: 0,
        ease: DEFAULT_EASE,
        interval: 0, // days
        due: Date.now(), // immediate
        lastReview: 0,
        confirms: 0, // số lần đúng xác nhận (chưa lên cấp)
      };
    }
    return store[k];
  }

  function sm2Schedule(card, quality){
    const now = Date.now();
    if (quality < 3){
      // Lapse: DO NOT reset reps to 0 (keep cumulative count for level progression)
      // Apply a small ease penalty and schedule a short retry window.
      card.lapses = (card.lapses||0) + 1;
      card.ease = Math.max(MIN_EASE, (card.ease||DEFAULT_EASE) - 0.2);
      card.interval = 1; // review again tomorrow after the immediate retry window
      // Immediate retry in a short period (Again delay)
      card.due = now + AGAIN_DELAY_MINUTES * 60 * 1000;
      card.confirms = 0; // reset confirmations sau khi sai
    } else if (quality === 6) {
      // Correct confirmation without leveling up: keep reps unchanged, schedule next day
      // Slight ease improvement to reflect positive performance
      card.interval = Math.max(1, card.interval || 1);
      const efChange = 0.05;
      card.ease = Math.max(MIN_EASE, (card.ease||DEFAULT_EASE) + efChange);
      card.due = now + 1 * 86400000;
      card.confirms = (card.confirms||0) + 1; // tích luỹ xác nhận đúng
      try { console.debug('[SRS] quality=6 confirms incremented to', card.confirms, 'word:', (card && card.word) || '(no word)'); } catch {}
    } else {
      console.log('Scheduling with quality', quality);
      console.log("reps before", card.reps);
      console.log("interval before", card.interval);
      console.log("ease before", card.ease);
      // Successful review
      if (card.reps === 0) card.interval = 1; // first successful review: next day
      else if (card.reps === 1) card.interval = 3; // second successful: shorter jump (was 6d)
      else card.interval = Math.max(1, Math.round(card.interval * card.ease));
      card.reps += 1;
      // quality mapping influences ease
      const efChange = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
      card.ease = Math.max(MIN_EASE, card.ease + efChange);
      card.due = now + card.interval * 86400000;
      card.confirms = 0; // reset sau khi lên cấp
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
      // If dataset already contains SRS columns (due/reps/etc), prefer them over internal store
      const dueVal = (item.due !== undefined ? Number(item.due) : (store[k] ? store[k].due : 0)) || 0;
      const repsVal = (item.reps !== undefined ? Number(item.reps) : (store[k] ? store[k].reps : 0)) || 0;
      if (dueVal && dueVal <= now && repsVal >= 0){
        reviews.push(k);
      } else if (!store[k] && repsVal === 0 && daily.newCount < dailyNewLimit){
        news.push(k);
        daily.newCount += 1;
      }
    });
    saveDaily(daily);
    const limitedReviews = dailyReviewLimit > 0 ? reviews.slice(0, dailyReviewLimit) : reviews;
    // Prioritize new words (news) before reviews so learners see new items earlier.
    // Return combined with news first.
    return { reviews: limitedReviews, news, combined: [...news, ...limitedReviews] };
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