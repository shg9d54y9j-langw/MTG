// Lädt alle Commander-Precons von MTGJSON und schreibt data/precons.js
// Ausführen: node tools/build-precons.js
const fs = require('fs');
const path = require('path');
const BASE = 'https://mtgjson.com/api/v5';
const TYPES = new Set(['Commander Deck', 'MTGO Commander Deck']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      if (res.status === 404) return null;
    } catch (e) { /* retry */ }
    await sleep(1000 * 2 ** i);
  }
  throw new Error('Fehlgeschlagen: ' + url);
}

(async () => {
  const list = (await get(`${BASE}/DeckList.json`)).data.filter((d) => TYPES.has(d.type));
  const sets = (await get(`${BASE}/SetList.json`)).data;
  const setName = new Map(sets.map((s) => [s.code, s.name]));
  const out = [];
  for (const [i, d] of list.entries()) {
    const deck = (await get(`${BASE}/decks/${d.fileName}.json`))?.data;
    if (!deck) continue;
    const cmdrs = deck.commander || [];
    if (!cmdrs.length) continue;
    const ci = [...new Set(cmdrs.flatMap((c) => c.colorIdentity || []))].map((x) => x.toLowerCase());
    const cards = new Map();
    for (const c of deck.mainBoard || []) cards.set(c.name, (cards.get(c.name) || 0) + (c.count || 1));
    out.push({
      n: d.name,
      s: d.code,
      sn: setName.get(d.code) || d.code,
      d: d.releaseDate,
      c: cmdrs.map((c) => c.name),
      ci: 'wubrg'.split('').filter((k) => ci.includes(k)).join(''),
      k: [...cards].map(([name, q]) => (q > 1 ? [name, q] : name)),
    });
    if (i % 20 === 0) console.log(`${i + 1}/${list.length} ${d.name}`);
    await sleep(60);
  }
  out.sort((a, b) => (b.d || '').localeCompare(a.d || '') || a.n.localeCompare(b.n));
  const file = path.join(__dirname, '../data/precons.js');
  fs.writeFileSync(file, `/* Automatisch erzeugt aus MTGJSON (${new Date().toISOString().slice(0, 10)}) – node tools/build-precons.js */\nwindow.MTG_PRECONS = ${JSON.stringify(out)};\n`);
  console.log(`${out.length} Precons geschrieben, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
})();
