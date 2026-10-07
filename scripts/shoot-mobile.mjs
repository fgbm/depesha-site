/*
 * Мобильные кадры для глазной проверки: hero на 375 и 412 в трёх моментах
 * анимации, политика конфиденциальности на 360 и подвал на 360.
 * Кладёт файлы в design/site-shots/mobile/. Запуск: npm run shots:mobile
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, normalize, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const out = resolve(root, 'design/site-shots/mobile');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('Нет dist/index.html — сначала соберите сайт: npm run build');
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = normalize(join(dist, url));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!extname(file) || !existsSync(file)) {
      const asDir = join(file, 'index.html');
      if (existsSync(asDir)) file = asDir;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();

// Hero: 375 и 412 пикселя, три момента анимации разбора входящих.
for (const name of ['375', '412']) {
  const page = await browser.newPage({ viewport: { width: Number(name), height: 812 } });
  await page.goto(base + '/', { waitUntil: 'load' });
  let t = 0;
  for (const at of [2600, 5600, 9200]) {
    await page.waitForTimeout(at - t);
    t = at;
    await page.locator('.hero').screenshot({ path: resolve(out, `hero-${name}-${at}.png`) });
  }
  await page.close();
}

// Политика конфиденциальности на 360: заголовок с длинным словом.
{
  const page = await browser.newPage({ viewport: { width: 360, height: 812 } });
  await page.goto(base + '/privacy/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(out, 'privacy-360-top.png') });
  await page.close();
}

// Подвал на 360.
{
  const page = await browser.newPage({ viewport: { width: 360, height: 812 } });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.locator('.foot').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, 'footer-360.png') });
  await page.close();
}

await browser.close();
server.close();
console.log(`Кадры в ${out}`);
