// Smoke test for the built single-file game: boots, starts, walks forward, no errors.
// Run through `npm run test:e2e` (builds first). Set CHROMIUM_PATH to override the browser binary.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  for (const dir of readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse()) {
    const exe = resolve(root, dir, 'chrome-linux', 'chrome');
    if (existsSync(exe)) return exe;
  }
  throw new Error(`No chromium binary found under ${root}`);
}

const dist = resolve(import.meta.dirname, '../../dist/index.html');
if (!existsSync(dist)) throw new Error('dist/index.html missing: run npm run build');

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: [
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const externalRequests = [];
  page.on(
    'console',
    (msg) => msg.type() === 'error' && failures.push(`console.error: ${msg.text()}`),
  );
  page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}`));
  page.on(
    'request',
    (req) =>
      !req.url().startsWith('file:') &&
      !req.url().startsWith('data:') &&
      externalRequests.push(req.url()),
  );

  await page.goto(`${pathToFileURL(dist)}?debug`);
  await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 15000 });

  await page.click('#overlay');
  await page.waitForFunction(() => window.__game?.state === 'playing');
  const before = await page.evaluate(() => window.__game.position);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__game.position);
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  const { lookMode, tick } = await page.evaluate(() => window.__game);
  console.log(`look mode: ${lookMode}, ticks: ${tick}, moved: ${moved.toFixed(2)} m`);

  if (moved < 0.5) failures.push(`player barely moved (${moved.toFixed(3)} m)`);
  if (externalRequests.length) failures.push(`external requests: ${externalRequests.join(', ')}`);

  await page.keyboard.press('Escape');
  await page
    .waitForFunction(() => window.__game?.state === 'paused', null, { timeout: 5000 })
    .catch(() => {
      // In pointer-lock mode Escape is consumed by the browser; the lock-loss path is covered by the real UI.
      if (lookMode === 'drag') failures.push('Escape did not pause in drag mode');
    });
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('e2e smoke: OK');
