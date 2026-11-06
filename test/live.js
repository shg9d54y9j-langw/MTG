// Live-Test gegen echte APIs (Scryfall, EDHREC). Netzwerkzugriff erforderlich.
// Ausführen: NODE_USE_ENV_PROXY=1 node test/live.js   (Screenshots: SHOT_DIR=...)
const { chromium } = require('playwright');
const path = require('path');
const SHOT = process.env.SHOT_DIR;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const limited = {};
  page.on('response', (r) => {
    if (r.status() !== 429) return;
    const u = new URL(r.url());
    const k = u.host + u.pathname.split('/').slice(0, 3).join('/');
    limited[k] = (limited[k] || 0) + 1;
  });
  // Requests über Node weiterleiten (nutzt Proxy + CA des Systems)
  await page.route(/^https:\/\/(api\.scryfall\.com|json\.edhrec\.com|fonts\.(googleapis|gstatic)\.com)\//, async (route) => {
    const req = route.request();
    try {
      const res = await fetch(req.url(), {
        method: req.method(),
        headers: { Accept: req.headers()['accept'] || '*/*', 'Content-Type': req.headers()['content-type'] || 'application/json', 'User-Agent': 'CommanderWerkstatt-Test/1.0' },
        body: req.method() === 'POST' ? req.postData() : undefined,
      });
      const body = Buffer.from(await res.arrayBuffer());
      await route.fulfill({ status: res.status, body, headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' } });
    } catch (e) { await route.abort('failed'); }
  });
  const shot = async (name) => SHOT && page.screenshot({ path: `${SHOT}/${name}.png` });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));

  // ---- Precons ----
  await page.click('.tab-btn[data-tab="precon"]');
  await page.waitForTimeout(2500);
  console.log('Precon-Zähler:', await page.textContent('#pc-count'));
  await shot('precon-grid');
  await page.fill('#pc-search', 'lathril');
  await page.waitForTimeout(400);
  console.log('Suche „lathril“:', await page.textContent('#pc-count'));
  await page.click('.precon-tile >> nth=0');
  await page.waitForSelector('#pc-upgrade, #pc-results .cmdr-head', { timeout: 120000 });
  console.log('Precon-Analyse:', (await page.textContent('#pc-results .tags')).replace(/\s+/g, ' ').trim());
  console.log('Upgrade-Paket:', (await page.textContent('.swap-total span')).trim());
  console.log('Tausche:', (await page.$$eval('#pc-upgrade .swap', (n) => n.map((x) => [...x.querySelectorAll('.name')].map((a) => a.textContent).join(' → ')))).join(' | '));
  await shot('precon-detail');
  await page.waitForSelector('#pc-ideas .cmdr-card', { timeout: 180000 });
  const ideas = await page.$$eval('#pc-ideas .cmdr-card .nm', (n) => n.map((x) => x.textContent));
  console.log('Umbau-Ideen:', ideas.join(' | '));
  await page.$eval('#pc-rebuild', (e) => e.scrollIntoView());
  await shot('precon-ideas');
  await page.click('#pc-ideas .cmdr-card .btn >> nth=0');
  await page.waitForSelector('#pc-rebuild-result .cmdr-head', { timeout: 120000 });
  console.log('Umbau-Analyse:', (await page.textContent('#pc-rebuild-result h2')).trim(), '| Cuts:', await page.$$eval('#pc-rebuild-result .citem.cut', (n) => n.length));

  // ---- Assistent ----
  await page.click('.tab-btn[data-tab="wizard"]');
  await page.click('.mana-btn.b'); await page.click('.mana-btn.g');
  await page.click('#wz-themes .chip[data-id="aristocrats"]');
  await page.click('#wz-budget .option[data-id="low"]');
  await shot('wizard');
  await page.click('#wizard-form button[type="submit"]');
  await page.waitForSelector('#wz-results .cmdr-card', { timeout: 60000 });
  console.log('Commander-Vorschläge:', (await page.$$eval('#wz-results .cmdr-card .nm', (n) => n.map((x) => x.textContent))).slice(0, 6).join(' | '));
  await page.click('#wz-results .cmdr-card .btn >> nth=0');
  await page.waitForSelector('#deck-result', { timeout: 180000 });
  console.log('Deck:', (await page.textContent('#deck-result .tags')).replace(/\s+/g, ' ').trim(), '|', (await page.textContent('#deck-result .stats')).replace(/\s+/g, ' ').trim());
  await page.$eval('#deck-result', (e) => e.scrollIntoView());
  await shot('wizard-deck');

  // ---- Analyzer ----
  await page.click('.tab-btn[data-tab="analyze"]');
  await page.click('#example-btn');
  await page.click('#analyze-btn');
  await page.waitForSelector('#an-results .cmdr-head', { timeout: 120000 });
  console.log('Analyzer:', await page.textContent('#an-status'));
  await shot('analyze');
  console.log('429-Antworten:', Object.keys(limited).length ? limited : 'keine');
  console.log('JS-Fehler:', errors.length ? errors : 'keine');
  await browser.close();
})();
