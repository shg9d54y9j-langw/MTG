/* UI-Logik */
(() => {
  const { data: D, cards: C, engine: E, api } = MTG;
  const PRECONS = window.MTG_PRECONS || [];
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cw:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('cw:' + k, JSON.stringify(v)); } catch { /* ignorieren */ } },
  };

  const state = {
    cur: store.get('cur', 'eur'),
    anThemes: new Set(),
    wz: { colors: new Set(), bracket: 2, themes: new Set(), budget: 'mid' },
    pc: { query: '', colors: new Set(), sort: 'new', shown: 24, current: null, r: null },
  };
  const fmt = (v, cur = state.cur) => E.fmt(v, cur);
  const capLabel = (v) => (isFinite(v) ? `≤ ${fmt(v)}` : 'Kein Limit');

  // ---------------- Tabs ----------------
  const indicator = $('.tab-indicator');
  function moveIndicator() {
    const a = $('.tab-btn.active');
    if (!a) return;
    indicator.style.width = a.offsetWidth + 'px';
    indicator.style.transform = `translateX(${a.offsetLeft}px)`;
  }
  function showTab(name) {
    $$('.tab-btn').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    store.set('tab', name);
    moveIndicator();
  }
  $$('.tab-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  addEventListener('resize', moveIndicator);
  document.fonts?.ready.then(moveIndicator);
  showTab(store.get('tab', 'analyze'));

  // ---------------- Währung ----------------
  const curSel = $('#currency');
  curSel.value = state.cur;
  curSel.addEventListener('change', () => {
    state.cur = curSel.value;
    store.set('cur', state.cur);
    fillCaps();
    renderBudgets();
  });

  // ---------------- Formular-Elemente ----------------
  $$('.bracket-select').forEach((sel) => {
    sel.innerHTML = D.BRACKETS.map((b) => `<option value="${b.n}">${b.n} – ${esc(b.name)}</option>`).join('');
    sel.value = sel.id === 'pc-bracket' ? '2' : '3';
  });
  function fillCaps() {
    $$('.cap-select').forEach((sel) => {
      const prev = sel.value || (sel.id === 'pc-cap' ? '3' : '0');
      sel.innerHTML = D.CARD_CAPS.map((v, i) => `<option value="${i}">${esc(capLabel(v))}</option>`).join('');
      sel.value = prev;
    });
  }
  fillCaps();

  function themeChips(container, set, typalInput, max) {
    container.innerHTML = D.THEMES.map((t) => `<button type="button" class="chip" data-id="${t.id}">${esc(t.name)}</button>`).join('');
    container.addEventListener('click', (ev) => {
      const b = ev.target.closest('.chip');
      if (!b) return;
      const id = b.dataset.id;
      if (set.has(id)) set.delete(id);
      else {
        if (max && set.size >= max) return flash(container, `Maximal ${max} Themes.`);
        set.add(id);
      }
      b.classList.toggle('on', set.has(id));
      typalInput.classList.toggle('hidden', !set.has('typal'));
    });
  }
  themeChips($('#an-themes'), state.anThemes, $('#an-typal'), 0);
  themeChips($('#wz-themes'), state.wz.themes, $('#wz-typal'), 3);

  function flash(el, msg) {
    const n = document.createElement('div');
    n.className = 'status error';
    n.textContent = msg;
    el.after(n);
    setTimeout(() => n.remove(), 1800);
  }

  // Farben (Assistent)
  const colorBox = $('#wz-colors');
  colorBox.innerHTML = D.COLORS.map((c) => `<button type="button" class="mana-btn ${c.k}" data-k="${c.k}">${c.k.toUpperCase()}<span>${esc(c.name)}</span></button>`).join('');
  colorBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('.mana-btn');
    if (!b) return;
    const k = b.dataset.k;
    state.wz.colors.has(k) ? state.wz.colors.delete(k) : state.wz.colors.add(k);
    b.classList.toggle('on', state.wz.colors.has(k));
  });

  // Brackets (Assistent)
  const bBox = $('#wz-brackets');
  bBox.innerHTML = D.BRACKETS.map((b) => `<button type="button" class="option" data-n="${b.n}"><strong>${b.n} · ${esc(b.name)}</strong><small>${esc(b.desc)}</small></button>`).join('');
  const setBracket = (n) => { state.wz.bracket = n; $$('.option', bBox).forEach((o) => o.classList.toggle('on', +o.dataset.n === n)); };
  bBox.addEventListener('click', (ev) => { const o = ev.target.closest('.option'); if (o) setBracket(+o.dataset.n); });
  setBracket(2);

  // Budget (Assistent)
  const budBox = $('#wz-budget');
  function renderBudgets() {
    budBox.innerHTML = D.BUDGETS.map((b) => {
      const desc = isFinite(b.perCard) ? `≤ ${fmt(b.perCard)} pro Karte · ~${fmt(b.total)} gesamt` : b.desc;
      return `<button type="button" class="option ${state.wz.budget === b.id ? 'on' : ''}" data-id="${b.id}"><strong>${esc(b.name)}</strong><small>${esc(desc)}</small></button>`;
    }).join('');
  }
  budBox.addEventListener('click', (ev) => {
    const o = ev.target.closest('.option');
    if (!o) return;
    state.wz.budget = o.dataset.id;
    $$('.option', budBox).forEach((x) => x.classList.toggle('on', x === o));
  });
  renderBudgets();

  // Autocomplete
  function autocomplete(input, list) {
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        try {
          const names = await api.autocomplete(input.value.trim());
          list.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
        } catch { /* egal */ }
      }, 300);
    });
  }
  autocomplete($('#cmdr-input'), $('#cmdr-suggest'));
  autocomplete($('#wz-cmdr'), $('#wz-cmdr-suggest'));

  const deckArea = $('#decklist');
  deckArea.value = store.get('decklist', '');
  deckArea.addEventListener('input', () => store.set('decklist', deckArea.value));

  // ---------------- Hover-Vorschau ----------------
  const preview = $('#card-preview');
  const canHover = matchMedia('(hover: hover)').matches;
  document.addEventListener('mouseover', (ev) => {
    const el = ev.target.closest('[data-img]');
    if (!canHover || !el || !el.dataset.img) return;
    preview.innerHTML = `<img src="${esc(el.dataset.img)}" alt="">`;
    preview.style.display = 'block';
  });
  document.addEventListener('mouseout', (ev) => { if (ev.target.closest('[data-img]')) preview.style.display = 'none'; });
  document.addEventListener('mousemove', (ev) => {
    if (preview.style.display !== 'block') return;
    const w = 265, h = 355;
    let x = ev.clientX + 22, y = ev.clientY - h / 2;
    if (x + w > innerWidth) x = ev.clientX - w - 12;
    y = Math.max(10, Math.min(innerHeight - h - 10, y));
    preview.style.left = x + 'px';
    preview.style.top = y + 'px';
  });

  // ---------------- Render-Helfer ----------------
  const pips = (id) => (id && id.length ? [...id] : ['c']).map((k) => `<span class="pip ${k}" title="${k.toUpperCase()}"></span>`).join('');
  const roleTags = (tags) => ['ramp', 'draw', 'removal', 'counter', 'wipe', 'tutor', 'theme']
    .filter((k) => tags && tags.has(k)).map((k) => `<span class="tag">${esc(D.CATEGORY_NAMES[k])}</span>`).join(' ');

  function cardItem(card, { cls = '', why = '', price, check, cur = state.cur } = {}) {
    const p = price !== undefined ? price : C.price(card, cur);
    const gc = C.isGameChanger(card) ? ' <span class="tag gc">Game Changer</span>' : '';
    const cb = check ? `<input type="checkbox" class="pick" data-kind="${check}" data-name="${esc(card.name)}" title="Für neue Liste übernehmen">` : '';
    return `<div class="citem ${cls}">
      <img loading="lazy" src="${esc(C.image(card, 'small'))}" alt="" data-img="${esc(C.image(card))}">
      <div class="meta">
        <a class="name" href="${esc(card.scryfall_uri || '#')}" target="_blank" rel="noopener" data-img="${esc(C.image(card))}">${esc(card.name)}</a>
        <div class="why">${why}${gc}</div>
      </div>
      <div class="price">${fmt(p, cur)}</div>
      ${cb}
    </div>`;
  }

  function setStatus(el, msg, kind) {
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function statBox(k, v, target, opts = {}) {
    let cls = '';
    let bar = '';
    if (target != null) {
      const lo = opts.lo ?? target - 1, hi = opts.hi ?? Infinity;
      cls = v >= lo && v <= hi ? 'good' : v >= target - 3 ? 'warn' : 'bad';
      bar = `<span class="bar" style="width:${Math.min(100, (v / target) * 100)}%"></span>`;
    }
    return `<div class="stat ${cls}"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div>${target != null ? `<div class="t">Richtwert ${target}</div>` : ''}${bar}</div>`;
  }

  function addWhy(c, themes) {
    const bits = [];
    if (c.edh) bits.push(`${Math.round(c.edh.inclusion * 100)} % der Decks` + (c.edh.synergy > 0.05 ? ` · +${Math.round(c.edh.synergy * 100)} % Synergie` : ''));
    const th = C.themeMatches(c.card, themes || []);
    if (th.length) bits.push('Theme: ' + th.map((t) => t.name).join(', '));
    return esc(bits.join(' · ')) + ' ' + roleTags(c.tags);
  }

  // ---------------- Analyse-Ansicht (wiederverwendbar) ----------------
  function analysisHeader(r, kicker) {
    const T = D.TARGETS;
    const id = E.identityOf(r.commanders);
    const maxCurve = Math.max(1, ...r.curve);
    const estName = D.BRACKETS.find((b) => b.n === r.bracketEstimate)?.name || '';
    const bracketCls = r.bracketEstimate > r.rules.n ? 'bad' : 'good';
    return `<section class="panel card-section">
      <div class="cmdr-head">
        ${r.commanders.map((c) => `<img src="${esc(C.image(c))}" alt="${esc(c.name)}" data-img="${esc(C.image(c, 'large'))}">`).join('')}
        <div class="info">
          ${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}
          <h2>${r.commanders.map((c) => esc(c.name)).join(' & ')}</h2>
          <div class="tags">${pips(id)} <span class="tag">${r.deckSize} Karten</span> <span class="tag">Ø Manawert ${r.avgCmc.toFixed(2)}</span>
            <span class="tag ${bracketCls}">Bracket ≈ ${r.bracketEstimate} (${esc(estName)})</span>
            <span class="tag ${r.gcs.length > r.rules.maxGC ? 'bad' : 'gc'}">${r.gcs.length} Game Changer</span>
            ${r.themes.map((t) => `<span class="tag accent">${esc(t.name)}</span>`).join(' ')}
            ${r.edhrecUsed ? '<span class="tag good">EDHREC-Daten</span>' : '<span class="tag">nur Scryfall</span>'}</div>
          <div class="stats">
            ${statBox('Länder', r.counts.land, T.lands, { lo: 35, hi: 39 })}
            ${statBox('Rampe', r.counts.ramp, T.ramp)}
            ${statBox('Kartenvorteil', r.counts.draw, T.draw)}
            ${statBox('Interaktion', r.interaction, T.interaction)}
            ${statBox('Board Wipes', r.counts.wipe, T.wipe, { lo: 2 })}
            ${statBox('Kreaturen', r.counts.creature)}
            <div class="stat"><div class="v">${fmt(r.totalPrice, r.cur)}</div><div class="k">Deckpreis</div>${r.unknownPrices ? `<div class="t">${r.unknownPrices} ohne Preis</div>` : ''}</div>
          </div>
          ${r.issues.length ? `<ul class="issues">${r.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
          ${r.gcs.length ? `<p class="sub" style="margin:12px 0 0">Game Changer: ${r.gcs.map(esc).join(', ')}</p>` : ''}
        </div>
      </div>
      <h3 style="margin-top:26px">Manakurve</h3>
      <div class="curve">${r.curve.map((n, i) => `<div class="bar"><span class="n">${n}</span><div class="fill" style="height:${(n / maxCurve) * 78}%;animation-delay:${i * 0.04}s"></div><span class="x">${i === 7 ? '7+' : i}</span></div>`).join('')}</div>
    </section>`;
  }

  function analysisBody(r) {
    const cur = r.cur;
    let html = `<section class="panel card-section">
      <h3>Empfohlene Cuts ${r.mustCut ? `<span class="tag bad">${r.mustCut} Karte(n) müssen raus</span>` : ''}</h3>
      <p class="sub">Sortiert nach Priorität – oben zuerst prüfen. Haken setzen, um die Karte aus der neuen Liste zu nehmen.</p>
      <div class="clist">${r.cuts.map((c) => cardItem(c.card, { cls: 'cut', check: 'cut', price: c.price, cur, why: esc(c.reasons.join(' · ')) })).join('')}</div>
    </section>`;

    html += `<section class="panel card-section"><h3>Empfohlene Adds</h3>`;
    r.deficitAdds.forEach((d) => {
      html += `<div class="deficit"><h4>${esc(d.label)} <span class="tag warn">${d.have} / ${d.target}</span></h4>
        <div class="clist">${d.cards.map((c) => cardItem(c.card, { cls: 'add', check: 'add', price: c.price, cur, why: addWhy(c, r.themes) })).join('') || '<p class="sub">Keine passenden Karten im Budget gefunden.</p>'}</div></div>`;
    });
    html += `<div class="deficit"><h4>Synergie &amp; Staples für deinen Commander</h4>
      <div class="clist">${r.synergyAdds.map((c) => cardItem(c.card, { cls: 'add', check: 'add', price: c.price, cur, why: addWhy(c, r.themes) })).join('') || '<p class="sub">Keine Vorschläge gefunden.</p>'}</div></div>
    </section>`;

    if (r.swaps.length) {
      html += `<section class="panel card-section"><h3>Budget-Alternativen</h3><p class="sub">Karten über deinem Preislimit und günstigere Ersatzkarten mit ähnlicher Rolle.</p>`;
      r.swaps.forEach((s) => {
        html += `<div class="swap">${cardItem(s.from.card, { cls: 'cut', price: s.from.price, cur, why: esc(D.CATEGORY_NAMES[s.role] || '') })}
          <span class="arrow">→</span>
          ${s.to ? cardItem(s.to.card, { cls: 'add', price: s.to.price, cur, why: addWhy(s.to, r.themes) }) : '<div class="citem"><span class="why">Keine günstige Alternative gefunden</span></div>'}</div>`;
      });
      html += `</section>`;
    }

    html += `<section class="panel card-section"><h3>Neue Liste erstellen</h3>
      <p class="sub">Hake oben Adds und Cuts an und exportiere die angepasste Liste.</p>
      <div class="export-row"><button type="button" class="btn primary" data-act="export">Angepasste Liste kopieren</button>
      <button type="button" class="btn" data-act="apply">Im Analyzer öffnen</button><span class="status" data-msg></span></div></section>`;
    return html;
  }

  function bindExport(out, r) {
    const msg = $('[data-msg]', out);
    $('[data-act="export"]', out)?.addEventListener('click', () => copyText(modifiedList(r, out), msg));
    $('[data-act="apply"]', out)?.addEventListener('click', () => {
      deckArea.value = modifiedList(r, out);
      store.set('decklist', deckArea.value);
      $('#cmdr-input').value = '';
      showTab('analyze');
      scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function modifiedList(r, root) {
    const cuts = new Set($$('.pick[data-kind="cut"]:checked', root).map((x) => x.dataset.name));
    const adds = [...new Set($$('.pick[data-kind="add"]:checked', root).map((x) => x.dataset.name))];
    return listText(r.commanders, r.entries.filter((e) => !cuts.has(e.card.name)).map((e) => [e.card.name, e.qty]), adds);
  }

  function listText(commanders, entries, adds = []) {
    const lines = ['Commander', ...commanders.map((c) => `1 ${c.name || c}`), '', 'Deck'];
    entries.forEach(([n, q]) => lines.push(`${q} ${n}`));
    adds.forEach((n) => lines.push(`1 ${n}`));
    return lines.join('\n');
  }

  async function copyText(text, msgEl) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(msgEl, 'In die Zwischenablage kopiert ✓');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); setStatus(msgEl, 'Kopiert ✓'); } catch { setStatus(msgEl, 'Kopieren nicht möglich', 'error'); }
      ta.remove();
    }
  }

  // =====================================================================
  //  ANALYSE
  // =====================================================================
  $('#analyze-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#analyze-btn');
    const st = $('#an-status');
    const out = $('#an-results');
    btn.disabled = true;
    try {
      const r = await E.analyze({
        text: deckArea.value,
        commanderName: $('#cmdr-input').value.trim(),
        bracket: +$('#an-bracket').value,
        cap: D.CARD_CAPS[+$('#an-cap').value],
        cur: state.cur,
        themeIds: [...state.anThemes],
        typal: $('#an-typal').value,
        autoThemes: true,
        status: (m) => setStatus(st, m, 'busy'),
      });
      out.innerHTML = analysisHeader(r) + analysisBody(r);
      bindExport(out, r);
      setStatus(st, r.edhrecUsed ? 'Fertig – mit EDHREC-Daten.' : 'Fertig – EDHREC nicht erreichbar, Empfehlungen basieren auf Scryfall-Daten.');
      if (innerWidth < 960) out.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      console.error(e);
      setStatus(st, e.message || String(e), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('#example-btn').addEventListener('click', () => {
    const p = PRECONS.find((x) => /Lathril/.test(x.c[0])) || PRECONS[0];
    deckArea.value = p ? preconText(p) : '';
    store.set('decklist', deckArea.value);
  });

  // =====================================================================
  //  PRECONS
  // =====================================================================
  const preconText = (p) => listText(p.c, p.k.map((x) => (Array.isArray(x) ? x : [x, 1])));
  const preconSize = (p) => p.c.length + p.k.reduce((s, x) => s + (Array.isArray(x) ? x[1] : 1), 0);

  const pcColors = $('#pc-colors');
  pcColors.innerHTML = ['w', 'u', 'b', 'r', 'g', 'c'].map((k) => `<button type="button" class="${k}" data-k="${k}" title="${k === 'c' ? 'Farblos' : D.COLORS.find((c) => c.k === k).name}">${k.toUpperCase()}</button>`).join('');
  pcColors.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const k = b.dataset.k;
    state.pc.colors.has(k) ? state.pc.colors.delete(k) : state.pc.colors.add(k);
    b.classList.toggle('on', state.pc.colors.has(k));
    state.pc.shown = 24;
    renderPrecons();
  });
  let searchT;
  $('#pc-search').addEventListener('input', (ev) => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { state.pc.query = ev.target.value.trim().toLowerCase(); state.pc.shown = 24; renderPrecons(); }, 120);
  });
  $('#pc-sort').addEventListener('change', (ev) => { state.pc.sort = ev.target.value; renderPrecons(); });
  $('#pc-more').addEventListener('click', () => { state.pc.shown += 24; renderPrecons(true); });

  function filteredPrecons() {
    const q = state.pc.query;
    const cols = state.pc.colors;
    let list = PRECONS.filter((p) => {
      if (q && !`${p.n} ${p.c.join(' ')} ${p.sn} ${p.s}`.toLowerCase().includes(q)) return false;
      if (cols.size) {
        if (cols.has('c')) { if (p.ci) return false; } else if (![...cols].every((k) => p.ci.includes(k))) return false;
      }
      return true;
    });
    if (state.pc.sort === 'old') list = [...list].sort((a, b) => (a.d || '').localeCompare(b.d || ''));
    if (state.pc.sort === 'name') list = [...list].sort((a, b) => a.n.localeCompare(b.n));
    return list;
  }

  function renderPrecons(append) {
    const grid = $('#pc-grid');
    const list = filteredPrecons();
    const shown = list.slice(0, state.pc.shown);
    $('#pc-count').textContent = `${list.length} von ${PRECONS.length} Precons`;
    const start = append ? grid.children.length : 0;
    const html = shown.slice(start).map((p, i) => {
      const idx = PRECONS.indexOf(p);
      return `<button type="button" class="precon-tile" data-idx="${idx}" style="animation-delay:${Math.min(i, 12) * 0.03}s">
        <div class="art"><img alt="" data-cmdr="${esc(p.c[0])}"><span class="year">${esc((p.d || '').slice(0, 4))}</span></div>
        <div class="body">
          <div class="pn">${esc(p.n)}</div>
          <div class="pc">${p.c.map(esc).join(' & ')}</div>
          <div class="ps"><span>${esc(p.sn)}</span><span>${pips(p.ci)}</span></div>
        </div>
      </button>`;
    }).join('');
    if (append) grid.insertAdjacentHTML('beforeend', html);
    else grid.innerHTML = html || '<div class="empty" style="grid-column:1/-1">Keine Precons gefunden.</div>';
    $('#pc-more').classList.toggle('hidden', shown.length >= list.length);
    loadArts(shown.slice(start));
  }

  async function loadArts(list) {
    if (!list.length) return;
    try {
      const { cards } = await api.getCards(list.map((p) => p.c[0]));
      $$('#pc-grid img[data-cmdr]:not([src])').forEach((img) => {
        const c = cards.get(img.dataset.cmdr.toLowerCase());
        if (!c) return;
        img.onload = () => img.classList.add('loaded');
        img.src = C.image(c, 'art_crop');
      });
    } catch (e) { console.warn('Bilder konnten nicht geladen werden', e); }
  }

  $('#pc-grid').addEventListener('click', (ev) => {
    const t = ev.target.closest('.precon-tile');
    if (t) openPrecon(PRECONS[+t.dataset.idx]);
  });
  $('#pc-back').addEventListener('click', () => {
    $('#pc-detail').classList.add('hidden');
    $('#pc-browse').classList.remove('hidden');
    state.pc.current = null;
  });
  $('#pc-run').addEventListener('click', () => state.pc.current && runPrecon());

  function openPrecon(p) {
    state.pc.current = p;
    $('#pc-browse').classList.add('hidden');
    $('#pc-detail').classList.remove('hidden');
    $('#pc-head').innerHTML = '';
    $('#pc-results').innerHTML = '';
    scrollTo({ top: 0, behavior: 'smooth' });
    runPrecon();
  }

  let pcRun = 0;
  async function runPrecon() {
    const p = state.pc.current;
    const run = ++pcRun;
    const st = $('#pc-status');
    const out = $('#pc-results');
    const btn = $('#pc-run');
    btn.disabled = true;
    out.innerHTML = `<div class="empty"><div class="empty-icon">✦</div><p>Analysiere <strong>${esc(p.n)}</strong> …</p></div>`;
    try {
      const r = await E.analyze({
        text: preconText(p),
        bracket: +$('#pc-bracket').value,
        cap: D.CARD_CAPS[+$('#pc-cap').value],
        cur: state.cur,
        themeIds: [],
        autoThemes: true,
        status: (m) => setStatus(st, m, 'busy'),
      });
      if (run !== pcRun) return;
      state.pc.r = r;
      const kicker = `Precon · ${p.n} · ${p.sn} · ${(p.d || '').slice(0, 4)}`;
      out.innerHTML = analysisHeader(r, kicker) + upgradePackage(r) + analysisBody(r) +
        `<section class="panel card-section" id="pc-rebuild"><h3>Umbau-Ideen: anderer Commander</h3>
          <p class="sub">Commander, die mit möglichst vielen Karten dieses Precons funktionieren – ideal, wenn du mit wenig Aufwand etwas Neues bauen willst.</p>
          <div id="pc-ideas"><p class="status busy">Suche Alternativen …</p></div></section>
        <div id="pc-rebuild-result" class="results"></div>`;
      bindExport(out, r);
      bindUpgrade(out, r, p);
      setStatus(st, '');
      loadIdeas(r, p, run);
    } catch (e) {
      console.error(e);
      if (run === pcRun) { setStatus(st, e.message || String(e), 'error'); out.innerHTML = ''; }
    } finally {
      btn.disabled = false;
    }
  }

  function upgradePairs(r) {
    const n = +$('#pc-size').value;
    const seen = new Set();
    const adds = [...r.deficitAdds.filter((d) => d.key !== 'land').flatMap((d) => d.cards), ...r.synergyAdds]
      .filter((c) => !c.tags.has('land') && !seen.has(c.card.name) && seen.add(c.card.name));
    const cuts = r.cuts.filter((c) => !c.tags.has('land'));
    const len = Math.min(n, adds.length, cuts.length);
    return Array.from({ length: len }, (_, i) => ({ cut: cuts[i], add: adds[i] }));
  }

  function upgradePackage(r) {
    const pairs = upgradePairs(r);
    if (!pairs.length) return '';
    const cost = pairs.reduce((s, x) => s + (x.add.price || 0), 0);
    return `<section class="panel card-section" id="pc-upgrade">
      <h3>Schnelles Upgrade-Paket <span class="tag accent">${pairs.length} Tausche</span></h3>
      <p class="sub">Die wirkungsvollsten Tausche für dein Budget – schwächste Karte raus, stärkste passende Karte rein.</p>
      ${pairs.map((x) => `<div class="swap">
        ${cardItem(x.cut.card, { cls: 'cut', price: x.cut.price, cur: r.cur, why: esc(x.cut.reasons[0] || '') })}
        <span class="arrow">→</span>
        ${cardItem(x.add.card, { cls: 'add', price: x.add.price, cur: r.cur, why: addWhy(x.add, r.themes) })}
      </div>`).join('')}
      <div class="swap-total"><span>Kosten des Pakets: ${fmt(cost, r.cur)}</span>
        <span class="export-row" style="margin:0">
          <button type="button" class="btn small primary" data-up="list">Upgedatete Liste kopieren</button>
          <button type="button" class="btn small" data-up="buy">Einkaufsliste kopieren</button>
          <button type="button" class="btn small" data-up="open">Im Analyzer öffnen</button>
        </span></div>
      <p class="status" data-up-msg></p>
    </section>`;
  }

  function bindUpgrade(out, r, p) {
    const pairs = upgradePairs(r);
    const msg = $('[data-up-msg]', out);
    const text = () => {
      const cut = new Set(pairs.map((x) => x.cut.card.name));
      return listText(r.commanders, r.entries.filter((e) => !cut.has(e.card.name)).map((e) => [e.card.name, e.qty]), pairs.map((x) => x.add.card.name));
    };
    $('[data-up="list"]', out)?.addEventListener('click', () => copyText(text(), msg));
    $('[data-up="buy"]', out)?.addEventListener('click', () => copyText(pairs.map((x) => `1 ${x.add.card.name}`).join('\n'), msg));
    $('[data-up="open"]', out)?.addEventListener('click', () => {
      deckArea.value = text();
      store.set('decklist', deckArea.value);
      $('#cmdr-input').value = '';
      showTab('analyze');
      scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  async function loadIdeas(r, p, run) {
    const box = $('#pc-ideas');
    try {
      const ideas = await E.rebuildIdeas({
        commanders: r.commanders, entries: r.entries, themes: r.themes, cur: r.cur,
        status: (m) => { if (run === pcRun && box) box.innerHTML = `<p class="status busy">${esc(m)}</p>`; },
      });
      if (run !== pcRun) return;
      if (!ideas.length) { box.innerHTML = '<p class="sub">Keine passenden Alternativen gefunden.</p>'; return; }
      const nonland = r.entries.filter((e) => !e.tags.has('land')).length;
      box.innerHTML = `<div class="cmdr-grid">${ideas.map((e, i) => `<div class="cmdr-card">
        <img loading="lazy" src="${esc(C.image(e.card))}" alt="${esc(e.card.name)}" data-img="${esc(C.image(e.card, 'large'))}">
        <div class="nm">${esc(e.card.name)}</div>
        <div class="tags">${pips((e.card.color_identity || []).map((x) => x.toLowerCase()))} <span class="tag">${fmt(e.price, r.cur)}</span></div>
        <div class="themes">${[...e.sources].map((s) => `<span class="tag ${s === 'Schon im Deck' ? 'good' : 'accent'}">${esc(s)}</span>`).join('')}</div>
        <div class="facts">
          <b>${e.keep}</b> von ${nonland} Nichtländern bleiben spielbar${e.offColor ? ` · <b>${e.offColor}</b> fallen wegen Farben raus` : ''}<br>
          ${e.overlap != null ? `<b>${e.overlap}</b> Karten werden mit ihm/ihr oft gespielt<br>` : ''}
          ${e.tags && e.tags.length ? `Typische Themes: ${e.tags.map(esc).join(', ')}` : e.themes.length ? `Passt zu: ${e.themes.map(esc).join(', ')}` : ''}
        </div>
        <button type="button" class="btn small primary" data-i="${i}">Umbau planen</button>
      </div>`).join('')}</div>`;
      $$('.cmdr-card .btn', box).forEach((b) => b.addEventListener('click', () => planRebuild(r, p, ideas[+b.dataset.i].card, b)));
    } catch (e) {
      console.error(e);
      if (box) box.innerHTML = `<p class="status error">${esc(e.message || e)}</p>`;
    }
  }

  async function planRebuild(r, p, card, btn) {
    const out = $('#pc-rebuild-result');
    const st = $('#pc-status');
    $$('#pc-ideas .btn').forEach((b) => (b.disabled = true));
    try {
      // Alter Commander wandert in die 99, neuer Commander kommt raus
      const entries = r.entries.filter((e) => e.card.name !== card.name).map((e) => [e.card.name, e.qty]);
      r.commanders.forEach((c) => entries.push([c.name, 1]));
      const res = await E.analyze({
        text: listText([card], entries),
        commanderName: card.name,
        bracket: +$('#pc-bracket').value,
        cap: D.CARD_CAPS[+$('#pc-cap').value],
        cur: state.cur,
        themeIds: [],
        autoThemes: true,
        status: (m) => setStatus(st, m, 'busy'),
      });
      out.innerHTML = analysisHeader(res, `Umbau von „${p.n}“`) + analysisBody(res);
      bindExport(out, res);
      setStatus(st, '');
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error(e);
      setStatus(st, e.message || String(e), 'error');
    } finally {
      $$('#pc-ideas .btn').forEach((b) => (b.disabled = false));
    }
  }

  renderPrecons();

  // =====================================================================
  //  ASSISTENT
  // =====================================================================
  function wizardOpts() {
    return {
      colors: ['w', 'u', 'b', 'r', 'g'].filter((k) => state.wz.colors.has(k)),
      exact: $('input[name="colormode"]:checked').value === 'exact',
      themeIds: [...state.wz.themes],
      typal: $('#wz-typal').value.trim(),
      bracket: state.wz.bracket,
      budget: D.BUDGETS.find((b) => b.id === state.wz.budget),
      cur: state.cur,
    };
  }

  $('#wizard-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const st = $('#wz-status');
    const out = $('#wz-results');
    const opts = wizardOpts();
    if (state.wz.themes.has('typal') && !opts.typal) return setStatus(st, 'Bitte einen Kreaturentyp für Typal angeben.', 'error');
    const btn = $('#wizard-form .btn.primary');
    btn.disabled = true;
    try {
      const name = $('#wz-cmdr').value.trim();
      if (name) {
        setStatus(st, 'Lade Commander …', 'busy');
        const card = await api.getCard(name);
        if (!card) throw new Error(`„${name}“ nicht gefunden.`);
        out.innerHTML = '';
        await build(card, opts);
        return;
      }
      setStatus(st, 'Suche passende Commander …', 'busy');
      const list = await E.suggestCommanders(opts);
      if (!list.length) throw new Error('Keine Commander gefunden – probiere andere Farben oder Themes.');
      out.innerHTML = `<section class="panel card-section"><h3>Passende Commander</h3>
        <p class="sub">Sortiert nach Theme-Passung und Beliebtheit. Wähle einen, um ein Deck zu generieren.</p>
        <div class="cmdr-grid">${list.map((e, i) => `<div class="cmdr-card">
          <img loading="lazy" src="${esc(C.image(e.card))}" alt="${esc(e.card.name)}" data-img="${esc(C.image(e.card, 'large'))}">
          <div class="nm">${esc(e.card.name)}</div>
          <div class="tags">${pips((e.card.color_identity || []).map((x) => x.toLowerCase()))} <span class="tag">${fmt(e.price, opts.cur)}</span></div>
          <div class="themes">${[...e.themes].map((t) => `<span class="tag accent">${esc(t)}</span>`).join('')}</div>
          <button type="button" class="btn primary small" data-i="${i}">Deck bauen</button>
        </div>`).join('')}</div></section>`;
      $$('.cmdr-grid .btn', out).forEach((b) => b.addEventListener('click', () => build(list[+b.dataset.i].card, wizardOpts())));
      setStatus(st, `${list.length} Commander gefunden.`);
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error(e);
      setStatus(st, e.message || String(e), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  async function build(card, opts) {
    const st = $('#wz-status');
    const out = $('#wz-results');
    out.querySelectorAll('.btn').forEach((b) => (b.disabled = true));
    try {
      const deck = await E.buildDeck({ commander: card, ...opts, status: (m) => setStatus(st, m, 'busy') });
      renderDeck(deck);
      setStatus(st, deck.edhrecUsed ? 'Deck erstellt – mit EDHREC-Daten.' : 'Deck erstellt – EDHREC nicht erreichbar, Auswahl basiert auf Scryfall-Daten.');
      $('#deck-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error(e);
      setStatus(st, e.message || String(e), 'error');
    } finally {
      out.querySelectorAll('.btn').forEach((b) => (b.disabled = false));
    }
  }

  const GROUPS = [
    ['ramp', 'Rampe'], ['draw', 'Kartenvorteil'], ['interaction', 'Interaktion'], ['wipe', 'Board Wipes'],
    ['theme', 'Theme & Synergie'], ['land', 'Länder'],
  ];

  const deckText = (d) => listText([d.commander], [...d.cards.map((c) => [c.card.name, 1]), ...d.basics.map((b) => [b.name, b.qty])]);

  function renderDeck(d) {
    const out = $('#wz-results');
    $('#deck-result')?.remove();
    const id = (d.commander.color_identity || []).map((x) => x.toLowerCase());
    const counts = {};
    d.cards.forEach((c) => (counts[c.role] = (counts[c.role] || 0) + 1));
    const total = d.cards.reduce((s, c) => s + (c.price || 0), 0) + (C.price(d.commander, d.cur) || 0);
    const line = (card, qty, price) => `<div class="deck-line"><a href="${esc(card?.scryfall_uri || '#')}" target="_blank" rel="noopener" data-img="${esc(card && card.image_uris ? C.image(card) : '')}">${qty > 1 ? qty + '× ' : ''}${esc(card?.name)}</a><span class="p">${price != null ? fmt(price, d.cur) : ''}</span></div>`;

    let html = `<section class="panel card-section" id="deck-result">
      <div class="cmdr-head">
        <img src="${esc(C.image(d.commander))}" alt="${esc(d.commander.name)}" data-img="${esc(C.image(d.commander, 'large'))}">
        <div class="info">
          <div class="kicker">Dein neues Deck</div>
          <h2>${esc(d.commander.name)}</h2>
          <div class="tags">${pips(id)} <span class="tag">${d.size} Karten</span> <span class="tag">Bracket ${d.rules.n} · ${esc(d.rules.name)}</span>
            <span class="tag gc">${d.gcCount} Game Changer</span>
            ${d.themes.map((t) => `<span class="tag accent">${esc(t.name)}</span>`).join(' ')}
            ${d.edhrecUsed ? '<span class="tag good">EDHREC-Daten</span>' : '<span class="tag">nur Scryfall</span>'}</div>
          <div class="stats">
            ${statBox('Länder', d.landCount, null)}
            ${statBox('Rampe', counts.ramp || 0, null)}
            ${statBox('Kartenvorteil', counts.draw || 0, null)}
            ${statBox('Interaktion', counts.interaction || 0, null)}
            ${statBox('Board Wipes', counts.wipe || 0, null)}
            <div class="stat"><div class="v">${fmt(total, d.cur)}</div><div class="k">Geschätzter Preis</div><div class="t">${esc(d.budget.name)}</div></div>
          </div>
          ${d.size < 100 ? `<ul class="issues"><li>Nur ${d.size} Karten – zu wenige passende Karten im Budget/Bracket gefunden. Probiere ein höheres Budget oder weitere Themes und ergänze den Rest im Analyzer.</li></ul>` : ''}
          <div class="export-row">
            <button type="button" class="btn primary" id="deck-copy">Liste kopieren</button>
            <button type="button" class="btn" id="deck-dl">Als .txt speichern</button>
            <button type="button" class="btn ghost" id="deck-analyze">Im Analyzer öffnen</button>
            <span id="deck-msg" class="status"></span>
          </div>
        </div>
      </div>
      <div class="deck-cols" style="margin-top:26px">`;
    GROUPS.forEach(([role, name]) => {
      const items = d.cards.filter((c) => c.role === role).sort((a, b) => (a.card.cmc || 0) - (b.card.cmc || 0));
      const basicsQty = role === 'land' ? d.basics.reduce((s, b) => s + b.qty, 0) : 0;
      if (!items.length && !basicsQty) return;
      html += `<div class="deck-group"><h4>${esc(name)} · ${items.length + basicsQty}</h4>
        ${items.map((c) => line(c.card, 1, c.price)).join('')}
        ${role === 'land' ? d.basics.map((b) => line(b.card || { name: b.name }, b.qty, null)).join('') : ''}</div>`;
    });
    html += `</div></section>`;
    out.insertAdjacentHTML('beforeend', html);

    $('#deck-copy').addEventListener('click', () => copyText(deckText(d), $('#deck-msg')));
    $('#deck-dl').addEventListener('click', () => {
      const blob = new Blob([deckText(d)], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = api.slugify(d.commander.name) + '.txt';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#deck-analyze').addEventListener('click', () => {
      deckArea.value = deckText(d);
      store.set('decklist', deckArea.value);
      $('#an-bracket').value = String(d.rules.n);
      showTab('analyze');
      scrollTo({ top: 0 });
    });
  }
})();
