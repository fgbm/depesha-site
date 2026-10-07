/*
 * Снимает скриншоты трёх макетов первого экрана на 1440x900 и 375x812,
 * а заодно собирает ошибки консоли и неудачные запросы.
 * Запуск: node scripts/shoot.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'design/mockups/hero/shots');
mkdirSync(out, { recursive: true });

const variants = ['index', 'a', 'b', 'c'];
const sizes = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375', width: 375, height: 812 },
];

const browser = await chromium.launch();
let problems = 0;

for (const v of variants) {
  for (const s of sizes) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2 });
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => logs.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    const url = 'file://' + resolve(root, `design/mockups/hero/${v}.html`);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const shot = resolve(out, `${v}-${s.name}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`${v}-${s.name}: ${shot}`);
    if (logs.length) { problems += logs.length; console.log('  ! ' + logs.join('\n  ! ')); }
    await page.close();
  }
}

await browser.close();
console.log(problems ? `\nПРОБЛЕМЫ: ${problems}` : '\nКонсоль чистая, запросов в сеть нет.');
