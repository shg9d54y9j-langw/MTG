/* Empfehlungs-Engine: Deck-Analyse (Adds/Cuts) und Deck-Generator */
window.MTG = window.MTG || {};

MTG.engine = (() => {
  const D = MTG.data;
  const C = MTG.cards;
  const api = MTG.api;

  const identityOf = (commanders) =>
    [...new Set(commanders.flatMap((c) => (c.color_identity || []).map((x) => x.toLowerCase())))].sort((a, b) => 'wubrg'.indexOf(a) - 'wubrg'.indexOf(b));
  const idQuery = (id) => (id.length ? id.join('') : 'c');

  function priceFilter(cap, cur) {
    return isFinite(cap) ? ` ${cur}<=${cap}` : '';
  }

  function resolveThemes(themeIds, typal) {
    return themeIds
      .map((id) => {
        const th = D.THEMES.find((t) => t.id === id);
        if (!th) return null;
        if (id === 'typal') {
          if (!typal) return null;
          const safe = typal.replace(/["()]/g, '').trim();
          // Mehrzahl-Formen: Elf → Elves, Wolf → Wolves, Fox → Foxes, Goblin → Goblins
          const forms = new Set([safe, safe + 's', safe + 'es']);
          if (/f$/i.test(safe)) forms.add(safe.slice(0, -1) + 'ves');
          if (/fe$/i.test(safe)) forms.add(safe.slice(0, -2) + 'ves');
          const list = [...forms];
          const esc = list.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
          return { ...th, name: `Typal: ${safe}`, edh: null,
            q: `(t:"${safe}" OR ${list.map((f) => `o:"${f}"`).join(' OR ')})`,
            rx: new RegExp(`\\b(${esc})\\b`, 'i') };
        }
        return th;
      })
      .filter(Boolean);
  }

  function bracketRules(n) {
    return D.BRACKETS.find((b) => b.n === Number(n)) || D.BRACKETS[2];
  }

  /** Popularität aus Scryfall edhrec_rank (0..1). */
  const popularity = (c) => (c.edhrec_rank ? 1 - Math.min(c.edhrec_rank, 30000) / 30000 : 0.05);

  function score(card, ctx) {
    const edh = ctx.edh && ctx.edh.get(card.name.toLowerCase());
    let s = popularity(card) * 0.6;
    if (edh) s += 0.3 + edh.inclusion * 0.8 + Math.max(edh.synergy, 0) * 1.2;
    const matches = C.themeMatches(card, ctx.themes);
    s += matches.length * 0.45;
    // Synergie mit dem Commander-Text (einfache Schlüsselwort-Heuristik)
    if (ctx.cmdrKeywords && ctx.cmdrKeywords.length) {
      const t = C.oracle(card).toLowerCase() + ' ' + C.typeLine(card).toLowerCase();
      const hits = ctx.cmdrKeywords.filter((k) => t.includes(k)).length;
      s += Math.min(hits, 3) * 0.12;
    }
    return s;
  }

  // Schlüsselwörter aus dem Commander-Text, die auf Synergien hindeuten
  const KEYWORDS = ['token', 'counter', 'sacrifice', 'graveyard', 'artifact', 'enchantment', 'equipment', 'aura',
    'instant', 'sorcery', 'land', 'life', 'dies', 'attack', 'draw', 'discard', 'mill', 'flying', 'treasure',
    'planeswalker', 'exile', 'copy', 'dragon', 'zombie', 'elf', 'goblin', 'vampire', 'wizard', 'knight', 'angel', 'sliver'];
  function commanderKeywords(commanders) {
    const t = commanders.map((c) => C.oracle(c) + ' ' + C.typeLine(c)).join(' ').toLowerCase();
    return KEYWORDS.filter((k) => t.includes(k));
  }

  function bracketAllowed(card, rules) {
    const tags = C.classify(card);
    if (rules.maxGC === 0 && C.isGameChanger(card)) return false;
    if (!rules.extraTurns && tags.has('extraTurn')) return false;
    if (!rules.mld && tags.has('mld')) return false;
    return true;
  }

  /** Kandidaten-Pool aus EDHREC + Scryfall sammeln. */
  async function candidatePool({ commanders, themes, cap, cur, status, edhSub, includeLands }) {
    const id = identityOf(commanders);
    const idq = idQuery(id);
    const base = `id<=${idq} f:commander -is:digital${priceFilter(cap, cur)}`;
    const pool = new Map();
    const add = (c) => {
      if (!c || pool.has(c.name.toLowerCase())) return;
      if (commanders.some((cm) => cm.name === c.name)) return;
      if (c.legalities && c.legalities.commander !== 'legal') return;
      if (!C.withinIdentity(c, id)) return;
      pool.set(c.name.toLowerCase(), c);
    };

    // 1) EDHREC
    status && status('Lade EDHREC-Daten …');
    let edh = await api.edhrec(commanders, edhSub || null);
    if (!edh && edhSub) edh = await api.edhrec(commanders, null);
    if (edh) {
      status && status(`EDHREC: ${edh.size} Karten gefunden, lade Kartendaten …`);
      const { cards } = await api.getCards([...edh.values()].map((e) => e.name));
      cards.forEach(add);
    }

    // 2) Scryfall: Themes
    for (const th of themes) {
      if (!th.q) continue;
      status && status(`Suche Karten für Theme „${th.name}“ …`);
      (await api.search(`${base} -t:land ${th.q}`, { pages: 2 })).forEach(add);
    }
    // 3) Scryfall: Kategorie-Staples
    for (const [k, q] of Object.entries(D.CATEGORY_QUERIES)) {
      if (k === 'lands' && !includeLands) continue;
      status && status(`Suche ${D.CATEGORY_NAMES[k] || (k === 'interaction' ? 'Interaktion' : 'Länder')} …`);
      (await api.search(`${base} ${q}`, { pages: 1 })).forEach(add);
    }
    // 4) Allgemein beliebte Karten in den Farben
    status && status('Suche beliebte Karten in deinen Farben …');
    (await api.search(`${base} -t:land -t:basic`, { pages: 1 })).forEach(add);

    return { pool, edh, id };
  }

  // =====================================================================
  //  DECK-ANALYSE
  // =====================================================================
  function guessCommanders(entries) {
    const legends = entries.filter((e) => e.card && /Legendary/.test(C.typeLine(e.card)) &&
      (C.isCreature(e.card) || /can be your commander/i.test(C.oracle(e.card))));
    if (!legends.length) return [];
    const allId = new Set(entries.flatMap((e) => e.card?.color_identity || []));
    const full = legends.filter((l) => (l.card.color_identity || []).length === allId.size);
    return [(full[0] || legends[0]).card];
  }

  /** Erkennt die stärksten Themes einer Kartenliste (inkl. Typal). */
  function detectThemes(cardList, max = 3) {
    const nonland = cardList.filter((c) => !C.isLand(c));
    const res = D.THEMES.filter((t) => t.rx)
      .map((t) => ({ t, n: nonland.filter((c) => C.themeMatches(c, [t]).length).length }))
      .filter((x) => x.n >= 7)
      .sort((a, b) => b.n - a.n)
      .slice(0, max)
      .map((x) => x.t);
    // Typal: häufigster Kreaturentyp
    const types = {};
    nonland.filter(C.isCreature).forEach((c) => {
      const sub = (C.typeLine(c).split(' // ')[0].split('—')[1] || '').trim().split(/\s+/).filter(Boolean);
      sub.forEach((x) => (types[x] = (types[x] || 0) + 1));
    });
    const top = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 10) res.unshift(resolveThemes(['typal'], top[0])[0]);
    return res.slice(0, max);
  }

  const canCommand = (c) => /Legendary/.test(C.typeLine(c).split(' // ')[0]) &&
    (C.isCreature(c) || /can be your commander/i.test(C.oracle(c)));

  async function analyze({ text, commanderName, bracket, cap, cur, themeIds, typal, status, autoThemes }) {
    const parsed = C.parseDecklist(text);
    if (!parsed.cards.length && !parsed.commanders.length) throw new Error('Keine Karten in der Liste gefunden.');
    const names = [...parsed.commanders, ...parsed.cards.map((c) => c.name)];
    if (commanderName) names.push(commanderName);
    status('Lade Kartendaten von Scryfall …');
    const { cards, notFound } = await api.getCards(names);

    let commanders = [];
    if (commanderName) {
      const c = cards.get(commanderName.toLowerCase());
      if (!c) throw new Error(`Commander „${commanderName}“ nicht gefunden.`);
      commanders = [c];
    } else {
      commanders = parsed.commanders.map((n) => cards.get(n.toLowerCase())).filter(Boolean);
    }
    let entries = parsed.cards.map((e) => ({ ...e, card: cards.get(e.name.toLowerCase()) })).filter((e) => e.card);
    if (!commanders.length) commanders = guessCommanders(entries);
    if (!commanders.length) throw new Error('Kein Commander erkannt. Bitte im Feld „Commander“ angeben.');
    const cmdrNames = new Set(commanders.map((c) => c.name));
    entries = entries.filter((e) => !cmdrNames.has(e.card.name));

    let themes = resolveThemes(themeIds, typal);
    if (!themes.length && autoThemes) themes = detectThemes(entries.map((e) => e.card));
    const rules = bracketRules(bracket);
    const id = identityOf(commanders);

    // ---- Statistiken ----
    const counts = { land: 0, ramp: 0, draw: 0, removal: 0, counter: 0, wipe: 0, tutor: 0, creature: 0, theme: 0 };
    const curve = [0, 0, 0, 0, 0, 0, 0, 0]; // 0..6, 7+
    let total = 0, cmcSum = 0, nonland = 0, totalPrice = 0, unknownPrices = 0;
    const issues = [];
    const gcs = [];
    const flagged = { extraTurn: [], mld: [], tutor: [] };

    entries.forEach((e) => {
      const c = e.card;
      e.tags = C.classify(c, themes);
      total += e.qty;
      const p = C.price(c, cur);
      if (p == null) unknownPrices++;
      else totalPrice += p * e.qty;
      e.price = p;
      if (e.tags.has('land')) counts.land += e.qty;
      else {
        nonland += e.qty;
        cmcSum += (c.cmc || 0) * e.qty;
        curve[Math.min(7, Math.floor(c.cmc || 0))] += e.qty;
      }
      ['ramp', 'draw', 'removal', 'counter', 'wipe', 'tutor', 'creature', 'theme'].forEach((k) => e.tags.has(k) && (counts[k] += e.qty));
      if (C.isGameChanger(c)) gcs.push(c.name);
      if (e.tags.has('extraTurn')) flagged.extraTurn.push(c.name);
      if (e.tags.has('mld')) flagged.mld.push(c.name);
      if (e.tags.has('tutor')) flagged.tutor.push(c.name);
      if (!C.withinIdentity(c, id)) { e.illegal = 'Außerhalb der Farbidentität'; issues.push(`${c.name}: außerhalb der Farbidentität`); }
      else if (c.legalities && c.legalities.commander === 'banned') { e.illegal = 'Im Commander gebannt'; issues.push(`${c.name}: gebannt`); }
      if (e.qty > 1 && !C.isBasic(c) && !/any number of cards named/i.test(C.oracle(c))) issues.push(`${c.name}: ${e.qty}× (Singleton-Regel)`);
    });
    commanders.forEach((c) => { const p = C.price(c, cur); if (p != null) totalPrice += p; });
    const deckSize = total + commanders.length;
    if (deckSize !== 100) issues.unshift(`Deck hat ${deckSize} Karten (inkl. Commander) – Ziel sind 100.`);
    notFound.forEach((n) => issues.push(`Nicht gefunden: ${n}`));

    // Bracket-Schätzung
    let est;
    if (gcs.length === 0 && !flagged.mld.length && flagged.extraTurn.length <= 1 && flagged.tutor.length <= 2) est = 2;
    else if (gcs.length <= 3 && !flagged.mld.length) est = 3;
    else est = 4;

    // ---- Kandidaten für Adds ----
    const edhSub = themes.length === 1 && themes[0].edh ? themes[0].edh : null;
    const { pool, edh } = await candidatePool({ commanders, themes, cap, cur, status, edhSub, includeLands: counts.land < D.TARGETS.lands - 1 });
    const inDeck = new Set(entries.map((e) => e.card.name.toLowerCase()));
    const ctx = { edh, themes, cmdrKeywords: commanderKeywords(commanders) };
    const candidates = [...pool.values()]
      .filter((c) => !inDeck.has(c.name.toLowerCase()) && !C.isBasic(c))
      .filter((c) => bracketAllowed(c, rules))
      .filter((c) => { const p = C.price(c, cur); return !isFinite(cap) || (p != null && p <= cap); })
      .map((c) => ({ card: c, tags: C.classify(c, themes), score: score(c, ctx), price: C.price(c, cur), edh: edh?.get(c.name.toLowerCase()) }))
      .sort((a, b) => b.score - a.score);

    // GC-Budget in Bracket 3
    let gcLeft = Math.max(0, rules.maxGC - gcs.length);
    const gcOk = (c) => {
      if (!C.isGameChanger(c.card)) return true;
      if (gcLeft > 0) { gcLeft--; return true; }
      return false;
    };

    const T = D.TARGETS;
    const interaction = counts.removal + counts.counter;
    const deficits = [];
    const need = (key, have, target, label, filter) => {
      if (have < target) deficits.push({ key, label, have, target, filter });
    };
    need('ramp', counts.ramp, T.ramp, 'Rampe', (c) => c.tags.has('ramp'));
    need('draw', counts.draw, T.draw, 'Kartenvorteil', (c) => c.tags.has('draw'));
    need('interaction', interaction, T.interaction, 'Interaktion (Removal/Counter)', (c) => c.tags.has('removal') || c.tags.has('counter'));
    need('wipe', counts.wipe, T.wipe, 'Board Wipes', (c) => c.tags.has('wipe'));
    need('land', counts.land, T.lands - 1, 'Länder', (c) => c.tags.has('land'));

    const used = new Set();
    const pick = (filter, n) => {
      const out = [];
      for (const c of candidates) {
        if (out.length >= n) break;
        if (used.has(c.card.name) || !filter(c)) continue;
        if (!gcOk(c)) continue;
        used.add(c.card.name);
        out.push(c);
      }
      return out;
    };
    const deficitAdds = deficits.map((d) => ({ ...d, cards: pick(d.filter, Math.min(6, Math.max(3, d.target - d.have + 1))) }));
    const synergyAdds = pick((c) => !c.tags.has('land'), 15);

    // ---- Cuts ----
    const overfull = {
      ramp: counts.ramp > T.ramp + 3, draw: counts.draw > T.draw + 4,
      wipe: counts.wipe > T.wipe + 2, land: counts.land > T.lands + 2,
    };
    const cutList = entries
      .filter((e) => !C.isBasic(e.card) && !(e.tags.has('land') && !overfull.land))
      .map((e) => {
        const c = e.card;
        const reasons = [];
        let s = 0;
        if (e.illegal) { s += 10; reasons.push(e.illegal); }
        const ed = edh?.get(c.name.toLowerCase());
        const pop = popularity(c);
        if (edh) {
          if (!ed) { s += 0.5; reasons.push('Kaum in Decks dieses Commanders gespielt'); }
          else { s -= ed.inclusion + Math.max(0, ed.synergy); if (ed.synergy < -0.05) { s += 0.3; reasons.push('Negative Synergie laut EDHREC'); } }
        }
        s += (1 - pop) * 0.8;
        if (pop < 0.35) reasons.push('Insgesamt selten gespielt');
        if ((c.cmc || 0) >= 6 && !e.tags.has('land')) { s += 0.35; reasons.push(`Hohe Manakosten (${c.cmc})`); }
        const matchesTheme = C.themeMatches(c, themes).length > 0;
        const role = ['ramp', 'draw', 'removal', 'counter', 'wipe'].some((k) => e.tags.has(k));
        if (themes.length && !matchesTheme && !role) { s += 0.45; reasons.push('Passt nicht zu den Deck-Themes'); }
        if (matchesTheme) s -= 0.4;
        if (!role && !matchesTheme && !e.tags.has('creature') && !e.tags.has('land')) s += 0.15;
        if (e.tags.has('ramp') && overfull.ramp) { s += 0.2; reasons.push('Viel Rampe vorhanden'); }
        if (e.tags.has('wipe') && overfull.wipe) { s += 0.2; reasons.push('Viele Board Wipes'); }
        if (e.tags.has('land') && overfull.land) { s += 0.3; reasons.push('Zu viele Länder'); }
        // Defizit-Kategorien schützen
        if (e.tags.has('ramp') && counts.ramp <= T.ramp) s -= 0.4;
        if (e.tags.has('draw') && counts.draw <= T.draw) s -= 0.4;
        if ((e.tags.has('removal') || e.tags.has('counter')) && interaction <= T.interaction) s -= 0.4;
        if (e.tags.has('wipe') && counts.wipe <= T.wipe) s -= 0.3;
        if (C.isGameChanger(c) && gcs.length > rules.maxGC) { s += 1.5; reasons.push(`Game Changer – über dem Limit für Bracket ${rules.n}`); }
        if (e.tags.has('extraTurn') && !rules.extraTurns) { s += 1.2; reasons.push(`Extra-Züge passen nicht zu Bracket ${rules.n}`); }
        if (e.tags.has('mld') && !rules.mld) { s += 1.5; reasons.push(`Massen-Landzerstörung nicht erlaubt in Bracket ${rules.n}`); }
        if (isFinite(cap) && e.price != null && e.price > cap) reasons.push(`Über Budget (${fmt(e.price, cur)})`);
        if (!reasons.length) reasons.push('Schwächste Karte im Vergleich');
        return { ...e, cutScore: s, reasons };
      })
      .sort((a, b) => b.cutScore - a.cutScore);
    const mustCut = Math.max(0, deckSize - 100);
    const cuts = cutList.slice(0, Math.max(10, mustCut + 5));

    // ---- Budget-Tausch ----
    const swaps = [];
    if (isFinite(cap)) {
      const expensive = entries.filter((e) => e.price != null && e.price > cap && !C.isBasic(e.card)).sort((a, b) => b.price - a.price).slice(0, 10);
      for (const e of expensive) {
        const role = C.primaryCategory(e.tags);
        const alt = candidates.find((c) => !used.has(c.card.name) && (role === 'other' || role === 'creature' ? true : c.tags.has(role)) && (role !== 'land' || c.tags.has('land')));
        if (alt) used.add(alt.card.name);
        swaps.push({ from: e, to: alt || null, role });
      }
    }

    return {
      commanders, entries, counts, interaction, curve, avgCmc: nonland ? cmcSum / nonland : 0,
      totalPrice, unknownPrices, deckSize, issues, gcs, flagged, bracketEstimate: est, rules,
      deficitAdds, synergyAdds, cuts, mustCut, swaps, edhrecUsed: !!edh, themes, cur,
    };
  }

  // =====================================================================
  //  UMBAU-IDEEN (alternative Commander für eine bestehende Liste)
  // =====================================================================
  async function rebuildIdeas({ commanders, entries, themes, cur, status }) {
    const id = identityOf(commanders);
    const cmdrNames = new Set(commanders.map((c) => c.name));
    const deckCards = entries.map((e) => e.card);
    const nonland = deckCards.filter((c) => !C.isLand(c));
    const cands = new Map();
    const add = (card, src) => {
      if (!card || cmdrNames.has(card.name) || !canCommand(card)) return;
      if (card.legalities && card.legalities.commander === 'banned') return;
      const e = cands.get(card.name) || { card, sources: new Set() };
      e.sources.add(src);
      cands.set(card.name, e);
    };

    // 1) Legenden, die schon im Deck sind
    deckCards.forEach((c) => add(c, 'Schon im Deck'));
    // 2) Ähnliche Commander laut EDHREC
    status && status('Suche ähnliche Commander …');
    const edhMain = await api.edhrec(commanders, null);
    if (edhMain && edhMain.similar.length) {
      const { cards } = await api.getCards(edhMain.similar.slice(0, 8));
      cards.forEach((c) => add(c, 'Ähnlich laut EDHREC'));
    }
    // 3) Commander, die zu den Deck-Themes passen
    for (const th of themes.slice(0, 2)) {
      if (!th.q) continue;
      status && status(`Suche Commander für „${th.name}“ …`);
      (await api.search(`is:commander f:commander -is:digital id<=${idQuery(id)} ${th.q}`)).slice(0, 8).forEach((c) => add(c, `Passt zu ${th.name}`));
    }

    let list = [...cands.values()].map((e) => {
      const cid = (e.card.color_identity || []).map((x) => x.toLowerCase());
      const fits = nonland.filter((c) => C.withinIdentity(c, cid));
      e.keep = fits.length;
      e.offColor = deckCards.filter((c) => !C.withinIdentity(c, cid)).length;
      e.themes = C.themeMatches(e.card, themes).map((t) => t.name);
      e.price = C.price(e.card, cur);
      e.score = e.keep / Math.max(1, nonland.length) + e.themes.length * 0.3 + popularity(e.card) * 0.5 + (e.sources.has('Schon im Deck') ? 0.3 : 0);
      return e;
    }).sort((a, b) => b.score - a.score).slice(0, 9);

    // EDHREC-Überschneidung: wie viele Deckkarten spielt man typischerweise mit diesem Commander?
    for (const [i, e] of list.entries()) {
      status && status(`Prüfe Überschneidung ${i + 1}/${list.length} …`);
      const edh = await api.edhrec([e.card], null);
      if (edh) {
        e.overlap = deckCards.filter((c) => edh.has(c.name.toLowerCase())).length;
        e.tags = edh.tags.slice(0, 3);
        e.score += e.overlap / 40;
      }
    }
    return list.sort((a, b) => b.score - a.score);
  }

  // =====================================================================
  //  COMMANDER-VORSCHLÄGE
  // =====================================================================
  async function suggestCommanders({ colors, exact, themeIds, typal, bracket, cur }) {
    const themes = resolveThemes(themeIds, typal);
    const idq = idQuery(colors);
    const idPart = exact ? `id=${idq}` : `id<=${idq}`;
    const rules = bracketRules(bracket);
    const base = `is:commander f:commander -is:digital ${idPart}`;
    const results = new Map();
    const add = (list, th) => list.forEach((c) => {
      if (rules.maxGC === 0 && C.isGameChanger(c)) return;
      const e = results.get(c.name) || { card: c, themes: new Set() };
      if (th) e.themes.add(th.name);
      results.set(c.name, e);
    });
    if (themes.length) {
      // Commander, die alle Themes abdecken, dann je Theme
      if (themes.length > 1) add(await api.search(`${base} ${themes.map((t) => t.q).join(' ')}`), null);
      for (const th of themes) add(await api.search(`${base} ${th.q}`), th);
    }
    if (results.size < 6) add(await api.search(base), null);
    const list = [...results.values()].map((e) => {
      C.themeMatches(e.card, themes).forEach((t) => e.themes.add(t.name));
      e.score = e.themes.size * 1.0 + popularity(e.card);
      e.price = C.price(e.card, cur);
      return e;
    });
    return list.sort((a, b) => b.score - a.score).slice(0, 12);
  }

  // =====================================================================
  //  DECK-GENERATOR
  // =====================================================================
  async function buildDeck({ commander, themeIds, typal, bracket, budget, cur, status }) {
    const themes = resolveThemes(themeIds, typal);
    const rules = bracketRules(bracket);
    const commanders = [commander];
    const cap = budget.perCard;
    const edhSub = isFinite(cap) && cap <= 1 ? 'budget' : themes.length && themes[0].edh ? themes[0].edh : null;
    const { pool, edh, id } = await candidatePool({ commanders, themes, cap, cur, status, edhSub, includeLands: true });
    status('Stelle das Deck zusammen …');

    const ctx = { edh, themes, cmdrKeywords: commanderKeywords(commanders) };
    const all = [...pool.values()]
      .filter((c) => !C.isBasic(c))
      .filter((c) => bracketAllowed(c, rules))
      .map((c) => ({ card: c, tags: C.classify(c, themes), score: score(c, ctx), price: C.price(c, cur) }))
      .filter((c) => !isFinite(cap) || (c.price != null && c.price <= cap))
      .sort((a, b) => b.score - a.score);

    const colorsN = id.length;
    const landTarget = rules.n >= 4 ? 35 : rules.n <= 2 ? 37 : 36;
    const nonbasicTarget = colorsN <= 1 ? 7 : colorsN === 2 ? 12 : colorsN === 3 ? 16 : 18;
    const quotas = { ramp: rules.n >= 4 ? 12 : 10, draw: 10, interaction: rules.n >= 4 ? 11 : 9, wipe: colorsN ? 3 : 2 };
    const nonlandSlots = 99 - landTarget;

    const chosen = [];
    const chosenSet = new Set();
    let spent = C.price(commander, cur) || 0;
    let gcCount = 0, tutorCount = 0;
    const totalCap = budget.total;
    const take = (c, role) => {
      if (chosenSet.has(c.card.name)) return false;
      if (C.isGameChanger(c.card) && gcCount >= rules.maxGC) return false;
      if (c.tags.has('tutor') && tutorCount >= rules.maxTutors) return false;
      const p = c.price || 0;
      // Restbudget für restliche Plätze reservieren (~0.25 pro Karte)
      const remaining = 99 - chosen.length - 1;
      if (isFinite(totalCap) && spent + p + remaining * 0.2 > totalCap) return false;
      chosen.push({ ...c, role });
      chosenSet.add(c.card.name);
      spent += p;
      if (C.isGameChanger(c.card)) gcCount++;
      if (c.tags.has('tutor')) tutorCount++;
      return true;
    };
    const fill = (filter, n, role) => {
      let got = 0;
      for (const c of all) {
        if (got >= n) break;
        if (filter(c) && take(c, role)) got++;
      }
      return got;
    };

    const nonland = (c) => !c.tags.has('land');
    // Rollen zuerst, bevorzugt themenpassend
    const themed = (c) => c.tags.has('theme');
    fill((c) => nonland(c) && c.tags.has('ramp') && themed(c), 3, 'ramp');
    fill((c) => nonland(c) && c.tags.has('ramp'), quotas.ramp - chosen.filter((x) => x.role === 'ramp').length, 'ramp');
    fill((c) => nonland(c) && c.tags.has('draw') && themed(c), 4, 'draw');
    fill((c) => nonland(c) && c.tags.has('draw'), quotas.draw - chosen.filter((x) => x.role === 'draw').length, 'draw');
    fill((c) => nonland(c) && (c.tags.has('removal') || c.tags.has('counter')), quotas.interaction, 'interaction');
    fill((c) => nonland(c) && c.tags.has('wipe'), quotas.wipe, 'wipe');
    // Theme / Synergie
    const used = () => chosen.filter((x) => x.role !== 'land').length;
    fill((c) => nonland(c) && (themed(c) || (edh && edh.has(c.card.name.toLowerCase()))), nonlandSlots - used(), 'theme');
    fill(nonland, nonlandSlots - used(), 'theme');

    // Zu wenige Karten? Breiter nachsuchen (weitere Seiten beliebter Karten)
    if (used() < nonlandSlots) {
      status('Suche weitere Karten, um das Deck aufzufüllen …');
      const extra = await api.search(`id<=${idQuery(id)} f:commander -is:digital -t:land${priceFilter(cap, cur)}`, { pages: 3 });
      const known = new Set(all.map((c) => c.card.name));
      extra
        .filter((c) => !known.has(c.name) && c.name !== commander.name && C.withinIdentity(c, id) && bracketAllowed(c, rules))
        .map((c) => ({ card: c, tags: C.classify(c, themes), score: score(c, ctx), price: C.price(c, cur) }))
        .filter((c) => !isFinite(cap) || (c.price != null && c.price <= cap))
        .sort((a, b) => b.score - a.score)
        .forEach((c) => all.push(c));
      fill(nonland, nonlandSlots - used(), 'theme');
    }

    // Nonbasic-Länder
    fill((c) => c.tags.has('land'), nonbasicTarget, 'land');
    const landsSoFar = chosen.filter((x) => x.role === 'land').length;

    // Basics nach Farbsymbolen verteilen
    const pipSum = { w: 0, u: 0, b: 0, r: 0, g: 0 };
    chosen.forEach((x) => { const p = C.pips(x.card); for (const k in pipSum) pipSum[k] += p[k]; });
    // Basics füllen bis zur Länderzahl (+ max. 2 Puffer), nie das ganze Deck
    const basicsNeeded = Math.max(0, Math.min(99 - chosen.length, landTarget + 2 - landsSoFar));
    const basics = {};
    if (!id.length) basics.c = basicsNeeded;
    else {
      const totalPips = id.reduce((s, k) => s + Math.max(pipSum[k], 1), 0);
      let assigned = 0;
      id.forEach((k, i) => {
        const n = i === id.length - 1 ? basicsNeeded - assigned : Math.round((basicsNeeded * Math.max(pipSum[k], 1)) / totalPips);
        basics[k] = Math.max(0, n);
        assigned += basics[k];
      });
    }
    let basicCards = new Map();
    try {
      const { cards } = await api.getCards(Object.keys(basics).map((k) => D.BASICS[k]));
      basicCards = cards;
    } catch (e) { /* Basics sind optional für Bilder */ }

    const deck = {
      commander, themes, rules, cur, budget, edhrecUsed: !!edh,
      cards: chosen,
      basics: Object.entries(basics).filter(([, n]) => n > 0).map(([k, n]) => ({ name: D.BASICS[k], qty: n, card: basicCards.get(D.BASICS[k].toLowerCase()) })),
      landCount: landsSoFar + basicsNeeded,
      totalPrice: spent,
      gcCount,
    };
    deck.size = 1 + chosen.length + deck.basics.reduce((s, b) => s + b.qty, 0);
    return deck;
  }

  function fmt(v, cur) {
    if (v == null) return '–';
    return (cur === 'eur' ? '' : '$') + v.toFixed(2).replace('.', cur === 'eur' ? ',' : '.') + (cur === 'eur' ? ' €' : '');
  }

  return { analyze, rebuildIdeas, detectThemes, suggestCommanders, buildDeck, resolveThemes, identityOf, fmt };
})();
