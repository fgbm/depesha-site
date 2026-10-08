/*
 * Проверка горизонтального переполнения собранного сайта (dist/).
 * На узких ширинах (320–412) для каждой страницы смотрит, что документ не шире
 * экрана и что ни один видимый элемент не вылезает за правый край.
 * Элементы внутри контейнеров с overflow hidden/clip, декоративная спираль
 * .spiral и улетающие карточки .letter в состоянии ухода не считаются
 * переполнением. На главной проверка повторяется после прокрутки к каждому разделу.
 * Падает с ненулевым кодом при нарушениях. Запуск: npm run overflow
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, normalize, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

// Страница сама спрашивает у GitHub номер последнего релиза. В проверке
// подменяем этот запрос фикстурой: так тест не зависит от сети и лимита,
// а любой другой внешний запрос остаётся ошибкой.
const releaseUrl = 'https://api.github.com/repos/fgbm/depesha/releases/latest';
const fixture = readFileSync(resolve(root, 'scripts/fixtures/release.json'), 'utf8');

// Собираем свежий dist, чтобы проверять ровно то, что уйдёт на сайт.
execSync('npm run build', { cwd: root, stdio: 'inherit' });

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

// Внутри страницы: собрать нарушения на текущем положении прокрутки.
const probe = () => {
  const iw = innerWidth;
  const desc = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 6) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      const cls = [...n.classList].slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  // Контейнер режет по горизонтали — элемент внутри него не расширяет документ.
  const clipped = (el) => {
    let n = el.parentElement;
    while (n && n !== document.body && n !== document.documentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll') return true;
      n = n.parentElement;
    }
    return false;
  };
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.closest('.spiral')) continue;
    if (el.classList.contains('letter') && /gone-/.test(el.className)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= iw + 1) continue;
    if (clipped(el)) continue;
    offenders.push(`${desc(el)} (right=${Math.round(r.right)})`);
  }
  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: iw,
    offenders: [...new Set(offenders)],
  };
};

const pages = [
  { path: '/', name: '/', scroll: true },
  { path: '/privacy/', name: '/privacy/', scroll: false },
  { path: '/404.html', name: '/404.html', scroll: false },
];
const widths = [320, 360, 375, 412];
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

const browser = await chromium.launch();
const problems = [];

for (const pg of pages) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 812 } });
    await page.route(releaseUrl, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: fixture }),
    );
    page.on('request', (r) => {
      const u = r.url();
      if (u.startsWith(base) || u.startsWith('data:') || u === releaseUrl) return;
      problems.push(`${pg.name} @${width} external: ${u}`);
    });
    await page.goto(base + pg.path, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const spots = [['top', null], ...(pg.scroll ? sections.map((s) => [s, s]) : [])];
    for (const [label, sel] of spots) {
      if (sel) {
        await page.locator(sel).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const center = el.classList.contains('step');
          const top = r.top + window.scrollY - (center ? (window.innerHeight - r.height) / 2 : 0);
          window.scrollTo({ top, behavior: 'instant' });
        });
        await page.waitForTimeout(250);
      }
      const r = await page.evaluate(probe);
      if (r.scrollWidth > r.innerWidth + 1) {
        problems.push(`${pg.name} @${width} ${label}: документ шире экрана (scrollWidth=${r.scrollWidth} > ${r.innerWidth})`);
      }
      for (const o of r.offenders) problems.push(`${pg.name} @${width} ${label}: ${o}`);
    }
    await page.close();
  }
}

await browser.close();
server.close();

if (problems.length) {
  console.error('Горизонтальное переполнение:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Переполнения нет: 320/360/375/412 — документ по ширине экрана, элементы не выходят за край');
