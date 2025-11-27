// Theme Switcher: manages data-theme on <html> and persists choice
// Themes: light (default), dark, pastel, focus
(function(){
  const KEY = 'learnEnglish.theme';
  const THEMES = ['light','dark','pastel','focus'];

  function applyTheme(theme){
    const t = THEMES.includes(theme) ? theme : 'light';
    document.documentElement.setAttribute('data-theme', t);
  }

  function detectSystem(){
    try{
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }catch{ return 'light'; }
  }

  function bindSelect(sel){
    if (!sel || sel._themeBound) return;
    sel._themeBound = true;
    sel.addEventListener('change', () => {
      const val = sel.value;
      applyTheme(val);
      try{ localStorage.setItem(KEY, val); }catch{}
    });
  }

  function init(){
    const saved = localStorage.getItem(KEY);
    const initial = saved || detectSystem();
    applyTheme(initial);

    const sel = document.getElementById('themeSwitcher');
    if (sel){
      sel.value = THEMES.includes(initial) ? initial : 'light';
      bindSelect(sel);
    }

    // Update select if theme changed elsewhere
    const obs = new MutationObserver(() => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const s = document.getElementById('themeSwitcher');
      if (s){
        if (s.value !== cur && THEMES.includes(cur)) s.value = cur;
        bindSelect(s);
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // If header is injected later, re-bind
    document.addEventListener('header:ready', () => {
      const s = document.getElementById('themeSwitcher');
      if (s){ s.value = document.documentElement.getAttribute('data-theme') || 'light'; bindSelect(s); }
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
