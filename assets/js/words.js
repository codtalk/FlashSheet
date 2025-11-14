// words.js - Hiển thị toàn bộ từ của tôi
(function(){
  // Lấy danh sách từ từ Supabase
  function formatDate(ts){
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN');
  }

  function humanTimeUntil(ts){
    if (!ts) return '';
    const now = Date.now();
    const t = Number(ts) || 0;
    if (t <= 0) return '';
    const delta = t - now;
    if (delta <= 0) return 'Đã đến hạn';
    const mins = Math.round(delta/60000);
    if (mins < 60) return `Còn ${mins}m`;
    const hours = Math.round(delta/3600000);
    if (hours < 24) return `Còn ${hours}h`;
    const days = Math.round(delta/86400000);
    return `Còn ${days}d`;
  }

  async function fetchWordsFromSupabase(username){
    const cfg = window.APP_CONFIG || {};
    const headers = {
      'apikey': cfg.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    // Use 'user' column (per-app schema) to fetch per-user SRS records
    try{
      const col = 'user';
      const url = `${cfg.SUPABASE_URL}/rest/v1/${cfg.SUPABASE_SRS_TABLE}?${col}=eq.${encodeURIComponent(username)}&select=*`;
      const resp = await fetch(url, { method: 'GET', headers });
      if (!resp.ok){
        const txt = await resp.text().catch(()=>'');
        console.warn('Supabase fetch failed', resp.status, txt);
        return [];
      }
      const json = await resp.json();
      return Array.isArray(json) ? json : [];
    }catch(e){ console.warn('Supabase fetch failed', e); return []; }
  }

  async function renderWords(){
    const table = document.getElementById('wordTable').getElementsByTagName('tbody')[0];
  table.innerHTML = '<tr><td colspan="6">Đang tải dữ liệu...</td></tr>';
    // Đảm bảo đã có hàm loadUser và ensureUserPrompt từ utils.js
    let username = '';
    if (typeof loadUser === 'function') {
      username = loadUser();
      if (!username && typeof ensureUserPrompt === 'function') {
        username = ensureUserPrompt('');
      }
    }
    if (!username) {
      table.innerHTML = '<tr><td colspan="4">Không xác định được tài khoản người dùng.</td></tr>';
      return;
    }
    const words = await fetchWordsFromSupabase(username);
    if (!words.length){
      table.innerHTML = '<tr><td colspan="6">Chưa có từ nào được thêm vào.</td></tr>';
      return;
    }
    table.innerHTML = '';
    words.forEach(card => {
      const tr = document.createElement('tr');
      const dueVal = Number(card.due || card.due_at || card.dueAt || 0) || 0;
      // Determine status
      let status = '';
      // Consider a word NEW only if there is no SRS info (no due and no reps field)
      const hasReps = (card.reps !== undefined && card.reps !== null);
      if (!hasReps && !dueVal){
        status = 'Mới';
      } else if (dueVal && dueVal <= Date.now()){
        status = 'Đã đến hạn';
      } else if (dueVal){
        status = humanTimeUntil(dueVal);
      } else if (!hasReps){
        status = 'Mới';
      } else {
        // fallback: show reps info if available
        status = (hasReps ? (`${card.reps||0} lần`) : '');
      }
      const nextDueStr = dueVal ? formatDate(dueVal) : '';
      tr.innerHTML = `
        <td>${card.word}</td>
        <td>${formatDate(card.addedat)}</td>
        <td>${formatDate(card.lastreview)}</td>
        <td>${nextDueStr}</td>
        <td>${status}</td>
        <td>${card.reps||0}</td>
      `;
      table.appendChild(tr);
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    renderWords();
    // Wire practice-now button
    const btn = document.getElementById('btnPracticeNews');
    if (btn){ btn.addEventListener('click', async ()=>{
      try{
        btn.disabled = true; btn.textContent = 'Đang xử lý...';
        const cfg = window.APP_CONFIG || {};
        if (cfg.DATA_SOURCE !== 'supabase' || !cfg.SUPABASE_URL){ alert('Chỉ hỗ trợ Supabase hiện tại.'); btn.disabled=false; btn.textContent='Practice new words now'; return; }
        let username = '';
        if (typeof loadUser === 'function') username = loadUser() || '';
        if (!username && typeof ensureUserPrompt === 'function') username = ensureUserPrompt('');
        if (!username){ alert('Không có username.'); btn.disabled=false; btn.textContent='Practice new words now'; return; }
        const table = cfg.SUPABASE_SRS_TABLE || 'srs_user';
        const now = Date.now();
        const headers = {
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${cfg.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Prefer': 'return=representation'
        };
        // Use 'user' column only
        const col = 'user';
        const filter = `${col}=eq.${encodeURIComponent(username)}&or=(due.is.null,reps.eq.0)`;
        const url = `${cfg.SUPABASE_URL}/rest/v1/${table}?${filter}`;
        let success = false;
        try{
          // Only set due=now so the items become available for practice without
          // accidentally promoting their reps (avoid setting reps here).
          const resp = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ due: now }) });
          if (!resp.ok){
            const txt = await resp.text().catch(()=>'');
            alert('Cập nhật thất bại: '+resp.status+' '+txt);
          } else {
            const updated = await resp.json().catch(()=>null);
            const count = Array.isArray(updated) ? updated.length : (updated && updated.length) ? updated.length : 'một số';
            alert('Đã cập nhật ' + count + ' bản ghi. Quay về trang Luyện tập để bắt đầu.');
            success = true;
          }
        }catch(e){ console.warn('Attempt failed for user PATCH', e); alert('Lỗi khi cập nhật: '+(e && e.message ? e.message : e)); }
        if (!success){
          console.warn('Practice new words update failed');
          alert('Không thể cập nhật các từ mới. Xem console để biết chi tiết.');
        }
        // refresh list
        renderWords();
      }catch(err){ console.warn(err); alert('Lỗi khi cập nhật: '+(err&&err.message?err.message:err)); }
      try{ btn.disabled=false; btn.textContent='Practice new words now'; }catch{}
    }); }
  });
})();
