/* Karten-Hilfsfunktionen: Kategorien, Preise, Bilder, Decklisten-Parser */
window.MTG = window.MTG || {};

MTG.cards = (() => {
  const D = MTG.data;
  const gcSet = new Set(D.GAME_CHANGERS.map((n) => n.toLowerCase()));

  const oracle = (c) =>
    (c.oracle_text || (c.card_faces || []).map((f) => f.oracle_text || '').join('\n')).replace(/\([^)]*\)/g, '');
  const typeLine = (c) => c.type_line || (c.card_faces || []).map((f) => f.type_line).join(' // ');
  const isLand = (c) => /\bLand\b/.test(typeLine(c).split(' // ')[0]);
  const isBasic = (c) => /\bBasic\b/.test(typeLine(c));
  const isCreature = (c) => /\bCreature\b/.test(typeLine(c).split(' // ')[0]);

  function isGameChanger(c) {
    if (typeof c.game_changer === 'boolean') return c.game_changer;
    return gcSet.has(c.name.toLowerCase());
  }

  function price(c, cur) {
    const p = c.prices || {};
    let v = parseFloat(p[cur]);
    if (isNaN(v)) v = parseFloat(p[cur + '_foil']);
    if (isNaN(v)) {
      // Umrechnung als Notlösung
      const other = cur === 'eur' ? parseFloat(p.usd) * 0.93 : parseFloat(p.eur) * 1.08;
      v = isNaN(other) ? NaN : other;
    }
    if (isBasic(c)) return 0;
    return isNaN(v) ? null : v;
  }

  function image(c, size = 'normal') {
    if (c.image_uris) return c.image_uris[size];
    if (c.card_faces && c.card_faces[0].image_uris) return c.card_faces[0].image_uris[size];
    return '';
  }

  const RX = {
    ramp: [
      /\badd (\{[^}]+\}|one mana|two mana|three mana|x mana|mana)/i,
      /search your library for (up to \w+ )?(a |an )?(basic )?(land|forest|plains|island|swamp|mountain)/i,
      /create (a|an|one|two|three|x) treasure/i,
      /put (a|an|up to \w+) (basic )?land cards?[^.]*onto the battlefield/i,
      /you may play (an )?additional lands?/i,
    ],
    draw: [
      /\bdraws? (a|an|one|two|three|four|five|six|seven|x|that many|\w+) (additional )?cards?/i,
      /draw cards equal/i,
      /exile the top [^.]*cards?[^.]*you may (play|cast)/i,
    ],
    removal: [
      /(destroy|exile) (up to (one|two|\w+) )?target (creature|artifact|enchantment|planeswalker|permanent|nonland|nontoken|attacking|tapped|nonartifact|nonblack|noncreature|land)/i,
      /deals? (\d+|x|that much) damage to (any target|target creature|target planeswalker|another target)/i,
      /return (up to \w+ )?target (creature|nonland permanent|permanent|artifact|enchantment)[^.]*to (its|their) owner'?s'? hand/i,
      /target creature (an opponent controls )?gets -\d+\/-\d+/i,
      /(target|each) (player|opponent) sacrifices/i,
      /\bfights? (target|another target|up to one target)/i,
      /gain control of target/i,
    ],
    counter: [/counter target (spell|noncreature|creature|activated|instant|sorcery|artifact|enchantment)/i],
    wipe: [
      /(destroy|exile) all (other )?(creatures|nonland permanents|artifacts|enchantments|permanents|nontoken|planeswalkers|monsters)/i,
      /all (other )?creatures get -/i,
      /deals? (\d+|x) damage to each (creature|other creature)/i,
      /return all (nonland permanents|creatures)/i,
      /each player sacrifices (all|that many)/i,
    ],
    tutor: [/search your library for (a|an|up to \w+) (?!basic )(?![^.]*land card)[^.]*card/i],
    extraTurn: [/take an extra turn/i],
    mld: [/(destroy|exile) all lands|each player sacrifices (all )?lands/i],
  };

  const anyRx = (list, t) => list.some((r) => r.test(t));

  /** Ermittelt Rollen einer Karte im Deck. */
  function classify(c, themes = []) {
    const t = oracle(c);
    const tags = new Set();
    if (isLand(c)) {
      tags.add('land');
      return tags;
    }
    if (anyRx(RX.ramp, t)) tags.add('ramp');
    if (anyRx(RX.draw, t)) tags.add('draw');
    if (anyRx(RX.removal, t)) tags.add('removal');
    if (anyRx(RX.counter, t)) tags.add('counter');
    if (anyRx(RX.wipe, t)) tags.add('wipe');
    if (anyRx(RX.tutor, t)) tags.add('tutor');
    if (anyRx(RX.extraTurn, t)) tags.add('extraTurn');
    if (anyRx(RX.mld, t)) tags.add('mld');
    if (isCreature(c)) tags.add('creature');
    if (themeMatches(c, themes).length) tags.add('theme');
    return tags;
  }

  /** Liefert die Liste der passenden Themes (Objekte mit rx). */
  function themeMatches(c, themes) {
    if (!themes || !themes.length) return [];
    const t = oracle(c) + '\n' + typeLine(c);
    return themes.filter((th) => th.rx && th.rx.test(t));
  }

  function primaryCategory(tags) {
    for (const k of ['land', 'wipe', 'ramp', 'draw', 'removal', 'counter', 'tutor', 'theme', 'creature']) {
      if (tags.has(k)) return k;
    }
    return 'other';
  }

  function withinIdentity(c, identity) {
    return (c.color_identity || []).every((x) => identity.includes(x.toLowerCase()));
  }

  /** Mana-Symbole einer Karte zählen (für Basic-Land-Verteilung). */
  function pips(c) {
    const cost = c.mana_cost || (c.card_faces || []).map((f) => f.mana_cost || '').join('');
    const res = { w: 0, u: 0, b: 0, r: 0, g: 0 };
    (cost.match(/\{([^}]+)\}/g) || []).forEach((s) => {
      s.toLowerCase().replace(/[{}]/g, '').split('/').forEach((p) => {
        if (p in res) res[p]++;
      });
    });
    return res;
  }

  // ---------- Decklisten-Parser ----------
  const SECTION_RX = /^(\/\/\s*)?(commanders?|command zone|deck|mainboard|main|maindeck|sideboard|maybeboard|considering|tokens|companion|about|lands?|creatures?|instants?|sorcery|sorceries|artifacts?|enchantments?|planeswalkers?|battles?)\s*(\(\d+\))?:?\s*$/i;
  const IGNORE_SECTIONS = /^(sideboard|maybeboard|considering|tokens|about)$/i;

  function parseDecklist(text) {
    const result = { commanders: [], cards: [] };
    let section = 'main';
    const lines = text.replace(/\r/g, '').split('\n');
    for (let raw of lines) {
      let line = raw.trim();
      if (!line) continue;
      const sec = line.match(SECTION_RX);
      if (sec) {
        const name = sec[2].toLowerCase();
        section = /^command/.test(name) ? 'commander' : IGNORE_SECTIONS.test(name) ? 'ignore' : 'main';
        continue;
      }
      if (/^(\/\/|#)/.test(line)) continue;
      if (/^name\s/i.test(line)) continue; // MTGO-Header
      if (section === 'ignore') continue;

      let isCmdr = section === 'commander';
      if (/\*cmdr\*|\[commander/i.test(line)) isCmdr = true;

      let qty = 1;
      const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
      if (m) {
        qty = parseInt(m[1], 10);
        line = m[2];
      }
      line = line
        .replace(/\s*\^[^^]*\^/g, '') // Archidekt-Labels
        .replace(/\s*\[[^\]]*\]/g, '') // [Kategorie]
        .replace(/\s*\*[A-Za-z]+\*/g, '') // *F*, *CMDR*
        .replace(/\s+#.*$/, '') // #tags
        .replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+[\w★-]+)?.*$/, '') // (SET) 123
        .replace(/\s+\/\s+/g, ' // ')
        .trim();
      if (!line) continue;
      if (isCmdr) result.commanders.push(line);
      else {
        const existing = result.cards.find((c) => c.name.toLowerCase() === line.toLowerCase());
        if (existing) existing.qty += qty;
        else result.cards.push({ name: line, qty });
      }
    }
    return result;
  }

  return {
    oracle, typeLine, isLand, isBasic, isCreature, isGameChanger, price, image,
    classify, themeMatches, primaryCategory, withinIdentity, pips, parseDecklist,
  };
})();
