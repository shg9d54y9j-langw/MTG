// Test: Life Counter + PWA (Service Worker, Offline-Start).
// Ausführen: node test/life.js   (startet selbst einen lokalen Server; Screenshots: SHOT_DIR=...)
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ctx.route(/fonts\.(googleapis|gstatic)|scryfall|edhrec/, (r) => r.abort());

  await page.goto(base);
  // ---- PWA ----
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  check(manifest.display === 'standalone' && manifest.icons.length >= 3, `Manifest ok (${manifest.name}, ${manifest.icons.length} Icons)`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  check(await page.evaluate(() => !!navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true)), 'Service Worker aktiv');
  await page.reload();
  await page.waitForTimeout(500);
  const cached = await page.evaluate(async () => (await caches.keys()).join(', '));
  check(/cw-shell-/.test(cached), `Cache angelegt: ${cached}`);
  await ctx.setOffline(true);
  await page.reload();
  check(await page.isVisible('.brand'), 'Offline-Start funktioniert');
  await ctx.setOffline(false);

  // ---- Life Counter ----
  await page.click('.tab-btn[data-tab="life"]');
  if (SHOT) await page.screenshot({ path: `${SHOT}/life-setup.png` });
  await page.click('#ls-start');
  await page.waitForSelector('#life:not(.hidden) .ptile');
  check((await page.$$('.ptile')).length === 4, '4 Spielerfelder');
  const life = (i) => page.$eval(`.ptile[data-p="${i}"] .plife:not(.ghost)`, (e) => +e.textContent);
  await page.waitForTimeout(1400); // Hochzähl-Animation abwarten
  check((await life(3)) === 40, 'Startleben 40');

  // Tippen +1 / −1 (Zonen sind gedreht -> Mittelpunkt der Zone klicken)
  const zone = (i, d) => page.$(`.ptile[data-p="${i}"] .zone.${d}`);
  await (await zone(3, 'plus')).click();
  await (await zone(3, 'plus')).click();
  await (await zone(3, 'minus')).click();
  check((await life(3)) === 41, 'Tippen: +1 +1 −1 = 41');
  check(await page.$eval('.ptile[data-p="3"] .pdelta', (e) => e.textContent) === '+1', 'Delta-Anzeige +1');

  // Halten = −10
  const z = await zone(0, 'minus');
  const box = await z.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  check((await life(0)) === 30, 'Halten: −10 = 30');

  // Commander-Schaden über Panel
  await page.click('.ptile[data-p="1"] .pmenu-btn');
  await page.waitForSelector('.ptile[data-p="1"] .ppanel:not(.hidden)');
  if (SHOT) await page.screenshot({ path: `${SHOT}/life-panel.png` });
  const inc = await page.$$('.ptile[data-p="1"] .pstep[data-act="inc"][data-k^="cmd:"]');
  for (let k = 0; k < 5; k++) await inc[0].click();
  await page.click('.ptile[data-p="1"] .pstep[data-act="inc"][data-k="poison"]');
  await page.click('.ptile[data-p="1"] [data-act="close"]');
  check((await life(1)) === 35, 'Commander-Schaden 5 zieht Leben ab (35)');
  check(/☠ 1/.test(await page.textContent('.ptile[data-p="1"] .pbadges')), 'Gift-Badge sichtbar');

  // Tod bei 21 Commander-Schaden
  await page.click('.ptile[data-p="2"] .pmenu-btn');
  const inc2 = await page.$$('.ptile[data-p="2"] .pstep[data-act="inc"][data-k^="cmd:"]');
  for (let k = 0; k < 21; k++) await inc2[0].click();
  await page.click('.ptile[data-p="2"] [data-act="close"]');
  check(await page.$eval('.ptile[data-p="2"]', (e) => e.classList.contains('dead')), '21 Commander-Schaden = ausgeschieden');
  if (SHOT) await page.screenshot({ path: `${SHOT}/life-portrait.png` });

  // Menü, Würfel, Verlauf
  await page.click('.life-hub', { force: true });
  await page.click('[data-m="d20"]');
  await page.waitForTimeout(700);
  const roll = +(await page.textContent('#lm-result b'));
  check(roll >= 1 && roll <= 20, `W20 gewürfelt: ${roll}`);
  if (SHOT) await page.screenshot({ path: `${SHOT}/life-menu.png` });
  await page.waitForTimeout(1700);
  await page.click('[data-m="history"]');
  const rows = await page.$$('.lh-row');
  check(rows.length >= 3, `Verlauf mit ${rows.length} Einträgen`);
  await page.click('[data-m="menu"]');
  await page.click('[data-m="close"]');

  // Speichern & Fortsetzen nach Reload
  await page.reload();
  await page.waitForSelector('#life:not(.hidden) .ptile');
  await page.waitForTimeout(1400);
  check((await life(3)) === 41, 'Spielstand nach Neuladen erhalten (#life)');

  // Commander-Schaden-Modus (⚔ beim Angreifer, ±1 bei den Gegnern)
  await page.click('.ptile[data-p="0"] .pcmd-btn');
  check(await page.$eval('#life', (e) => e.classList.contains('cmd-mode')), '⚔ startet den Commander-Schaden-Modus');
  check((await page.$$('.ptile.cmd-dst')).length === 3, 'Alle 3 Gegner zeigen das Schadensfeld');
  const before = await life(3);
  for (let k = 0; k < 3; k++) await page.click('.ptile[data-p="3"] .czone.plus');
  await page.click('.ptile[data-p="3"] .czone.minus');
  check((await page.textContent('.ptile[data-p="3"] .cz-val')) === '2', 'Gegner-Feld zeigt 2 Commander-Schaden');
  await page.waitForTimeout(400);
  if (SHOT) await page.screenshot({ path: `${SHOT}/life-cmd.png` });
  await page.click('.ptile[data-p="0"] [data-cmd-done]');
  check(!(await page.$eval('#life', (e) => e.classList.contains('cmd-mode'))), '„Fertig“ beendet den Modus');
  check((await life(3)) === before - 2, `Leben automatisch abgezogen (${before} → ${await life(3)})`);
  check(/2/.test(await page.textContent('.ptile[data-p="3"] .badge.cmd')), 'Commander-Schaden-Badge beim Gegner');

  // Partner: zweiter Commander wird getrennt gezählt
  await page.click('.ptile[data-p="0"] .pmenu-btn');
  await page.click('.ptile[data-p="0"] .pswitch');
  await page.click('.ptile[data-p="0"] [data-act="close"]');
  await page.click('.ptile[data-p="0"] .pcmd-btn');
  await page.click('.ptile[data-p="0"] [data-cmd-which="b"]');
  await page.click('.ptile[data-p="3"] .czone.plus');
  await page.click('.life-hub', { force: true }); // Menüknopf beendet den Modus
  const cmd3 = await page.evaluate(() => MTG.life.game().players[3].cmd);
  check(cmd3['0'] === 2 && cmd3['0b'] === 1, `Partner getrennt gezählt (${JSON.stringify(cmd3)})`);
  await page.waitForTimeout(1800);
  await page.click('.life-hub', { force: true });
  await page.click('[data-m="history"]');
  check(/⚔/.test(await page.textContent('.lm-history')), 'Verlauf zeigt, von wem der Commander-Schaden kam');
  await page.click('[data-m="menu"]');
  await page.click('[data-m="close"]');

  // Querformat
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  const rot = await page.$eval('.ptile[data-p="0"] .pinner', (e) => e.className);
  check(/r180/.test(rot), `Querformat: Spieler 1 gedreht (${rot})`);
  if (SHOT) await page.screenshot({ path: `${SHOT}/life-landscape.png` });

  // 6 Spieler
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('.life-hub', { force: true });
  await page.click('[data-m="setn"][data-v="6"]');
  await page.click('[data-m="new"]');
  check((await page.$$('.ptile')).length === 6, '6 Spieler');
  if (SHOT) await page.screenshot({ path: `${SHOT}/life-6.png` });

  // Beenden
  await page.click('.life-hub', { force: true });
  await page.click('[data-m="exit"]');
  check(await page.$eval('#life', (e) => e.classList.contains('hidden')), 'Beenden schließt den Counter');
  console.log('JS-Fehler:', errors.length ? errors : 'keine');
  await browser.close();
  server.close();
})();
