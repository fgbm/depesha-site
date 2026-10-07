/*
 * Рендерит картинку для Open Graph (1200×630) из страницы-шаблона
 * scripts/og-template.html в public/og.png.
 * Запуск: npm run og
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = 'file://' + resolve(root, 'scripts/og-template.html');
const out = resolve(root, 'public/og.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(template, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
await page.screenshot({ path: out });
await browser.close();
console.log('og.png готов:', out);
