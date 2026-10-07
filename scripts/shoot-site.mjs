/*
 * Снимает собранный сайт (dist/) теми же кадрами, что макет v2, в design/site-shots/.
 * Падает с ненулевым кодом при ошибках консоли, нарушениях CSP или внешних запросах.
 * Запуск: npm run shots
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, normalize, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const out = resolve(root, 'design/site-shots');

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

// Небольшой статический сервер над dist/: страница отдаётся по http, как в бою.
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
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch();
const problems = [];

for (const [name, width, height] of [
  ['1440', 1440, 900],
  ['375', 375, 812],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(`${e.violatedDirective} :: ${e.blockedURI}`);
    });
  });
  page.on('console', (m) => {
    if (!['error', 'warning'].includes(m.type())) return;
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) problems.push(`${name} CSP: ${t}`);
    else problems.push(`${name} ${m.type()}: ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`${name} requestfailed: ${r.url()}`));
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base) || u.startsWith('data:')) return;
    problems.push(`${name} external: ${u}`);
  });

  await page.goto(base + '/', { waitUntil: 'load' });
  let t = 0;
  for (const at of [2600, 4200, 9000, 13400]) {
    await page.waitForTimeout(at - t);
    t = at;
    await page.screenshot({ path: resolve(out, `hero-${name}-${at}.png`) });
  }
  const sections = [
    '#story .step[data-s="snooze"]',
    '#story .step[data-s="follow"]',
    '#story .step[data-s="undo"]',
    '#story .step[data-s="check"]',
    '.sort',
    '.kb',
    '#servers',
    '#never',
    '#download',
  ];
  for (const [i, sel] of sections.entries()) {
    // Скроллим к тому же месту, что и макет (без учёта scroll-margin плавающего меню),
    // чтобы кадры сравнивались напрямую.
    await page.locator(sel).evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const center = el.classList.contains('step');
      const top = rect.top + window.scrollY - (center ? (window.innerHeight - rect.height) / 2 : 0);
      window.scrollTo({ top, behavior: 'instant' });
    });
    await page.waitForTimeout(sel.includes('step') ? 2600 : 1800);
    await page.screenshot({ path: resolve(out, `s${i}-${name}.png`) });
  }
  const csp = await page.evaluate(() => window.__csp);
  for (const v of csp) problems.push(`${name} CSP(event): ${v}`);
  await page.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.error('Проблемы:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Консоль чистая, CSP без нарушений, внешних запросов нет');
