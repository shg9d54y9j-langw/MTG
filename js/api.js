/* API-Zugriff: Scryfall (Pflicht) und EDHREC (optional) */
window.MTG = window.MTG || {};

MTG.api = (() => {
  const SF = 'https://api.scryfall.com';
  const EDH = 'https://json.edhrec.com/pages';
  const cardCache = new Map(); // lowercase Name -> Karte
  let nextSlot = 0;

  // Scryfall bittet um 50–100 ms Abstand zwischen Requests
  async function throttle() {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + 110;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }

  async function sf(path, body) {
    await throttle();
    const opts = { headers: { Accept: 'application/json' } };
    if (body) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(SF + path, opts);
    } catch (e) {
      throw new Error('Scryfall ist nicht erreichbar. Bitte Internetverbindung prüfen.');
    }
    const json = await res.json().catch(() => null);
    if (res.status === 404) return null; // z.B. Suche ohne Treffer
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000));
      return sf(path, body);
    }
    if (!res.ok) throw new Error((json && json.details) || `Scryfall-Fehler ${res.status}`);
    return json;
  }

  function remember(card) {
    cardCache.set(card.name.toLowerCase(), card);
    if (card.card_faces && card.name.includes(' // ')) {
      cardCache.set(card.card_faces[0].name.toLowerCase(), card);
    }
    return card;
  }

  /** Scryfall-Suche; liefert Array von Karten (max. pages * 175). */
  async function search(query, { pages = 1, order = 'edhrec' } = {}) {
    const out = [];
    let url = `/cards/search?q=${encodeURIComponent(query)}&order=${order}&unique=cards`;
    for (let p = 0; p < pages && url; p++) {
      const json = await sf(url);
      if (!json || !json.data) break;
      json.data.forEach((c) => out.push(remember(c)));
      url = json.has_more && json.next_page ? json.next_page.replace(SF, '') : null;
    }
    return out;
  }

  /** Karten per Name laden (gecacht, gebündelt zu je 75). */
  async function getCards(names) {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    const missing = unique.filter((n) => !cardCache.has(n.toLowerCase()));
    const notFound = [];
    for (let i = 0; i < missing.length; i += 75) {
      const chunk = missing.slice(i, i + 75);
      const json = await sf('/cards/collection', { identifiers: chunk.map((name) => ({ name })) });
      (json?.data || []).forEach(remember);
      (json?.not_found || []).forEach((nf) => nf.name && notFound.push(nf.name));
    }
    // Zweiter Versuch über Fuzzy-Suche (Tippfehler, Vorderseiten von DFCs, etc.)
    const unresolved = [];
    for (const name of notFound.slice(0, 25)) {
      const card = await sf(`/cards/named?fuzzy=${encodeURIComponent(name)}`);
      if (card && card.object === 'card') {
        remember(card);
        cardCache.set(name.toLowerCase(), card);
      } else unresolved.push(name);
    }
    unresolved.push(...notFound.slice(25));
    const result = new Map();
    unique.forEach((n) => {
      const c = cardCache.get(n.toLowerCase());
      if (c) result.set(n.toLowerCase(), c);
    });
    return { cards: result, notFound: unresolved };
  }

  async function getCard(name) {
    const { cards } = await getCards([name]);
    return cards.get(name.toLowerCase()) || null;
  }

  async function autocomplete(q) {
    if (!q || q.length < 2) return [];
    const json = await sf(`/cards/autocomplete?q=${encodeURIComponent(q)}`);
    return json?.data || [];
  }

  // ---------- EDHREC (optional, kein offizielles API) ----------
  function slugify(name) {
    return name
      .split(' // ')[0]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  function commanderSlug(commanders) {
    return commanders.map((c) => slugify(c.name)).sort().join('-');
  }

  const edhCache = new Map();
  let edhrecDown = false;

  /** Liefert Map name->{inclusion, synergy, list} oder null. */
  async function edhrec(commanders, sub) {
    if (edhrecDown) return null;
    const path = `/commanders/${commanderSlug(commanders)}${sub ? '/' + sub : ''}.json`;
    if (edhCache.has(path)) return edhCache.get(path);
    let json = null;
    try {
      let res = await fetch(EDH + path);
      if (!res.ok) throw new Error(res.status);
      json = await res.json();
      if (json && json.redirect) {
        res = await fetch(EDH + json.redirect + '.json');
        json = res.ok ? await res.json() : null;
      }
    } catch (e) {
      // TypeError = Netzwerk/CORS -> EDHREC für diese Sitzung deaktivieren
      if (e instanceof TypeError) edhrecDown = true;
      edhCache.set(path, null);
      return null;
    }
    const lists = json?.container?.json_dict?.cardlists || [];
    const map = new Map();
    lists.forEach((list) => {
      (list.cardviews || []).forEach((cv) => {
        const potential = cv.potential_decks || json.num_decks_avg || 0;
        const inclusion = potential ? (cv.num_decks || cv.inclusion || 0) / potential : (cv.inclusion || 0) / 100;
        const entry = {
          name: cv.name,
          inclusion: Math.max(0, Math.min(1, inclusion)),
          synergy: typeof cv.synergy === 'number' ? cv.synergy : 0,
          list: list.header || list.tag || '',
        };
        const key = cv.name.toLowerCase();
        const prev = map.get(key);
        if (!prev || prev.inclusion < entry.inclusion) map.set(key, entry);
      });
    });
    const result = map.size ? map : null;
    edhCache.set(path, result);
    return result;
  }

  return { search, getCards, getCard, autocomplete, edhrec, slugify, isEdhrecDown: () => edhrecDown };
})();
