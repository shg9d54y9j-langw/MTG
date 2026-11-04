/* UI-Logik */
(() => {
  const { data: D, cards: C, engine: E, api } = MTG;
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
    analysis: null,
    deck: null,
  };
  const fmt = (v) => E.fmt(v, state.cur);
  const capLabel = (v) => (isFinite(v) ? `≤ ${fmt(v)}` : 'Kein Limit');

  // ---------------- Tabs ----------------
  $$('.tab-btn').forEach((b) => b.addEventListener('click', () => {
    $$('.tab-btn').forEach((x) => x.classList.toggle('active', x === b));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
    store.set('tab', b.dataset.tab);
  }));
  const savedTab = store.get('tab', 'analyze');
  $(`.tab-btn[data-tab="${savedTab}"]`)?.click();

  // ---------------- Währung ----------------
  const curSel = $('#currency');
  curSel.value = state.cur;
  curSel.addEventListener('change', () => {
    state.cur = curSel.value;
    store.set('cur', state.cur);
    fillCaps();
    renderBudgets();
    if (state.analysis) renderAnalysis(state.analysis);
    if (state.deck) renderDeck(state.deck);
  });

  // ---------------- Formular-Elemente aufbauen ----------------
  const bracketSel = $('#an-bracket');
  D.BRACKETS.forEach((b) => bracketSel.insertAdjacentHTML('beforeend', `<option value="${b.n}">${b.n} – ${esc(b.name)}</option>`));
  bracketSel.value = '3';

  function fillCaps() {
    const sel = $('#an-cap');
    const prev = sel.value;
    sel.innerHTML = D.CARD_CAPS.map((v, i) => `<option value="${i}">${esc(capLabel(v))}</option>`).join('');
    sel.value = prev || '0';
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

  // Farben
  const colorBox = $('#wz-colors');
  colorBox.innerHTML = D.COLORS.map((c) => `<button type="button" class="mana-btn ${c.k}" data-k="${c.k}">${c.k.toUpperCase()}<span>${esc(c.name)}</span></button>`).join('');
  colorBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('.mana-btn');
    if (!b) return;
    const k = b.dataset.k;
    state.wz.colors.has(k) ? state.wz.colors.delete(k) : state.wz.colors.add(k);
    b.classList.toggle('on', state.wz.colors.has(k));
  });

  // Brackets
  const bBox = $('#wz-brackets');
  bBox.innerHTML = D.BRACKETS.map((b) => `<button type="button" class="option" data-n="${b.n}"><strong>${b.n} · ${esc(b.name)}</strong><small>${esc(b.desc)}</small></button>`).join('');
  const setBracket = (n) => { state.wz.bracket = n; $$('.option', bBox).forEach((o) => o.classList.toggle('on', +o.dataset.n === n)); };
  bBox.addEventListener('click', (ev) => { const o = ev.target.closest('.option'); if (o) setBracket(+o.dataset.n); });
  setBracket(2);

  // Budget
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

  // Deckliste merken
  const deckArea = $('#decklist');
  deckArea.value = store.get('decklist', '');
  deckArea.addEventListener('input', () => store.set('decklist', deckArea.value));

  // ---------------- Hover-Vorschau ----------------
  const preview = $('#card-preview');
  document.addEventListener('mouseover', (ev) => {
    const el = ev.target.closest('[data-img]');
    if (!el || !el.dataset.img || matchMedia('(hover: none)').matches) return;
    preview.innerHTML = `<img src="${esc(el.dataset.img)}" alt="">`;
    preview.style.display = 'block';
  });
  document.addEventListener('mouseout', (ev) => { if (ev.target.closest('[data-img]')) preview.style.display = 'none'; });
  document.addEventListener('mousemove', (ev) => {
    if (preview.style.display !== 'block') return;
    const w = 260, h = 350;
    let x = ev.clientX + 20, y = ev.clientY - h / 2;
    if (x + w > innerWidth) x = ev.clientX - w - 10;
    y = Math.max(10, Math.min(innerHeight - h - 10, y));
    preview.style.left = x + 'px';
    preview.style.top = y + 'px';
  });

  // ---------------- Render-Helfer ----------------
  const pips = (id) => (id.length ? id : ['c']).map((k) => `<span class="pip ${k}" title="${k.toUpperCase()}"></span>`).join('');
  const roleTags = (tags) => ['ramp', 'draw', 'removal', 'counter', 'wipe', 'tutor', 'theme']
    .filter((k) => tags && tags.has(k)).map((k) => `<span class="tag">${esc(D.CATEGORY_NAMES[k])}</span>`).join(' ');

  function cardItem(card, { cls = '', why = '', price, check } = {}) {
    const small = C.image(card, 'small');
    const p = price !== undefined ? price : C.price(card, state.cur);
    const gc = C.isGameChanger(card) ? ' <span class="tag gc">Game Changer</span>' : '';
    const cb = check ? `<input type="checkbox" class="pick" data-kind="${check}" data-name="${esc(card.name)}" title="Für neue Liste übernehmen">` : '';
    return `<div class="citem ${cls}">
      ${cb}
      <img loading="lazy" src="${esc(small)}" alt="" data-img="${esc(C.image(card))}">
      <div class="meta">
        <a class="name" href="${esc(card.scryfall_uri || '#')}" target="_blank" rel="noopener" data-img="${esc(C.image(card))}">${esc(card.name)}</a>
        <div class="why">${why}${gc}</div>
      </div>
      <div class="price">${fmt(p)}</div>
    </div>`;
  }

  function setStatus(el, msg, kind) {
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  // =====================================================================
  //  ANALYSE
  // =====================================================================
  $('#analyze-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#analyze-btn');
    const st = $('#an-status');
    btn.disabled = true;
    try {
      const res = await E.analyze({
        text: deckArea.value,
        commanderName: $('#cmdr-input').value.trim(),
        bracket: +bracketSel.value,
        cap: D.CARD_CAPS[+$('#an-cap').value],
        cur: state.cur,
        themeIds: [...state.anThemes],
        typal: $('#an-typal').value,
        status: (m) => setStatus(st, m, 'busy'),
      });
      state.analysis = res;
      renderAnalysis(res);
      setStatus(st, res.edhrecUsed ? 'Fertig – mit EDHREC-Daten.' : 'Fertig – EDHREC nicht erreichbar, Empfehlungen basieren auf Scryfall-Daten.');
    } catch (e) {
      console.error(e);
      setStatus(st, e.message || String(e), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  function statBox(k, v, target, opts = {}) {
    let cls = '';
    if (target != null) {
      const lo = opts.lo ?? target - 1, hi = opts.hi ?? Infinity;
      cls = v >= lo && v <= hi ? 'good' : v >= target - 3 ? 'warn' : 'bad';
    }
    return `<div class="stat ${cls}"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div>${target != null ? `<div class="t">Richtwert ${target}</div>` : ''}</div>`;
  }

  function renderAnalysis(r) {
    const out = $('#an-results');
    const T = D.TARGETS;
    const id = E.identityOf(r.commanders);
    const cm = r.commanders[0];
    const maxCurve = Math.max(1, ...r.curve);
    const estName = D.BRACKETS.find((b) => b.n === r.bracketEstimate)?.name || '';
    const bracketCls = r.bracketEstimate > r.rules.n ? 'bad' : 'good';

    let html = `<section class="panel card-section">
      <div class="cmdr-head">
        ${r.commanders.map((c) => `<img src="${esc(C.image(c))}" alt="${esc(c.name)}">`).join('')}
        <div class="info">
          <h2>${r.commanders.map((c) => esc(c.name)).join(' & ')}</h2>
          <div>${pips(id)} <span class="tag">${r.deckSize} Karten</span> <span class="tag">Ø MW ${r.avgCmc.toFixed(2)}</span>
            <span class="tag ${bracketCls}">Geschätztes Bracket ${r.bracketEstimate} (${esc(estName)})</span>
            <span class="tag ${r.gcs.length > r.rules.maxGC ? 'bad' : 'gc'}">${r.gcs.length} Game Changer</span>
            ${r.edhrecUsed ? '<span class="tag good">EDHREC-Daten</span>' : '<span class="tag">nur Scryfall</span>'}</div>
          <div class="stats">
            ${statBox('Länder', r.counts.land, T.lands, { lo: 35, hi: 39 })}
            ${statBox('Rampe', r.counts.ramp, T.ramp)}
            ${statBox('Kartenvorteil', r.counts.draw, T.draw)}
            ${statBox('Interaktion', r.interaction, T.interaction)}
            ${statBox('Board Wipes', r.counts.wipe, T.wipe, { lo: 2 })}
            ${statBox('Kreaturen', r.counts.creature)}
            ${r.themes.length ? statBox('Theme-Karten', r.counts.theme) : ''}
            <div class="stat"><div class="v">${fmt(r.totalPrice)}</div><div class="k">Deckpreis</div>${r.unknownPrices ? `<div class="t">${r.unknownPrices} ohne Preis</div>` : ''}</div>
          </div>
          ${r.issues.length ? `<ul class="issues">${r.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
          ${r.gcs.length ? `<p class="sub" style="margin-top:10px">Game Changer: ${r.gcs.map(esc).join(', ')}</p>` : ''}
        </div>
      </div>
      <h3 style="margin-top:18px">Manakurve</h3>
      <div class="curve">${r.curve.map((n, i) => `<div class="bar"><span class="n">${n}</span><div class="fill" style="height:${(n / maxCurve) * 80}%"></div><span class="x">${i === 7 ? '7+' : i}</span></div>`).join('')}</div>
    </section>`;

    // Cuts
    html += `<section class="panel card-section">
      <h3>Empfohlene Cuts ${r.mustCut ? `<span class="tag bad">${r.mustCut} Karte(n) müssen raus</span>` : ''}</h3>
      <p class="sub">Sortiert nach Priorität – die oberen Karten zuerst prüfen.</p>
      <div class="clist">${r.cuts.map((c) => cardItem(c.card, { cls: 'cut', check: 'cut', price: c.price, why: esc(c.reasons.join(' · ')) })).join('')}</div>
    </section>`;

    // Adds
    html += `<section class="panel card-section"><h3>Empfohlene Adds</h3>`;
    if (r.deficitAdds.length) {
      r.deficitAdds.forEach((d) => {
        html += `<div class="deficit"><h4>${esc(d.label)} <span class="tag warn">${d.have} / ${d.target}</span></h4>
          <div class="clist">${d.cards.map((c) => cardItem(c.card, { cls: 'add', check: 'add', price: c.price, why: addWhy(c) })).join('') || '<p class="sub">Keine passenden Karten im Budget gefunden.</p>'}</div></div>`;
      });
    }
    html += `<div class="deficit"><h4>Synergie & Staples für deinen Commander</h4>
      <div class="clist">${r.synergyAdds.map((c) => cardItem(c.card, { cls: 'add', check: 'add', price: c.price, why: addWhy(c) })).join('') || '<p class="sub">Keine Vorschläge gefunden.</p>'}</div></div>
    </section>`;

    // Budget-Tausch
    if (r.swaps.length) {
      html += `<section class="panel card-section"><h3>Budget-Alternativen</h3><p class="sub">Karten über deinem Preislimit und günstigere Ersatzkarten mit ähnlicher Rolle.</p>`;
      r.swaps.forEach((s) => {
        html += `<div class="swap">${cardItem(s.from.card, { cls: 'cut', price: s.from.price, why: esc(D.CATEGORY_NAMES[s.role] || '') })}
          <span class="arrow">→</span>
          ${s.to ? cardItem(s.to.card, { cls: 'add', price: s.to.price, why: addWhy(s.to) }) : '<div class="citem"><span class="why">Keine günstige Alternative gefunden</span></div>'}</div>`;
      });
      html += `</section>`;
    }

    html += `<section class="panel card-section"><h3>Neue Liste erstellen</h3>
      <p class="sub">Hake oben Adds und Cuts an und exportiere die angepasste Liste.</p>
      <div class="export-row"><button type="button" class="btn" id="an-export">Angepasste Liste kopieren</button>
      <button type="button" class="btn ghost" id="an-apply">In Eingabefeld übernehmen</button><span id="an-export-msg" class="status"></span></div></section>`;

    out.innerHTML = html;
    $('#an-export').addEventListener('click', () => copyText(modifiedList(r), $('#an-export-msg')));
    $('#an-apply').addEventListener('click', () => { deckArea.value = modifiedList(r); store.set('decklist', deckArea.value); setStatus($('#an-export-msg'), 'Übernommen – erneut analysieren?'); });
  }

  function addWhy(c) {
    const bits = [];
    if (c.edh) bits.push(`${Math.round(c.edh.inclusion * 100)}% der Decks` + (c.edh.synergy > 0.05 ? `, +${Math.round(c.edh.synergy * 100)}% Synergie` : ''));
    const th = C.themeMatches(c.card, state.analysis?.themes || state.deck?.themes || []);
    if (th.length) bits.push('Theme: ' + th.map((t) => t.name).join(', '));
    return esc(bits.join(' · ')) + ' ' + roleTags(c.tags);
  }

  function modifiedList(r) {
    const cuts = new Set($$('.pick[data-kind="cut"]:checked').map((x) => x.dataset.name));
    const adds = [...new Set($$('.pick[data-kind="add"]:checked').map((x) => x.dataset.name))];
    const lines = ['Commander', ...r.commanders.map((c) => `1 ${c.name}`), '', 'Deck'];
    r.entries.filter((e) => !cuts.has(e.card.name)).forEach((e) => lines.push(`${e.qty} ${e.card.name}`));
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

  // Beispiel
  $('#example-btn').addEventListener('click', () => {
    deckArea.value = EXAMPLE;
    store.set('decklist', deckArea.value);
  });

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
    const btn = ev.submitter || $('#wizard-form .btn.primary');
    btn.disabled = true;
    try {
      const name = $('#wz-cmdr').value.trim();
      if (name) {
        setStatus(st, 'Lade Commander …', 'busy');
        const card = await api.getCard(name);
        if (!card) throw new Error(`„${name}“ nicht gefunden.`);
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
          <div>${pips((e.card.color_identity || []).map((x) => x.toLowerCase()))} <span class="tag">${fmt(e.price)}</span></div>
          <div class="themes">${[...e.themes].map((t) => `<span class="tag good">${esc(t)}</span>`).join('')}</div>
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
      state.deck = deck;
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

  function deckText(d) {
    const lines = ['Commander', `1 ${d.commander.name}`, '', 'Deck'];
    d.cards.forEach((c) => lines.push(`1 ${c.card.name}`));
    d.basics.forEach((b) => lines.push(`${b.qty} ${b.name}`));
    return lines.join('\n');
  }

  function renderDeck(d) {
    const out = $('#wz-results');
    $('#deck-result')?.remove();
    const id = (d.commander.color_identity || []).map((x) => x.toLowerCase());
    const counts = {};
    d.cards.forEach((c) => (counts[c.role] = (counts[c.role] || 0) + 1));
    const total = d.cards.reduce((s, c) => s + (c.price || 0), 0) + (C.price(d.commander, d.cur) || 0);
    const line = (card, qty, price) => `<div class="deck-line"><a href="${esc(card?.scryfall_uri || '#')}" target="_blank" rel="noopener" data-img="${esc(card ? C.image(card) : '')}">${qty > 1 ? qty + '× ' : ''}${esc(card?.name)}</a><span class="p">${price != null ? fmt(price) : ''}</span></div>`;

    let html = `<section class="panel card-section" id="deck-result">
      <div class="cmdr-head">
        <img src="${esc(C.image(d.commander))}" alt="${esc(d.commander.name)}">
        <div class="info">
          <h2>${esc(d.commander.name)}</h2>
          <div>${pips(id)} <span class="tag">${d.size} Karten</span> <span class="tag">Bracket ${d.rules.n} · ${esc(d.rules.name)}</span>
            <span class="tag gc">${d.gcCount} Game Changer</span>
            ${d.themes.map((t) => `<span class="tag good">${esc(t.name)}</span>`).join(' ')}
            ${d.edhrecUsed ? '<span class="tag good">EDHREC-Daten</span>' : '<span class="tag">nur Scryfall</span>'}</div>
          <div class="stats">
            ${statBox('Länder', d.landCount, null)}
            ${statBox('Rampe', counts.ramp || 0, null)}
            ${statBox('Kartenvorteil', counts.draw || 0, null)}
            ${statBox('Interaktion', counts.interaction || 0, null)}
            ${statBox('Board Wipes', counts.wipe || 0, null)}
            <div class="stat"><div class="v">${fmt(total)}</div><div class="k">Geschätzter Preis</div><div class="t">${esc(d.budget.name)}</div></div>
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
      <div class="deck-cols" style="margin-top:20px">`;
    GROUPS.forEach(([role, name]) => {
      const items = d.cards.filter((c) => c.role === role).sort((a, b) => (a.card.cmc || 0) - (b.card.cmc || 0));
      const basicsQty = role === 'land' ? d.basics.reduce((s, b) => s + b.qty, 0) : 0;
      if (!items.length && !basicsQty) return;
      html += `<div class="deck-group"><h4>${esc(name)} (${items.length + basicsQty})</h4>
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
      bracketSel.value = String(d.rules.n);
      $('.tab-btn[data-tab="analyze"]').click();
      window.scrollTo({ top: 0 });
    });
  }

  const EXAMPLE = `Commander
1 Lathril, Blade of the Elves

Deck
1 Sol Ring
1 Arcane Signet
1 Llanowar Elves
1 Elvish Mystic
1 Elvish Archdruid
1 Priest of Titania
1 Elvish Visionary
1 Beast Whisperer
1 Elderfang Ritualist
1 Moldervine Reclamation
1 Skullclamp
1 Beast Within
1 Putrefy
1 Infernal Grasp
1 Toxic Deluge
1 Shamanic Revelation
1 Elvish Promenade
1 Imperious Perfect
1 Dwynen's Elite
1 Elves of Deep Shadow
1 Leaf-Crowned Visionary
1 Tyvar Kell
1 Marwyn, the Nurturer
1 Blood Artist
1 Zulaport Cutthroat
1 Grave Titan
1 Craterhoof Behemoth
1 Overgrown Battlement
1 Kodama's Reach
1 Cultivate
1 Golgari Signet
1 Woodland Cemetery
1 Llanowar Wastes
1 Command Tower
1 Jungle Hollow
1 Golgari Rot Farm
14 Forest
12 Swamp`;
})();
