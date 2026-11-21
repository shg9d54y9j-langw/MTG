/* Life Counter – Vollbild-Zähler für 2–6 Spieler
   mit Commander-Hintergründen, Animationen und wählbaren Zahlenschriften */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const KEY = 'cw:life';
  const SKEY = 'cw:life-settings';

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
  const FONTS = [
    { id: 'shoulders', name: 'Kantig' },
    { id: 'unbounded', name: 'Rund' },
    { id: 'cinzel', name: 'Episch' },
    { id: 'inter', name: 'Clean' },
  ];
  const themeOf = (p) => THEMES.find((t) => t.id === p.theme) || THEMES[0];
  const tileVars = (p) => { const t = themeOf(p); return `--tile:linear-gradient(145deg, ${t.a}, ${t.b});--ta:${t.a};--tb:${t.b}`; };
  const grad = (p) => { const t = themeOf(p); return `linear-gradient(145deg,${t.a},${t.b})`; };

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
    { k: 'poison', name: 'Gift', icon: '☠' },
    { k: 'tax', name: 'Commander-Steuer', icon: '⟳', step: 2 },
    { k: 'energy', name: 'Energie', icon: 'ϟ' },
    { k: 'exp', name: 'Erfahrung', icon: '✦' },
  ];

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } };

  let game = read(KEY, null);
  const settings = Object.assign({ font: 'shoulders', motion: true }, read(SKEY, {}));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = () => settings.motion && !reducedMotion.matches;
  let landscape = false;
  let wakeLock = null;
  const pending = {}; // Spieler -> laufende Änderung (Delta-Anzeige)
  const timers = {};
  const counting = {}; // Spieler -> laufende Hochzähl-Animation

  const save = () => write(KEY, game);
  const saveSettings = () => write(SKEY, settings);

  function newGame(n, startLife, keepPlayers) {
    const old = keepPlayers && game ? game.players : [];
    game = {
      n, startLife, startedAt: Date.now(), history: [], winner: null,
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
  const isLow = (p) => !isDead(p) && p.life <= Math.max(5, Math.round(game.startLife / 4));

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

  function applySettings() {
    FONTS.forEach((f) => root.classList.toggle('font-' + f.id, settings.font === f.id));
    root.classList.toggle('no-motion', !motion());
  }

  function render(intro) {
    applySettings();
    const L = LAYOUTS[game.n];
    landscape = innerWidth > innerHeight;
    const m = landscape ? rotateCW(L.m) : L.m;
    grid.style.gridTemplateAreas = m.map((row) => `"${row.map((i) => 'p' + i).join(' ')}"`).join(' ');
    grid.style.gridTemplateRows = `repeat(${m.length}, 1fr)`;
    grid.style.gridTemplateColumns = `repeat(${m[0].length}, 1fr)`;
    grid.innerHTML = game.players.map((p, i) => {
      const rot = (L.r[i] + (landscape ? 90 : 0)) % 360;
      return `<div class="ptile${intro && motion() ? ' intro' : ''}" style="grid-area:p${i};--d:${i * 80}ms" data-p="${i}" data-rot="${rot}">
        <div class="pinner r${rot}${p.art ? ' has-art' : ''}" style="${tileVars(p)}">
          <div class="pbg">${p.art ? `<div class="pbg-img in" style="background-image:url('${esc(p.art)}')"></div>` : ''}</div>
          <div class="pshade"></div>
          <div class="plow"></div>
          <div class="pflash"></div>
          <button type="button" class="zone minus" data-p="${i}" data-d="-1" aria-label="${esc(p.name)} −1"></button>
          <button type="button" class="zone plus" data-p="${i}" data-d="1" aria-label="${esc(p.name)} +1"></button>
          <span class="hint minus" aria-hidden="true">−</span><span class="hint plus" aria-hidden="true">+</span>
          <div class="ptop"><span class="pname">${esc(p.name)}</span><span class="pdelta"></span></div>
          <div class="plife-wrap"><div class="plife" aria-live="polite">${p.life}</div></div>
          <div class="pbadges"></div>
          <div class="pdead" aria-hidden="true"><span>Raus</span></div>
          <div class="pwin" aria-hidden="true"><span class="crown">♛</span><span>Sieg!</span></div>
          <button type="button" class="pmenu-btn" data-menu="${i}" aria-label="Zähler und Hintergrund für ${esc(p.name)}">⋯</button>
          <div class="ppanel hidden"></div>
        </div>
      </div>`;
    }).join('');
    game.players.forEach((_, i) => update(i));
    if (intro && motion()) game.players.forEach((p, i) => countUp(i, p.life, 900 + i * 80));
    if (game.winner != null) celebrate(game.winner, true);
  }

  const tileEl = (i) => grid.children[i];
  const lifeEl = (i) => $('.plife:not(.ghost)', tileEl(i));

  function update(i, dir) {
    const p = game.players[i];
    const tile = tileEl(i);
    if (!tile) return;
    const el = lifeEl(i);
    const old = el.textContent;
    if (counting[i]) { cancelAnimationFrame(counting[i]); counting[i] = 0; }
    el.textContent = p.life;
    if (dir && motion() && old !== String(p.life)) roll(el, old, dir);
    if (dir) flash(tile, dir);
    tile.classList.toggle('dead', isDead(p));
    tile.classList.toggle('low', isLow(p));
    const badges = [];
    COUNTERS.forEach((c) => { if (p[c.k]) badges.push(`<span class="badge${c.k === 'poison' && p.poison >= 7 ? ' hot' : ''}" title="${c.name}">${c.icon} ${p[c.k]}</span>`); });
    Object.entries(p.cmd).forEach(([from, v]) => {
      if (!v || !game.players[from]) return;
      badges.push(`<span class="badge cmd${v >= 15 ? ' hot' : ''}" title="Commander-Schaden von ${esc(game.players[from].name)}"><i style="background:${grad(game.players[from])}"></i>${v}</span>`);
    });
    $('.pbadges', tile).innerHTML = badges.join('');
    const d = pending[i];
    const delta = $('.pdelta', tile);
    delta.textContent = d ? (d > 0 ? '+' + d : String(d)) : '';
    delta.classList.toggle('show', !!d);
    delta.classList.toggle('neg', d < 0);
  }

  // Zahl rollt heraus/herein (Richtung je nach Vorzeichen)
  function roll(el, oldText, dir) {
    const wrap = el.parentElement;
    $$('.ghost', wrap).forEach((g) => g.remove());
    el.getAnimations().forEach((a) => a.cancel());
    const ghost = document.createElement('div');
    ghost.className = 'plife ghost';
    ghost.textContent = oldText;
    wrap.insertBefore(ghost, el);
    const up = dir > 0;
    ghost.animate(
      [{ transform: 'translateY(0) scale(1)', opacity: 1, filter: 'blur(0)' }, { transform: `translateY(${up ? '-' : ''}32%) scale(.92)`, opacity: 0, filter: 'blur(4px)' }],
      { duration: 240, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }
    ).onfinish = () => ghost.remove();
    el.animate(
      [{ transform: `translateY(${up ? '' : '-'}32%) scale(.92)`, opacity: 0, filter: 'blur(4px)' }, { transform: 'translateY(0) scale(1.04)', opacity: 1, filter: 'blur(0)', offset: 0.7 }, { transform: 'none', opacity: 1, filter: 'blur(0)' }],
      { duration: 340, easing: 'cubic-bezier(.2,.9,.3,1.2)' }
    );
  }

  function flash(tile, dir) {
    if (!motion()) return;
    const f = $('.pflash', tile);
    f.className = 'pflash ' + (dir > 0 ? 'up' : 'down');
    f.getAnimations().forEach((a) => a.cancel());
    f.animate([{ opacity: 0.38 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
  }

  // Beim Spielstart von 0 hochzählen
  function countUp(i, target, duration) {
    const el = lifeEl(i);
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * e);
      if (k < 1) counting[i] = requestAnimationFrame(step);
      else { counting[i] = 0; el.textContent = game.players[i].life; }
    };
    counting[i] = requestAnimationFrame(step);
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
    update(i, Math.sign(d));
    checkWinner();
    save();
    navigator.vibrate?.(6);
  }

  // ---------------- Sieg ----------------
  function checkWinner() {
    const alive = game.players.map((p, i) => (isDead(p) ? -1 : i)).filter((i) => i >= 0);
    if (game.n > 1 && alive.length === 1) {
      if (game.winner !== alive[0]) { game.winner = alive[0]; celebrate(alive[0]); save(); }
    } else if (game.winner != null) {
      game.winner = null;
      $$('.ptile.won', grid).forEach((t) => t.classList.remove('won'));
      save();
    }
  }

  function celebrate(i, quiet) {
    const tile = tileEl(i);
    if (!tile) return;
    tile.classList.add('won');
    if (quiet || !motion()) return;
    navigator.vibrate?.([30, 60, 30, 60, 80]);
    confetti($('.pinner', tile), 46);
  }

  function confetti(host, n) {
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#fff', '#facc15', '#f472b6', '#60a5fa', '#34d399', '#a78bfa', '#fb923c'];
    box.innerHTML = Array.from({ length: n }, () => {
      const x = (Math.random() * 2 - 1) * 60;
      const y = -(30 + Math.random() * 55);
      return `<i style="--x:${x}cqmin;--y:${y}cqmin;--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${colors[Math.floor(Math.random() * colors.length)]};--s:${0.6 + Math.random() * 0.9};--t:${900 + Math.random() * 900}ms"></i>`;
    }).join('');
    host.appendChild(box);
    setTimeout(() => box.remove(), 2200);
  }

  // ---------------- Tippen / Halten ----------------
  grid.addEventListener('pointerdown', (e) => {
    const z = e.target.closest('.zone');
    if (!z) return;
    e.preventDefault();
    ripple(z, e);
    const i = +z.dataset.p, d = +z.dataset.d;
    let repeated = false;
    let hold = setTimeout(function rep() {
      repeated = true;
      change(i, d * 10);
      ripple(z, e, true);
      hold = setTimeout(rep, 650);
    }, 480);
    const end = (apply) => {
      clearTimeout(hold);
      if (apply && !repeated) change(i, d);
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

  function ripple(z, e, big) {
    if (!motion()) return;
    const r = document.createElement('span');
    r.className = 'ripple' + (big ? ' big' : '');
    const x = e.offsetX || z.clientWidth / 2;
    const y = e.offsetY || z.clientHeight / 2;
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    z.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  }

  // ---------------- Hintergrundbild ----------------
  function setArt(i, url) {
    const p = game.players[i];
    const tile = tileEl(i);
    const inner = $('.pinner', tile);
    const bg = $('.pbg', tile);
    inner.classList.toggle('has-art', !!url);
    if (!url) { $$('.pbg-img', bg).forEach((x) => { x.classList.remove('in'); setTimeout(() => x.remove(), 600); }); return; }
    const layer = document.createElement('div');
    layer.className = 'pbg-img';
    layer.style.backgroundImage = `url('${url}')`;
    bg.appendChild(layer);
    const img = new Image();
    const show = () => {
      requestAnimationFrame(() => layer.classList.add('in'));
      $$('.pbg-img', bg).forEach((x) => x !== layer && setTimeout(() => x.remove(), 700));
    };
    img.onload = show;
    img.onerror = show;
    img.src = url;
    p.art = url;
    save();
  }

  // Beliebte Commander einmal laden und merken
  let popular = null;
  async function popularCommanders() {
    if (!popular) popular = MTG.api.search('is:commander f:commander -is:digital', { order: 'edhrec' }).then((l) => l.slice(0, 24)).catch((e) => { popular = null; throw e; });
    return popular;
  }

  function thumbs(list, i, act) {
    const cur = game.players[i].art;
    return list.map((c) => {
      const art = MTG.cards.image(c, 'art_crop');
      if (!art) return '';
      return `<button type="button" class="pthumb${art === cur ? ' on' : ''}" data-act="${act}" data-p="${i}" data-name="${esc(c.name)}" data-art="${esc(art)}" title="${esc(c.name)}${c.artist ? ' · Art: ' + esc(c.artist) : ''}">
        <img loading="lazy" src="${esc(art)}" alt=""><span>${act === 'alt' ? esc(c.set_name || '') : esc(c.name.split(' // ')[0])}</span></button>`;
    }).join('');
  }

  // Großes Auswahlfenster, zum jeweiligen Spieler gedreht
  function openPicker(i) {
    const p = game.players[i];
    const rot = +tileEl(i).dataset.rot || 0;
    clearInterval(clockT);
    modal.classList.remove('hidden');
    modal.innerHTML = `<div class="lm-card picker" data-rot="${rot}" style="--rot:${rot}deg" data-picker="${i}">
      <div class="lm-head"><div><div class="lm-kicker">Hintergrund für ${esc(p.name)}</div><div class="lm-title">Commander wählen</div></div>
        <button type="button" class="lm-x" data-act="pclose" aria-label="Fertig">✓</button></div>
      <div class="pk-search">
        <input class="pk-input" data-p="${i}" placeholder="Commander suchen, z. B. Atraxa" autocomplete="off" enterkeyhint="search">
        <button type="button" class="pk-dice" data-act="random" data-p="${i}" title="Zufälliger Commander" aria-label="Zufälliger Commander">🎲</button>
      </div>
      <div class="pk-current" data-wall-current>${p.artName ? `Aktuell: <b>${esc(p.artName)}</b>` : 'Noch kein Hintergrund gewählt'}</div>
      <div class="pwall-arts hidden" data-wall-arts="${i}"></div>
      <div class="pwall-label" data-wall-label="${i}">Beliebte Commander</div>
      <div class="pwall-grid" data-wall-grid="${i}"></div>
      <div class="lm-foot">
        <button type="button" data-act="noart" data-p="${i}" class="${p.art ? '' : 'hidden'}">Bild entfernen</button>
        <button type="button" data-act="pclose" class="lm-primary">Fertig</button>
      </div>
    </div>`;
    showWall(i, '');
    if (p.artName) showArts(i, p.artName);
  }

  async function showWall(i, query) {
    const gridBox = $(`[data-wall-grid="${i}"]`, modal);
    const label = $(`[data-wall-label="${i}"]`, modal);
    if (!gridBox) return;
    gridBox.innerHTML = '<div class="pwall-loading"><span></span><span></span><span></span></div>';
    try {
      let list;
      if (query) {
        const q = query.replace(/["()]/g, ' ').trim();
        list = (await MTG.api.search(`is:commander f:commander -is:digital ${q}`, { order: 'edhrec' })).slice(0, 24);
        label.textContent = list.length ? `${list.length}${list.length === 24 ? '+' : ''} Treffer` : 'Keine Treffer';
      } else {
        list = await popularCommanders();
        label.textContent = 'Beliebte Commander';
      }
      gridBox.innerHTML = thumbs(list, i, 'pick') || '';
    } catch {
      gridBox.innerHTML = '<p class="pmsg">Keine Verbindung – Bilder brauchen Internet.</p>';
    }
  }

  async function showArts(i, name) {
    const box = $(`[data-wall-arts="${i}"]`, modal);
    if (!box) return;
    box.classList.add('hidden');
    try {
      const arts = await MTG.api.search(`!"${name.replace(/"/g, '')}" -is:digital`, { order: 'released', unique: 'art' });
      if (arts.length > 1) {
        box.innerHTML = `<div class="pwall-label">${arts.length} Artworks von ${esc(name.split(' // ')[0])}</div><div class="pwall-strip">${thumbs(arts, i, 'alt')}</div>`;
        box.classList.remove('hidden');
      }
    } catch { /* offline */ }
  }

  function pick(i, name, art) {
    const p = game.players[i];
    p.artName = name;
    setArt(i, art);
    $$('.pthumb', modal).forEach((t) => t.classList.toggle('on', t.dataset.art === art));
    $('[data-act="noart"]', modal)?.classList.remove('hidden');
    const cur = $('[data-wall-current]', modal);
    if (cur) cur.innerHTML = `Aktuell: <b>${esc(name)}</b>`;
  }

  async function pickerAction(el) {
    const i = +el.dataset.p;
    const act = el.dataset.act;
    if (act === 'pclose') return closeModal();
    if (act === 'pick' || act === 'alt') {
      pick(i, el.dataset.name, el.dataset.art);
      if (act === 'pick') showArts(i, el.dataset.name);
      return;
    }
    if (act === 'random') {
      el.classList.add('spin');
      try {
        const c = await MTG.api.random('is:commander f:commander -is:digital');
        if (c) { pick(i, c.name, MTG.cards.image(c, 'art_crop')); showArts(i, c.name); }
      } catch { /* offline */ }
      el.classList.remove('spin');
      return;
    }
    if (act === 'noart') {
      const p = game.players[i];
      p.art = ''; p.artName = '';
      save();
      setArt(i, '');
      el.classList.add('hidden');
      $$('.pthumb', modal).forEach((t) => t.classList.remove('on'));
      $(`[data-wall-arts="${i}"]`, modal)?.classList.add('hidden');
      const cur = $('[data-wall-current]', modal);
      if (cur) cur.textContent = 'Noch kein Hintergrund gewählt';
    }
  }

  // ---------------- Spieler-Panel (im gedrehten Feld) ----------------
  grid.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-menu]');
    if (mb) return openPanel(+mb.dataset.menu);
    const act = e.target.closest('[data-act]');
    if (act) panelAction(act);
  });

  function openPanel(i) {
    const panel = $('.ppanel', tileEl(i));
    $$('.ppanel', grid).forEach((x) => x !== panel && x.classList.add('hidden'));
    panel.innerHTML = panelHtml(i);
    panel.classList.remove('hidden');
  }

  function stepper(i, key, val, label) {
    return `<div class="prow"><span class="plabel">${label}</span>
      <button type="button" class="pstep" data-act="dec" data-p="${i}" data-k="${key}" aria-label="weniger">−</button>
      <span class="pval">${val}</span>
      <button type="button" class="pstep" data-act="inc" data-p="${i}" data-k="${key}" aria-label="mehr">+</button></div>`;
  }

  function panelHtml(i) {
    const p = game.players[i];
    const others = game.players.map((o, j) => ({ o, j })).filter(({ j }) => j !== i);
    return `<div class="phead">
        <input class="pname-input" data-p="${i}" value="${esc(p.name)}" maxlength="24" aria-label="Name">
        <button type="button" class="pclose" data-act="close" aria-label="Schließen">✕</button>
      </div>
      <div class="pscroll">
        <h4>Hintergrund</h4>
        <button type="button" class="pwall-open" data-act="wall" data-p="${i}">
          <span class="pwall-prev"${p.art ? ` style="background-image:url('${esc(p.art)}')"` : ''}></span>
          <span class="pwall-txt"><b>${p.artName ? esc(p.artName) : 'Commander-Hintergrund'}</b><small>${p.art ? 'Ändern oder anderes Artwork' : 'Jeder Commander, alle Artworks'}</small></span>
          <span class="pwall-arrow">›</span>
        </button>
        <h4>Commander-Schaden erhalten</h4>
        ${others.map(({ o, j }) => stepper(i, 'cmd:' + j, p.cmd[j] || 0, `<i class="dot" style="background:${grad(o)}"></i>${esc(o.name)}`)).join('')}
        <h4>Zähler</h4>
        ${COUNTERS.map((c) => stepper(i, c.k, p[c.k], `${c.icon} ${c.name}`)).join('')}
        <h4>Farbe</h4>
        <div class="pswatches">${THEMES.map((t) => `<button type="button" class="swatch ${p.theme === t.id ? 'on' : ''}" data-act="theme" data-p="${i}" data-theme="${t.id}" style="background:linear-gradient(145deg,${t.a},${t.b})" aria-label="Farbe ${t.id}"></button>`).join('')}</div>
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
        update(i);
        checkWinner();
      }
      save();
      const val = el.parentElement.querySelector('.pval');
      val.textContent = k.startsWith('cmd:') ? p.cmd[+k.slice(4)] : p[k];
      if (motion()) val.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
      return;
    }
    if (act === 'theme') {
      p.theme = el.dataset.theme;
      save();
      $('.pinner', tileEl(i)).setAttribute('style', tileVars(p));
      $$('.swatch', panel).forEach((s) => s.classList.toggle('on', s === el));
      game.players.forEach((_, j) => update(j));
      return;
    }
    if (act === 'wall') {
      panel.classList.add('hidden');
      openPicker(i);
    }
  }

  // Namen live speichern; Commander-Suche mit Verzögerung
  let searchT;
  grid.addEventListener('input', (e) => {
    const n = e.target.closest('.pname-input');
    if (n) {
      const i = +n.dataset.p;
      game.players[i].name = n.value || `Spieler ${i + 1}`;
      $('.pname', tileEl(i)).textContent = game.players[i].name;
      save();
      return;
    }
  });
  modal.addEventListener('input', (e) => {
    const w = e.target.closest('.pk-input');
    if (!w) return;
    clearTimeout(searchT);
    searchT = setTimeout(() => showWall(+w.dataset.p, w.value.trim()), 380);
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest('.pk-input')) e.target.blur();
  });

  // ---------------- Hauptmenü ----------------
  $('.life-hub', root).addEventListener('click', () => openModal('menu'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) return closeModal();
    const a = e.target.closest('[data-act]');
    if (a) return pickerAction(a);
    const b = e.target.closest('[data-m]');
    if (b) menuAction(b.dataset.m, b);
  });

  let clockT;
  function openModal(view) {
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
          <div class="lm-kicker">Zahlenschrift</div>
          <div class="lm-fonts">${FONTS.map((f) => `<button type="button" class="font-${f.id}${settings.font === f.id ? ' on' : ''}" data-m="font" data-v="${f.id}"><b>40</b><span>${f.name}</span></button>`).join('')}</div>
          <label class="lm-switch"><input type="checkbox" data-m="motion" ${settings.motion ? 'checked' : ''}><span></span>Animationen</label>
        </div>
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
        const h = Math.floor(s / 3600);
        const el = $('#lm-clock');
        if (el) el.textContent = `${h ? h + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
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
          return `<div class="lh-row"><i class="dot" style="background:${grad(p)}"></i>
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
  function showResult(html, cls = '') {
    const r = $('#lm-result');
    if (!r) return;
    r.innerHTML = html;
    r.className = 'lm-result ' + cls;
    void r.offsetWidth;
    r.classList.add('pop');
  }

  // Zufallszahl 1..n (kryptografisch, gleichverteilt)
  const rnd = (n) => 1 + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * n);

  modal.addEventListener('change', (e) => {
    if (e.target.matches('[data-m="motion"]')) {
      settings.motion = e.target.checked;
      saveSettings();
      applySettings();
    }
  });

  function menuAction(m, b) {
    if (m === 'close') return closeModal();
    if (m === 'menu') return openModal('menu');
    if (m === 'history') return openModal('history');
    if (m === 'motion') return; // über 'change'
    if (m === 'd20' || m === 'd6') {
      const n = m === 'd20' ? 20 : 6;
      const finish = () => {
        const v = rnd(n);
        const crit = n === 20 && v === 20, fail = n === 20 && v === 1;
        showResult(`<b>${v}</b><span>W${n}${crit ? ' · Kritischer Treffer!' : fail ? ' · Patzer!' : ''}</span>`, crit ? 'crit' : fail ? 'fail' : '');
        if (crit && motion()) confetti($('#lm-result'), 40);
      };
      if (!motion()) return finish();
      let k = 0;
      const spin = setInterval(() => {
        showResult(`<b class="rolling">${rnd(n)}</b><span>W${n}</span>`);
        if (++k > 9) { clearInterval(spin); finish(); }
      }, 60);
      return;
    }
    if (m === 'coin') {
      const heads = rnd(2) === 1;
      showResult(`<b class="coin">${heads ? 'Kopf' : 'Zahl'}</b><span>Münzwurf</span>`, 'coin-flip');
      return;
    }
    if (m === 'first') {
      closeModal();
      const winner = rnd(game.n) - 1;
      const steps = motion() ? 14 + game.n : 0;
      let k = 0;
      let cur = (((winner - steps) % game.n) + game.n) % game.n;
      const run = () => {
        $$('.ptile', grid).forEach((t, i) => t.classList.toggle('spot', i === cur));
        if (k++ >= steps) {
          $$('.ptile', grid).forEach((t) => t.classList.remove('spot'));
          const t = tileEl(winner);
          t.classList.add('chosen');
          setTimeout(() => t.classList.remove('chosen'), 2800);
          return;
        }
        cur = (cur + 1) % game.n;
        setTimeout(run, 70 + k * 9);
      };
      run();
      return;
    }
    if (m === 'font') {
      settings.font = b.dataset.v;
      saveSettings();
      applySettings();
      $$('.lm-fonts button', modal).forEach((x) => x.classList.toggle('on', x === b));
      return;
    }
    if (m === 'restart') {
      if (!confirm('Spiel mit denselben Spielern neu starten?')) return;
      newGame(game.n, game.startLife, true);
      closeModal();
      render(true);
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
      render(true);
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
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      }
    } catch { /* nicht unterstützt */ }
  }
  document.addEventListener('visibilitychange', () => { if (!root.classList.contains('hidden') && document.visibilityState === 'visible') keepAwake(); });

  function open({ n, life, resume } = {}) {
    const fresh = !resume || !game;
    if (fresh) newGame(n || game?.n || 4, life || game?.startLife || 40, true);
    root.classList.remove('hidden');
    document.documentElement.classList.add('life-open');
    render(true);
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
    rT = setTimeout(() => { if ((innerWidth > innerHeight) !== landscape) render(false); }, 120);
  });
  reducedMotion.addEventListener?.('change', applySettings);

  window.MTG = window.MTG || {};
  MTG.life = { open, close, hasGame: () => !!game, game: () => game };
})();
