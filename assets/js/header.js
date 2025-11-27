// Shared Header Component: injects consistent, responsive header across pages
// - Works on file:// and http(s) without external fetch
// - Includes Theme Switcher (hooked by theme.js)
// - Adds conditional admin link (only for user 'thienpahm') and Support submenu
(function(){
  const html = `
<header class="site-header" role="banner">
  <div class="header-inner">
    <a class="brand" href="index.html" aria-label="Trang chủ">
      <span class="brand-logo" aria-hidden="true">🎓</span>
      <span class="brand-name">Cardcard</span>
    </a>
    <nav class="site-nav" aria-label="Chính">
      <button class="menu-toggle" aria-label="Mở menu" aria-controls="mobileMenu" aria-expanded="false">
        <span class="bar"></span><span class="bar"></span><span class="bar"></span>
      </button>
      <ul class="nav-list">
        <li><a href="study.html" class="nav-link" data-match="study.html"><span class="ico">📖</span>Học từ</a></li>
        <li><a href="index.html" class="nav-link" data-match="index.html"><span class="ico">🧠</span>Luyện tập</a></li>
        <li><a href="mywords.html" class="nav-link" data-match="mywords.html"><span class="ico">⭐</span>My Words</a></li>
        <li><a href="admin.html" class="nav-link" data-match="admin.html" data-role="admin"><span class="ico">📝</span>Nhập dữ liệu</a></li>
        <li class="has-submenu">
          <button type="button" class="nav-link submenu-toggle" aria-haspopup="true" aria-expanded="false"><span class="ico">💡</span>Hỗ trợ ▾</button>
          <ul class="submenu" aria-label="Hỗ trợ">
            <li><a href="guide.html" class="nav-link" data-match="guide.html"><span class="ico">❓</span>Hướng dẫn</a></li>
            <li><a href="feedback.html" class="nav-link" data-match="feedback.html"><span class="ico">💬</span>Góp ý</a></li>
          </ul>
        </li>
      </ul>
      <div class="theme-switcher">
        <select id="themeSwitcher" aria-label="Chọn giao diện">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="pastel">Pastel</option>
          <option value="focus">Focus</option>
        </select>
      </div>
    </nav>
  </div>
  <aside id="mobileMenu" class="nav-drawer" aria-hidden="true">
    <ul>
      <li><a href="study.html" class="drawer-link" data-match="study.html">📖 Học từ</a></li>
      <li><a href="index.html" class="drawer-link" data-match="index.html">🧠 Luyện tập</a></li>
      <li><a href="mywords.html" class="drawer-link" data-match="mywords.html">⭐ My Words</a></li>
      <li><a href="admin.html" class="drawer-link" data-match="admin.html" data-role="admin">📝 Nhập dữ liệu</a></li>
      <li class="drawer-group">
        <span class="drawer-group-label">💡 Hỗ trợ</span>
        <ul class="drawer-sub">
          <li><a href="guide.html" class="drawer-link" data-match="guide.html">❓ Hướng dẫn</a></li>
          <li><a href="feedback.html" class="drawer-link" data-match="feedback.html">💬 Góp ý</a></li>
        </ul>
      </li>
    </ul>
  </aside>
</header>`;

  function inject(){
    let host = document.getElementById('appHeader');
    if (!host){
      host = document.createElement('div');
      host.id = 'appHeader';
      document.body.insertBefore(host, document.body.firstChild);
    }
    host.innerHTML = html;

    const brandEl = host.querySelector('.brand-name');
    const metaBrand = (document.querySelector('meta[name="app-brand"]')||{}).content;
    const dataBrand = document.body && document.body.dataset ? document.body.dataset.brand : '';
    const brandText = (dataBrand || metaBrand || 'Cardcard').trim();
    if (brandEl && brandText) brandEl.textContent = brandText;

    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('[data-match]').forEach(a => {
      const m = (a.getAttribute('data-match')||'').toLowerCase();
      if (m === path) a.classList.add('is-active');
    });

    // Conditional admin link (only show for user 'thienpahm')
    try {
      const uname = (typeof loadUser === 'function') ? (loadUser() || '') : '';
      if (uname !== 'thienpahm') {
        host.querySelectorAll('[data-role="admin"]').forEach(el => el.remove());
        document.querySelectorAll('#mobileMenu [data-role="admin"]').forEach(el => el.remove());
      }
    } catch {}

    const btn = host.querySelector('.menu-toggle');
    let drawer = host.querySelector('.nav-drawer');
    if (drawer && drawer.parentElement !== document.body){
      document.body.appendChild(drawer);
    }
    let overlay = document.querySelector('.nav-overlay');
    if (!overlay){
      overlay = document.createElement('div');
      overlay.className = 'nav-overlay';
      document.body.appendChild(overlay);
    }
    function close(){
      drawer.classList.remove('open');
      overlay.classList.remove('show');
      btn.setAttribute('aria-expanded','false');
      drawer.setAttribute('aria-hidden','true');
      document.documentElement.classList.remove('no-scroll');
      btn.classList.remove('open');
    }
    function open(){
      drawer.classList.add('open');
      overlay.classList.add('show');
      drawer.style.height = `calc(100dvh - var(--header-h))`;
      btn.setAttribute('aria-expanded','true');
      drawer.setAttribute('aria-hidden','false');
      document.documentElement.classList.add('no-scroll');
      btn.classList.add('open');
    }
    btn && btn.addEventListener('click', () => {
      drawer.classList.contains('open') ? close() : open();
    });
    overlay.addEventListener('click', close);
    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')){ close(); }
    });

    // Submenu toggle (desktop)
    const submenuToggle = host.querySelector('.submenu-toggle');
    if (submenuToggle){
      const parentLi = submenuToggle.closest('.has-submenu');
      submenuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        parentLi.classList.toggle('open');
        submenuToggle.setAttribute('aria-expanded', parentLi.classList.contains('open') ? 'true' : 'false');
      });
      document.addEventListener('click', (e) => {
        if (!parentLi.contains(e.target)){
          parentLi.classList.remove('open');
          submenuToggle.setAttribute('aria-expanded','false');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape'){
          parentLi.classList.remove('open');
          submenuToggle.setAttribute('aria-expanded','false');
        }
      });
    }

    document.dispatchEvent(new CustomEvent('header:ready'));
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inject);
  }else{
    inject();
  }
})();
