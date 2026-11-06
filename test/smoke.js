// Smoke-Test mit gemockten Scryfall-/EDHREC-Antworten.
// Ausführen: node test/smoke.js [--edhrec]
const { chromium } = require('playwright');
const path = require('path');

const useEdhrec = process.argv.includes('--edhrec');
const ORACLES = [
  ['Artifact', '{T}: Add {C}{C}.'],
  ['Sorcery', 'Search your library for a basic land card, put it onto the battlefield tapped.'],
  ['Instant', 'Draw two cards.'],
  ['Instant', 'Destroy target creature.'],
  ['Instant', 'Counter target spell.'],
  ['Sorcery', 'Destroy all creatures.'],
  ['Creature — Elf', 'Whenever another creature you control dies, each opponent loses 1 life.'],
  ['Enchantment', 'Whenever a creature you control dies, create a 1/1 green Elf Warrior creature token.'],
  ['Creature — Elf Druid', '{T}: Add {G}.'],
  ['Land', '{T}: Add {B} or {G}.'],
  ['Sorcery', 'Take an extra turn after this one.'],
];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function mkCard(name, i = hash(name)) {
  const basic = ['Forest', 'Swamp', 'Island', 'Plains', 'Mountain', 'Wastes'].includes(name);
  const cmdr = /Lathril|Commander/.test(name);
  const [type, text] = basic ? ['Basic Land — ' + name, ''] : cmdr ? ['Legendary Creature — Elf Noble', 'Whenever Lathril deals combat damage to a player, create that many 1/1 green Elf Warrior creature tokens.'] : ORACLES[i % ORACLES.length];
  const img = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"><rect width="100%" height="100%" fill="#345"/><text x="5" y="20" fill="#fff" font-size="10">${name.replace(/[<&]/g, '')}</text></svg>`);
  return {
    object: 'card', name, type_line: type, oracle_text: text, cmc: basic ? 0 : (i % 7),
    mana_cost: basic ? '' : '{' + (i % 4) + '}{B}{G}', color_identity: cmdr ? ['B', 'G'] : i % 3 === 0 ? ['G'] : i % 3 === 1 ? ['B'] : [],
    prices: { eur: (i % 50 / 4).toFixed(2), usd: (i % 50 / 3.5).toFixed(2) }, edhrec_rank: (i % 20000) + 1,
    game_changer: i % 23 === 0, legalities: { commander: 'legal' },
    image_uris: { small: img, normal: img, large: img }, scryfall_uri: 'https://scryfall.com',
  };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const queries = [];

  await page.route('https://api.scryfall.com/**', async (route) => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname === '/cards/collection') {
      const ids = JSON.parse(route.request().postData()).identifiers;
      const data = ids.filter((x) => x.name !== 'Unknown Card').map((x) => mkCard(x.name));
      body = { data, not_found: ids.filter((x) => x.name === 'Unknown Card') };
    } else if (url.pathname === '/cards/search') {
      const q = url.searchParams.get('q');
      queries.push(q);
      const h = hash(q);
      const isCmdr = q.includes('is:commander');
      body = { data: Array.from({ length: 30 }, (_, k) => mkCard(isCmdr ? `Commander ${h % 1000}-${k}` : `Mock ${h % 1000}-${k}`, h + k)), has_more: false };
    } else if (url.pathname === '/cards/named') {
      return route.fulfill({ status: 404, json: { object: 'error', details: 'not found' } });
    } else if (url.pathname === '/cards/autocomplete') {
      body = { data: ['Lathril, Blade of the Elves'] };
    } else return route.fulfill({ status: 404, json: {} });
    route.fulfill({ status: 200, json: body, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('https://json.edhrec.com/**', (route) => {
    if (!useEdhrec) return route.abort('failed');
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: {
      container: { json_dict: { cardlists: [{ header: 'High Synergy Cards', cardviews: Array.from({ length: 40 }, (_, k) => ({ name: `Edh Card ${k}`, synergy: 0.3, num_decks: 500 - k * 10, potential_decks: 1000 })) }] } },
    } });
  });

  await page.goto('file://' + path.resolve(__dirname, '../index.html'));

  // ---- Analyse ----
  await page.click('#example-btn');
  await page.fill('#decklist', (await page.inputValue('#decklist')) + '\n1 Unknown Card');
  await page.click('#an-themes .chip[data-id="tokens"]');
  await page.selectOption('#an-cap', '4');
  await page.click('#analyze-btn');
  await page.waitForSelector('#an-results .cmdr-head', { timeout: 20000 });
  const status1 = await page.textContent('#an-status');
  const cuts = await page.$$eval('.citem.cut', (n) => n.length);
  const adds = await page.$$eval('.citem.add', (n) => n.length);
  console.log('Analyse:', status1, '| cuts', cuts, '| adds', adds);
  if (process.env.SHOT_DIR) { await page.$eval('.citem.cut', (e) => e.scrollIntoView()); await page.screenshot({ path: process.env.SHOT_DIR + '/analyze.png' }); }
  // Export mit Auswahl
  await page.check('.pick[data-kind="cut"] >> nth=0');
  await page.check('.pick[data-kind="add"] >> nth=0');
  await page.click('#an-results [data-act="apply"]');
  const newList = await page.inputValue('#decklist');
  console.log('Neue Liste Zeilen:', newList.split('\n').length);

  // ---- Assistent ----
  await page.click('.tab-btn[data-tab="wizard"]');
  await page.click('.mana-btn.b');
  await page.click('.mana-btn.g');
  await page.click('#wz-themes .chip[data-id="aristocrats"]');
  await page.click('#wz-themes .chip[data-id="typal"]');
  await page.fill('#wz-typal', 'Elf');
  await page.click('#wz-budget .option[data-id="low"]');
  await page.click('#wizard-form button[type="submit"]');
  await page.waitForSelector('.cmdr-grid .btn', { timeout: 20000 });
  console.log('Commander-Vorschläge:', await page.$$eval('.cmdr-card', (n) => n.length));
  await page.click('.cmdr-grid .btn >> nth=0');
  await page.waitForSelector('#deck-result', { timeout: 30000 });
  console.log('Deck:', await page.textContent('#wz-status'));
  console.log('Deck-Tags:', (await page.textContent('#deck-result .info > div')).replace(/\s+/g, ' ').trim());
  const lines = await page.$$eval('.deck-line', (n) => n.length);
  console.log('Deck-Zeilen:', lines);
  if (process.env.SHOT_DIR) { await page.$eval('#deck-result', (e) => e.scrollIntoView()); await page.waitForTimeout(600); await page.screenshot({ path: process.env.SHOT_DIR + '/wizard.png' }); }
  console.log('Beispiel-Queries:', queries.slice(0, 3));
  console.log('JS-Fehler:', errors.length ? errors : 'keine');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
