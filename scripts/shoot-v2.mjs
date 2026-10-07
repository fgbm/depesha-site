/*
 * Снимает макет v2: первый экран в нескольких кадрах анимации и разделы ниже,
 * собирает ошибки консоли и неудачные запросы.
 * Запуск: node scripts/shoot-v2.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'design/mockups/v2/shots');
mkdirSync(out, { recursive: true });
const url = 'file://' + resolve(root, 'design/mockups/v2/index.html');

const browser = await chromium.launch();
const logs = [];
for (const [name, width, height] of [['1440', 1440, 900], ['375', 375, 812]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${name} ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`${name} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`${name} requestfailed: ${r.url()}`));
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) logs.push(`${name} external: ${r.url()}`); });
  await page.goto(url, { waitUntil: 'load' });
  for (const t of [2600, 4200, 9000, 13400]) {
    await page.waitForTimeout(t - (page._t || 0)); page._t = t;
    await page.screenshot({ path: resolve(out, `hero-${name}-${t}.png`) });
  }
  const sections = ['#story .step[data-s="snooze"]', '#story .step[data-s="follow"]', '#story .step[data-s="undo"]', '#story .step[data-s="check"]', '.sort', '.kb', '#servers', '#never', '#download'];
  for (const [i, sel] of sections.entries()) {
    await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: el.classList.contains('step') ? 'center' : 'start' }));
    await page.waitForTimeout(sel.includes('step') ? 2600 : 1800);
    await page.screenshot({ path: resolve(out, `s${i}-${name}.png`) });
  }
  await page.close();
}
await browser.close();
console.log(logs.length ? logs.join('\n') : 'Консоль чистая, внешних запросов нет');
