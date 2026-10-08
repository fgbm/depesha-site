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

// Единственный внешний адрес, который странице разрешено запрашивать: GitHub API
// за номером последнего релиза. В тестах подменяем его фикстурой, чтобы не
// зависеть от сети и лимита.
const releaseUrl = 'https://api.github.com/repos/fgbm/depesha/releases/latest';
const fixture = JSON.parse(readFileSync(resolve(root, 'scripts/fixtures/release.json'), 'utf8'));
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

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
  await page.route(releaseUrl, (r) => r.fulfill(json(fixture)));
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
    if (u.startsWith(base) || u.startsWith('data:') || u === releaseUrl) return;
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

// --- Живой релиз: ответ GitHub подменяем фикстурой с версией 9.9.9 ---
const fixture999 = JSON.parse(JSON.stringify(fixture).replaceAll('0.7.0', '9.9.9'));
const UA = {
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
};
const HERO_EXT = { linux: '.AppImage', win: '.msi', mac: '.dmg' };

for (const [os, userAgent] of Object.entries(UA)) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, userAgent });
  await page.route(releaseUrl, (r) => r.fulfill(json(fixture999)));
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const got = await page.evaluate(() => ({
    version: document.querySelector('.dl .version')?.textContent?.trim() ?? '',
    hero: document.getElementById('cta-main')?.getAttribute('href') ?? '',
    chips: [...document.querySelectorAll('.os-card .fmts a[data-fmt]')].map((a) => [
      a.getAttribute('data-fmt'),
      a.getAttribute('href'),
    ]),
  }));
  const chip = (f) => got.chips.find(([k]) => k === f)?.[1] ?? '';
  if (!got.version.includes('9.9.9')) problems.push(`live ${os}: версия не обновилась (${got.version})`);
  if (!got.hero.includes('9.9.9')) problems.push(`live ${os}: кнопка hero без 9.9.9 (${got.hero})`);
  if (!got.hero.endsWith(HERO_EXT[os])) problems.push(`live ${os}: hero не ${HERO_EXT[os]} (${got.hero})`);
  for (const f of ['appimage', 'deb', 'rpm', 'msi', 'arm', 'x64']) {
    if (!chip(f).includes('9.9.9')) problems.push(`live ${os}: чип ${f} без 9.9.9 (${chip(f)})`);
  }
  await page.close();
}

// --- Ошибки GitHub (403 и таймаут) оставляют вшитые значения, без pageerror ---
const FAILS = [
  ['403', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"rate limit"}' })],
  [
    'таймаут',
    (r) =>
      new Promise((res) => {
        // Запрос «висит» дольше четырёх секунд — срабатывает AbortController страницы.
        setTimeout(() => {
          r.fulfill(json(fixture999)).catch(() => {});
          res();
        }, 5500);
      }),
  ],
];
for (const [label, respond] of FAILS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.route(releaseUrl, respond);
  await page.goto(base + '/', { waitUntil: 'load' });
  const baked = await page.evaluate(() => document.querySelector('.dl .version')?.getAttribute('data-version') ?? '');
  await page.waitForTimeout(4500);
  const after = await page.evaluate(() => document.querySelector('.dl .version')?.textContent?.trim() ?? '');
  if (!after.includes(baked)) problems.push(`live ${label}: вшитая версия не сохранилась («${baked}» -> «${after}»)`);
  if (pageErrors.length) problems.push(`live ${label}: pageerror: ${pageErrors.join('; ')}`);
  await page.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.error('Проблемы:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Консоль чистая, CSP без нарушений, внешних запросов нет');
