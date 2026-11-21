// Live-Test für den Tab „Neue Commander“ (echte Scryfall-Daten).
// Ausführen: NODE_USE_ENV_PROXY=1 node test/live-new.js   (Screenshots: SHOT_DIR=...)
const { chromium } = require('playwright');
const path = require('path');
const SHOT = process.env.SHOT_DIR;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.route(/^https:\/\/(api\.scryfall\.com|json\.edhrec\.com|fonts\.(googleapis|gstatic)\.com)\//, async (route) => {
    const req = route.request();
    try {
      const res = await fetch(req.url(), {
        method: req.method(),
        headers: { Accept: req.headers()['accept'] || '*/*', 'Content-Type': req.headers()['content-type'] || 'application/json', 'User-Agent': 'CommanderWerkstatt-Test/1.0' },
        body: req.method() === 'POST' ? req.postData() : undefined,
      });
      await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': res.headers.get('content-type') || '', 'access-control-allow-origin': '*' } });
    } catch { await route.abort('failed'); }
  });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('.tab-btn[data-tab="new"]');
  await page.waitForSelector('#nc-list .nc-card', { timeout: 60000 });
  console.log('Zähler:', await page.textContent('#nc-count'));
  const groups = await page.$$eval('.nc-group-head', (n) => n.slice(0, 8).map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('Gruppen:', groups.join(' | '));
  if (SHOT) await page.screenshot({ path: `${SHOT}/new.png` });
  await page.click('#nc-sources .chip[data-src="sld"]');
  console.log('Secret Lair:', await page.textContent('#nc-count'), '|', (await page.$$eval('.nc-card .nm', (n) => n.slice(0, 5).map((x) => x.textContent))).join(', '));
  await page.click('#nc-sources .chip[data-src="upcoming"]');
  console.log('Angekündigt:', await page.textContent('#nc-count'));
  await page.click('#nc-sources .chip[data-src="all"]');
  await page.selectOption('#nc-sort', 'pop');
  console.log('Beliebteste:', (await page.$$eval('.nc-card .nm', (n) => n.slice(0, 5).map((x) => x.textContent))).join(', '));
  await page.selectOption('#nc-period', '365');
  await page.waitForFunction(() => /von \d+/.test(document.querySelector('#nc-count').textContent) && !document.querySelector('#nc-status').classList.contains('busy'), null, { timeout: 90000 });
  console.log('Letztes Jahr:', await page.textContent('#nc-count'));
  await page.click('.nc-card [data-build] >> nth=0');
  await page.waitForSelector('#deck-result', { timeout: 180000 });
  console.log('Deck:', (await page.textContent('#deck-result h2')).trim(), '|', (await page.textContent('#deck-result .tags')).replace(/\s+/g, ' ').trim());
  console.log('JS-Fehler:', errors.length ? errors : 'keine');
  await browser.close();
})();
