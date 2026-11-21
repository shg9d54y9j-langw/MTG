// Live-Test: Life Counter mit echten Commander-Hintergründen (Scryfall + Bilder), Schriften, Animationen.
// Ausführen: NODE_USE_ENV_PROXY=1 node test/live-life.js   (Screenshots: SHOT_DIR=...)
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const SHOT = process.env.SHOT_DIR;
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const check = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) process.exitCode = 1; };
const shot = (page, name) => SHOT && page.screenshot({ path: `${SHOT}/${name}.png` });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Externe Requests über Node (Proxy/CA des Systems) weiterreichen
  await ctx.route(/^https:\/\/(api\.scryfall\.com|cards\.scryfall\.io)\//, async (route) => {
    const req = route.request();
    try {
      const res = await fetch(req.url(), { method: req.method(), headers: { Accept: req.headers().accept || '*/*', 'Content-Type': 'application/json', 'User-Agent': 'CommanderWerkstatt-Test/1.0' }, body: req.method() === 'POST' ? req.postData() : undefined });
      await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': res.headers.get('content-type') || '', 'access-control-allow-origin': '*' } });
    } catch { await route.abort('failed'); }
  });
  await ctx.route(/json\.edhrec\.com/, (r) => r.abort());

  await page.goto(base + '#life');
  await page.waitForSelector('#life:not(.hidden) .ptile');
  await page.waitForTimeout(300);
  await shot(page, 'll-intro');            // Einflug-Animation mitten im Ablauf
  await page.waitForTimeout(1500);
  const lifeOf = (i) => page.$eval(`.ptile[data-p="${i}"] .plife:not(.ghost)`, (e) => +e.textContent);
  check((await lifeOf(0)) === 40, 'Hochzählen endet bei 40');

  const openPick = async (i) => {
    await page.click(`.ptile[data-p="${i}"] .pmenu-btn`);
    await page.click(`.ptile[data-p="${i}"] [data-act="wall"]`);
    await page.waitForSelector('.life-modal:not(.hidden) .picker');
  };
  const M = '.life-modal';
  const done = () => page.click(`${M} .lm-foot [data-act="pclose"]`);
  const waitHits = () => page.waitForFunction(() => /Treffer/.test(document.querySelector('.life-modal [data-wall-label]').textContent), null, { timeout: 20000 });

  // Spieler 1: beliebte Commander → erstes Bild → zweites Artwork
  await openPick(0);
  await page.waitForSelector(`${M} .pwall-grid .pthumb`, { timeout: 30000 });
  const popular = await page.$$eval(`${M} .pwall-grid .pthumb`, (n) => n.length);
  check(popular >= 12, `Beliebte Commander geladen: ${popular}`);
  await page.waitForTimeout(1500);
  await shot(page, 'll-picker');
  await page.click(`${M} .pwall-grid .pthumb >> nth=0`);
  await page.waitForSelector(`${M} .pwall-arts:not(.hidden) .pthumb`, { timeout: 20000 }).catch(() => null);
  const arts = await page.$$eval(`${M} .pwall-arts .pthumb`, (n) => n.length);
  console.log('  Artworks des ersten Commanders:', arts);
  if (arts > 1) await page.click(`${M} .pwall-arts .pthumb >> nth=1`);
  await page.waitForTimeout(1200);
  await shot(page, 'll-picker-picked');
  await done();

  // Spieler 2: Suche „atraxa“ (Fenster ist zu diesem Spieler gedreht)
  await openPick(1);
  check(await page.$eval(`${M} .picker`, (e) => e.dataset.rot) === '270', 'Auswahlfenster zu Spieler 2 gedreht (270°)');
  await page.fill(`${M} .pk-input`, 'atraxa');
  await waitHits();
  const names = await page.$$eval(`${M} .pwall-grid .pthumb`, (n) => n.map((x) => x.dataset.name));
  check(names.some((n) => /Atraxa/.test(n)), `Suche „atraxa“: ${names.slice(0, 3).join(', ')}`);
  await page.click(`${M} .pwall-grid .pthumb >> nth=0`);
  await page.waitForTimeout(800);
  await shot(page, 'll-picker-rotated');
  await done();

  // Spieler 3: Zufall
  await openPick(2);
  await page.click(`${M} [data-act="random"]`);
  await page.waitForFunction(() => document.querySelector('.ptile[data-p="2"] .pinner').classList.contains('has-art'), null, { timeout: 20000 });
  check(true, 'Zufälliger Commander gesetzt');
  await done();

  // Spieler 4: Suche „krenko“
  await openPick(3);
  await page.fill(`${M} .pk-input`, 'krenko');
  await waitHits();
  await page.click(`${M} .pwall-grid .pthumb >> nth=0`);
  await done();
  await page.waitForTimeout(1600);
  const withArt = await page.$$eval('.pinner.has-art', (n) => n.length);
  check(withArt === 4, `Alle 4 Spieler mit Hintergrund (${withArt})`);
  await shot(page, 'll-arts');

  // Zahl-Animation mitten im Ablauf
  await page.click('.ptile[data-p="3"] .zone.minus');
  await page.waitForTimeout(110);
  await shot(page, 'll-roll');
  await page.waitForTimeout(500);

  // Schriften
  for (const f of ['unbounded', 'cinzel', 'inter', 'shoulders']) {
    await page.click('.life-hub', { force: true });
    await page.click(`[data-m="font"][data-v="${f}"]`);
    if (f === 'unbounded') await shot(page, 'll-menu');
    await page.click('[data-m="close"]');
    await page.waitForTimeout(250);
    await shot(page, 'll-font-' + f);
  }

  // Wenig Leben + Sieg
  const z = await page.$('.ptile[data-p="1"] .zone.minus');
  const b = await z.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(480 + 650 * 2 + 200); await page.mouse.up();
  check(await page.$eval('.ptile[data-p="1"]', (e) => e.classList.contains('low')), `Wenig Leben (${await lifeOf(1)}) → Warnpuls`);
  for (const p of [1, 2, 3]) {
    await page.evaluate((i) => { const g = MTG.life.game(); g.players[i].life = 1; }, p);
    await page.click(`.ptile[data-p="${p}"] .zone.minus`);
  }
  await page.waitForTimeout(450);
  check(await page.$eval('.ptile[data-p="0"]', (e) => e.classList.contains('won')), 'Letzter Überlebender gewinnt');
  await shot(page, 'll-win');

  console.log('JS-Fehler:', errors.length ? errors : 'keine');
  await browser.close();
  server.close();
})();
