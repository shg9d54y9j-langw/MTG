// Erzeugt die App-Icons (PNG) aus einem SVG-Entwurf.
// Ausführen: node tools/make-icons.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const svg = (maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b4cf0"/><stop offset="1" stop-color="#a855f7"/>
    </linearGradient>
    <radialGradient id="glow" cx=".3" cy=".2" r=".9">
      <stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="url(#glow)"/>
  <g transform="translate(256 256) scale(${maskable ? 0.78 : 1})">
    <rect x="-118" y="-118" width="236" height="236" rx="46" transform="rotate(45)" fill="#fff"/>
    <g>
      <circle cx="0" cy="-62" r="25" fill="#f3e9c6" stroke="#e2d6a8" stroke-width="3"/>
      <circle cx="59" cy="-19" r="25" fill="#3d8be0"/>
      <circle cx="37" cy="51" r="25" fill="#4b4453"/>
      <circle cx="-37" cy="51" r="25" fill="#e2513b"/>
      <circle cx="-59" cy="-19" r="25" fill="#2e9e5b"/>
    </g>
  </g>
</svg>`;

(async () => {
  const out = path.join(__dirname, '../icons');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon.svg'), svg(false).trim());
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sizes = [
    ['icon-192.png', 192, false], ['icon-512.png', 512, false],
    ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true],
    ['favicon-32.png', 32, false],
  ];
  for (const [name, size, maskable] of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(maskable).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    await page.screenshot({ path: path.join(out, name), omitBackground: true });
    console.log('✓', name);
  }
  await browser.close();
})();
