/* Life Counter – Vollbild-Zähler für 2–6 Spieler */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const KEY = 'cw:life';

  const THEMES = [
    { id: 'violet', a: '#6d5dfc', b: '#a855f7' },
    { id: 'ocean', a: '#2563eb', b: '#06b6d4' },
    { id: 'emerald', a: '#059669', b: '#84cc16' },
    { id: 'sunset', a: '#f97316', b: '#e11d48' },
    { id: 'rose', a: '#db2777', b: '#f9a8d4' },
    { id: 'gold', a: '#d97706', b: '#facc15' },
    { id: 'teal', a: '#0d9488', b: '#5eead4' },
    { id: 'night', a: '#1e293b', b: '#64748b' },
  ];
  const themeOf = (p) => THEMES.find((t) => t.id === p.theme) || THEMES[0];
  const tileBg = (p) => { const t = themeOf(p); return `linear-gradient(145deg, ${t.a}, ${t.b})`; };

  // Layouts im Hochformat: Matrix der Spielerplätze + Drehung je Spieler (Grad)
  const LAYOUTS = {
    2: { m: [[0], [1]], r: [180, 0] },
    3: { m: [[0, 0], [1, 2]], r: [180, 90, 270] },
    4: { m: [[0, 1], [2, 3]], r: [90, 270, 90, 270] },
    5: { m: [[0, 0], [1, 2], [3, 4]], r: [180, 90, 270, 90, 270] },
    6: { m: [[0, 1], [2, 3], [4, 5]], r: [90, 270, 90, 270, 90, 270] },
  };
  // Querformat: Layout um 90° im Uhrzeigersinn drehen
  function rotateCW(m) {
    const R = m.length, C = m[0].length;
    return Array.from({ length: C }, (_, c) => Array.from({ length: R }, (_, r) => m[R - 1 - r][c]));
  }

  const COUNTERS = [
    { k: 'poison', name: 'Gift', icon: '☠', max: 10 },
    { k: 'tax', name: 'Commander-Steuer', icon: '⟳', step: 2 },
    { k: 'energy', name: 'Energie', icon: 'ϟ' },
    { k: 'exp', name: 'Erfahrung', icon: '✦' },
  ];

  let game = load();
  let landscape = false;
  let wakeLock = null;
  const pending = {}; // Spieler -> laufende Änderung (für die Delta-Anzeige)
  const timers = {};

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(game)); } catch { /* egal */ }
  }

  function newGame(n, startLife, keepPlayers) {
    const old = keepPlayers && game ? game.players : [];
    game = {
      n, startLife, startedAt: Date.now(), history: [],
      players: Array.from({ length: n }, (_, i) => ({
        name: old[i]?.name || `Spieler ${i + 1}`,
        theme: old[i]?.theme || THEMES[i % THEMES.length].id,
        art: old[i]?.art || '',
        artName: old[i]?.artName || '',
        life: startLife, poison: 0, tax: 0, energy: 0, exp: 0, cmd: {},
      })),
    };
    save();
  }

  const isDead = (p) => p.life <= 0 || p.poison >= 10 || Object.values(p.cmd).some((v) => v >= 21);

  // ---------------- Overlay aufbauen ----------------
  const root = document.createElement('div');
  root.id = 'life';
  root.className = 'life hidden';
  root.innerHTML = `<div class="life-grid"></div>
    <button type="button" class="life-hub" aria-label="Menü"><span></span></button>
    <div class="life-modal hidden" role="dialog" aria-modal="true"></div>`;
  document.body.appendChild(root);
  const grid = $('.life-grid', root);
  const modal = $('.life-modal', root);

  function render() {
    const L = LAYOUTS[game.n];
    landscape = innerWidth > innerHeight;
    const m = landscape ? rotateCW(L.m) : L.m;
    grid.style.gridTemplateAreas = m.map((row) => `"${row.map((i) => 'p' + i).join(' ')}"`).join(' ');
    grid.style.gridTemplateRows = `repeat(${m.length}, 1fr)`;
    grid.style.gridTemplateColumns = `repeat(${m[0].length}, 1fr)`;
    grid.innerHTML = game.players.map((p, i) => {
      const rot = (L.r[i] + (landscape ? 90 : 0)) % 360;
      return `<div class="ptile" style="grid-area:p${i}" data-p="${i}">
        <div class="pinner r${rot}" style="--tile:${tileBg(p)}">
          <div class="pbg" ${p.art ? `style="background-image:url('${esc(p.art)}')"` : ''}></div>
          <button type="button" class="zone minus" data-p="${i}" data-d="-1" aria-label="${esc(p.name)} −1"></button>
          <button type="button" class="zone plus" data-p="${i}" data-d="1" aria-label="${esc(p.name)} +1"></button>
          <span class="hint minus" aria-hidden="true">−</span><span class="hint plus" aria-hidden="true">+</span>
          <div class="ptop"><span class="pname">${esc(p.name)}</span><span class="pdelta"></span></div>
          <div class="plife" aria-live="polite"></div>
          <div class="pbadges"></div>
          <div class="pdead">✝</div>
          <button type="button" class="pmenu-btn" data-menu="${i}" aria-label="Zähler für ${esc(p.name)}">⋯</button>
          <div class="ppanel hidden"></div>
        </div>
      </div>`;
    }).join('');
    game.players.forEach((_, i) => update(i));
  }

  function update(i) {
    const p = game.players[i];
    const tile = grid.children[i];
    if (!tile) return;
    $('.plife', tile).textContent = p.life;
    tile.classList.toggle('dead', isDead(p));
    const badges = [];
    COUNTERS.forEach((c) => { if (p[c.k]) badges.push(`<span class="badge" title="${c.name}">${c.icon} ${p[c.k]}</span>`); });
    Object.entries(p.cmd).forEach(([from, v]) => {
      if (!v) return;
      const t = themeOf(game.players[from] || {});
      badges.push(`<span class="badge cmd" title="Commander-Schaden von ${esc(game.players[from]?.name)}"><i style="background:linear-gradient(145deg,${t.a},${t.b})"></i>${v}</span>`);
    });
    $('.pbadges', tile).innerHTML = badges.join('');
    const d = pending[i];
    const delta = $('.pdelta', tile);
    delta.textContent = d ? (d > 0 ? '+' + d : String(d)) : '';
    delta.classList.toggle('show', !!d);
    delta.classList.toggle('neg', d < 0);
  }

  function change(i, d, kind = 'life') {
    const p = game.players[i];
    p.life += d;
    pending[i] = (pending[i] || 0) + d;
    clearTimeout(timers[i]);
    timers[i] = setTimeout(() => {
      if (pending[i]) game.history.push({ t: Date.now(), p: i, d: pending[i], life: p.life, kind });
      if (game.history.length > 300) game.history.splice(0, game.history.length - 300);
      pending[i] = 0;
      update(i);
      save();
    }, 1600);
    update(i);
    save();
    navigator.vibrate?.(6);
  }

  // ---------------- Tippen / Halten ----------------
  grid.addEventListener('pointerdown', (e) => {
    const z = e.target.closest('.zone');
    if (!z) return;
    e.preventDefault();
    const i = +z.dataset.p, d = +z.dataset.d;
    let repeated = false;
    let hold = setTimeout(function rep() {
      repeated = true;
      change(i, d * 10);
      flash(z);
      hold = setTimeout(rep, 650);
    }, 480);
    const end = (apply) => {
      clearTimeout(hold);
      if (apply && !repeated) { change(i, d); flash(z); }
      z.removeEventListener('pointerup', up);
      z.removeEventListener('pointercancel', cancel);
      z.removeEventListener('pointerleave', cancel);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    z.addEventListener('pointerup', up);
    z.addEventListener('pointercancel', cancel);
    z.addEventListener('pointerleave', cancel);
  });
  grid.addEventListener('contextmenu', (e) => e.preventDefault());
  function flash(z) {
    z.classList.remove('pressed');
    void z.offsetWidth;
    z.classList.add('pressed');
  }

  // ---------------- Spieler-Panel (im gedrehten Feld) ----------------
  grid.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-menu]');
    if (mb) return openPanel(+mb.dataset.menu);
    const act = e.target.closest('[data-act]');
    if (act) panelAction(act);
  });

  function openPanel(i) {
    const tile = grid.children[i];
    const panel = $('.ppanel', tile);
    $$('.ppanel', grid).forEach((x) => x !== panel && x.classList.add('hidden'));
    panel.innerHTML = panelHtml(i);
    panel.classList.remove('hidden');
  }

  function stepper(i, key, val, label, extra = '') {
    return `<div class="prow"><span class="plabel">${label}</span>
      <button type="button" class="pstep" data-act="dec" data-p="${i}" data-k="${key}" aria-label="weniger">−</button>
      <span class="pval">${val}</span>
      <button type="button" class="pstep" data-act="inc" data-p="${i}" data-k="${key}" aria-label="mehr">+</button>${extra}</div>`;
  }

  function panelHtml(i) {
    const p = game.players[i];
    const others = game.players.map((o, j) => ({ o, j })).filter(({ j }) => j !== i);
    return `<div class="phead">
        <input class="pname-input" data-p="${i}" value="${esc(p.name)}" maxlength="24" aria-label="Name">
        <button type="button" class="pclose" data-act="close" aria-label="Schließen">✕</button>
      </div>
      <div class="pscroll">
        <h4>Commander-Schaden erhalten</h4>
        ${others.map(({ o, j }) => {
          const t = themeOf(o);
          return stepper(i, 'cmd:' + j, p.cmd[j] || 0, `<i class="dot" style="background:linear-gradient(145deg,${t.a},${t.b})"></i>${esc(o.name)}`);
        }).join('')}
        <h4>Zähler</h4>
        ${COUNTERS.map((c) => stepper(i, c.k, p[c.k], `${c.icon} ${c.name}`)).join('')}
        <h4>Farbe</h4>
        <div class="pswatches">${THEMES.map((t) => `<button type="button" class="swatch ${p.theme === t.id ? 'on' : ''}" data-act="theme" data-p="${i}" data-theme="${t.id}" style="background:linear-gradient(145deg,${t.a},${t.b})" aria-label="${t.id}"></button>`).join('')}</div>
        <h4>Commander-Bild</h4>
        <div class="part">
          <input class="part-input" data-p="${i}" list="life-art-list-${i}" placeholder="Commander suchen …" value="${esc(p.artName)}">
          <datalist id="life-art-list-${i}"></datalist>
          <button type="button" class="pbtn" data-act="art" data-p="${i}">Übernehmen</button>
          ${p.art ? `<button type="button" class="pbtn ghost" data-act="noart" data-p="${i}">Entfernen</button>` : ''}
        </div>
        <p class="pmsg" data-msg="${i}"></p>
      </div>`;
  }

  async function panelAction(el) {
    const i = +el.dataset.p;
    const p = game.players[i];
    const act = el.dataset.act;
    const panel = el.closest('.ppanel');
    if (act === 'close') { panel.classList.add('hidden'); return; }
    if (act === 'inc' || act === 'dec') {
      const k = el.dataset.k;
      const sign = act === 'inc' ? 1 : -1;
      if (k.startsWith('cmd:')) {
        const from = +k.slice(4);
        const cur = p.cmd[from] || 0;
        const next = Math.max(0, cur + sign);
        if (next !== cur) { p.cmd[from] = next; change(i, -(next - cur), 'cmd'); }
      } else {
        const c = COUNTERS.find((x) => x.k === k);
        p[k] = Math.max(0, p[k] + sign * (c.step || 1));
      }
      save();
      update(i);
      el.parentElement.querySelector('.pval').textContent = k.startsWith('cmd:') ? p.cmd[+k.slice(4)] : p[k];
      return;
    }
    if (act === 'theme') {
      p.theme = el.dataset.theme;
      save();
      $('.pinner', grid.children[i]).style.setProperty('--tile', tileBg(p));
      $$('.swatch', panel).forEach((s) => s.classList.toggle('on', s === el));
      // Farbpunkte bei den anderen aktualisieren
      game.players.forEach((_, j) => update(j));
      return;
    }
    if (act === 'noart') {
      p.art = ''; p.artName = '';
      save();
      $('.pbg', grid.children[i]).style.backgroundImage = '';
      openPanel(i);
      return;
    }
    if (act === 'art') {
      const name = $('.part-input', panel).value.trim();
      const msg = $(`[data-msg="${i}"]`, panel);
      if (!name) return;
      msg.textContent = 'Suche …';
      try {
        const card = await MTG.api.getCard(name);
        if (!card) { msg.textContent = 'Nicht gefunden.'; return; }
        p.art = MTG.cards.image(card, 'art_crop');
        p.artName = card.name;
        save();
        $('.pbg', grid.children[i]).style.backgroundImage = `url('${p.art}')`;
        msg.textContent = '✓ ' + card.name;
      } catch (err) {
        msg.textContent = 'Keine Verbindung – Bild nicht verfügbar.';
      }
    }
  }

  // Namen live speichern; Autocomplete für Commander-Bilder
  let acT;
  grid.addEventListener('input', (e) => {
    const n = e.target.closest('.pname-input');
    if (n) {
      const i = +n.dataset.p;
      game.players[i].name = n.value || `Spieler ${i + 1}`;
      $('.pname', grid.children[i]).textContent = game.players[i].name;
      save();
      return;
    }
    const a = e.target.closest('.part-input');
    if (a) {
      clearTimeout(acT);
      acT = setTimeout(async () => {
        try {
          const names = await MTG.api.autocomplete(a.value.trim());
          $(`#life-art-list-${a.dataset.p}`).innerHTML = names.map((x) => `<option value="${esc(x)}">`).join('');
        } catch { /* offline */ }
      }, 280);
    }
  });

  // ---------------- Hauptmenü ----------------
  $('.life-hub', root).addEventListener('click', () => openModal('menu'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) return closeModal();
    const b = e.target.closest('[data-m]');
    if (b) menuAction(b.dataset.m, b);
  });

  let clockT;
  function openModal(view, data) {
    modal.classList.remove('hidden');
    clearInterval(clockT);
    if (view === 'menu') {
      modal.innerHTML = `<div class="lm-card">
        <div class="lm-head"><div><div class="lm-kicker">Spielzeit</div><div class="lm-clock" id="lm-clock">0:00</div></div>
          <button type="button" class="lm-x" data-m="close" aria-label="Schließen">✕</button></div>
        <div class="lm-grid">
          <button type="button" data-m="d20"><b>W20</b><span>Würfeln</span></button>
          <button type="button" data-m="d6"><b>W6</b><span>Würfeln</span></button>
          <button type="button" data-m="coin"><b>◐</b><span>Münze</span></button>
          <button type="button" data-m="first"><b>☝</b><span>Startspieler</span></button>
          <button type="button" data-m="history"><b>↺</b><span>Verlauf</span></button>
          <button type="button" data-m="restart"><b>⟲</b><span>Neustart</span></button>
        </div>
        <div class="lm-result hidden" id="lm-result"></div>
        <div class="lm-section">
          <div class="lm-kicker">Neues Spiel</div>
          <div class="lm-chips" id="lm-n">${[2, 3, 4, 5, 6].map((n) => `<button type="button" class="${game.n === n ? 'on' : ''}" data-m="setn" data-v="${n}">${n}</button>`).join('')}<span>Spieler</span></div>
          <div class="lm-chips" id="lm-l">${[20, 30, 40].map((n) => `<button type="button" class="${game.startLife === n ? 'on' : ''}" data-m="setl" data-v="${n}">${n}</button>`).join('')}<span>Leben</span></div>
          <button type="button" class="lm-primary" data-m="new">Neues Spiel starten</button>
        </div>
        <div class="lm-foot">
          <button type="button" data-m="fullscreen">Vollbild</button>
          <button type="button" data-m="exit">Beenden</button>
        </div>
      </div>`;
      const tick = () => {
        const s = Math.floor((Date.now() - game.startedAt) / 1000);
        const el = $('#lm-clock');
        if (el) el.textContent = `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
      };
      tick();
      clockT = setInterval(tick, 1000);
    }
    if (view === 'history') {
      const items = [...game.history].reverse();
      modal.innerHTML = `<div class="lm-card">
        <div class="lm-head"><div><div class="lm-kicker">Spiel</div><div class="lm-title">Verlauf</div></div>
          <button type="button" class="lm-x" data-m="menu" aria-label="Zurück">←</button></div>
        <div class="lm-history">${items.length ? items.map((h) => {
          const p = game.players[h.p];
          if (!p) return '';
          const t = themeOf(p);
          return `<div class="lh-row"><i class="dot" style="background:linear-gradient(145deg,${t.a},${t.b})"></i>
            <span class="lh-name">${esc(p.name)}${h.kind === 'cmd' ? ' <small>Cmdr</small>' : ''}</span>
            <span class="lh-d ${h.d < 0 ? 'neg' : ''}">${h.d > 0 ? '+' : ''}${h.d}</span>
            <span class="lh-life">${h.life}</span>
            <span class="lh-t">${new Date(h.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span></div>`;
        }).join('') : '<p class="lm-empty">Noch keine Änderungen.</p>'}</div>
      </div>`;
    }
  }
  function closeModal() { modal.classList.add('hidden'); clearInterval(clockT); }

  let pickN = null, pickL = null;
  function showResult(html) {
    const r = $('#lm-result');
    if (!r) return;
    r.innerHTML = html;
    r.classList.remove('hidden');
    r.classList.remove('pop');
    void r.offsetWidth;
    r.classList.add('pop');
  }

  function menuAction(m, b) {
    const rnd = (n) => 1 + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * n);
    if (m === 'close') return closeModal();
    if (m === 'menu') return openModal('menu');
    if (m === 'history') return openModal('history');
    if (m === 'd20' || m === 'd6') {
      const n = m === 'd20' ? 20 : 6;
      let k = 0;
      const spin = setInterval(() => {
        showResult(`<b>${rnd(n)}</b><span>W${n}</span>`);
        if (++k > 8) { clearInterval(spin); const v = rnd(n); showResult(`<b>${v}</b><span>W${n}${n === 20 && v === 20 ? ' · Kritisch!' : ''}</span>`); }
      }, 55);
      return;
    }
    if (m === 'coin') return showResult(`<b>${rnd(2) === 1 ? 'Kopf' : 'Zahl'}</b><span>Münzwurf</span>`);
    if (m === 'first') {
      closeModal();
      const winner = rnd(game.n) - 1;
      const steps = 14 + game.n;
      // Start so wählen, dass der Lauf nach `steps` Schritten genau beim Gewinner endet
      let k = 0;
      let cur = (((winner - steps) % game.n) + game.n) % game.n;
      const run = () => {
        $$('.ptile', grid).forEach((t, i) => t.classList.toggle('spot', i === cur));
        if (k++ >= steps) {
          $$('.ptile', grid).forEach((t) => t.classList.remove('spot'));
          const t = grid.children[winner];
          t.classList.add('chosen');
          setTimeout(() => t.classList.remove('chosen'), 2600);
          return;
        }
        cur = (cur + 1) % game.n;
        setTimeout(run, 70 + k * 9);
      };
      run();
      return;
    }
    if (m === 'restart') {
      if (!confirm('Spiel mit denselben Spielern neu starten?')) return;
      newGame(game.n, game.startLife, true);
      closeModal();
      render();
      return;
    }
    if (m === 'setn' || m === 'setl') {
      const v = +b.dataset.v;
      if (m === 'setn') pickN = v; else pickL = v;
      $$(`#lm-${m === 'setn' ? 'n' : 'l'} button`).forEach((x) => x.classList.toggle('on', x === b));
      return;
    }
    if (m === 'new') {
      newGame(pickN || game.n, pickL || game.startLife, true);
      pickN = pickL = null;
      closeModal();
      render();
      return;
    }
    if (m === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen?.(); else root.requestFullscreen?.().catch(() => {});
      return;
    }
    if (m === 'exit') { closeModal(); close(); }
  }

  // ---------------- Öffnen / Schließen ----------------
  async function keepAwake() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } } catch { /* nicht unterstützt */ }
  }
  document.addEventListener('visibilitychange', () => { if (!root.classList.contains('hidden') && document.visibilityState === 'visible') keepAwake(); });

  function open({ n, life, resume } = {}) {
    if (!resume || !game) newGame(n || game?.n || 4, life || game?.startLife || 40, true);
    root.classList.remove('hidden');
    document.documentElement.classList.add('life-open');
    render();
    keepAwake();
    if (location.hash !== '#life') history.pushState({ life: 1 }, '', '#life');
  }
  function close(fromPop) {
    root.classList.add('hidden');
    document.documentElement.classList.remove('life-open');
    closeModal();
    wakeLock?.release?.();
    wakeLock = null;
    if (document.fullscreenElement) document.exitFullscreen?.();
    if (!fromPop && location.hash === '#life') history.back();
    window.dispatchEvent(new Event('life:closed'));
  }
  addEventListener('popstate', () => { if (location.hash !== '#life' && !root.classList.contains('hidden')) close(true); });

  let rT;
  addEventListener('resize', () => {
    if (root.classList.contains('hidden')) return;
    clearTimeout(rT);
    rT = setTimeout(() => { if ((innerWidth > innerHeight) !== landscape) render(); }, 120);
  });

  window.MTG = window.MTG || {};
  MTG.life = { open, close, hasGame: () => !!game, game: () => game };
})();
