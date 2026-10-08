/*
 * Страница сама спрашивает у GitHub номер последнего релиза и обновляет версию
 * и ссылки на файлы, чтобы кнопки на скачивание вели на свежие сборки: релизы
 * выходят несколько раз в день. Значения, вшитые при сборке, остаются запасным
 * вариантом — при ошибке, таймауте или лимите мы ничего не меняем и молчим
 * в консоли.
 *
 * Ответ кэшируется в localStorage на 10 минут: без этого каждое открытие
 * страницы тратило бы лимит GitHub в 60 запросов в час на IP.
 */
import { classify, pick } from '../lib/release-parse';
import type { Downloads } from '../lib/release-parse';
import { detectOs, chooseUrl } from '../lib/os';

const API = 'https://api.github.com/repos/fgbm/depesha/releases/latest';
const CACHE_KEY = 'depesha:release:1'; // номер версии схемы кэша в ключе
const CACHE_TTL = 10 * 60 * 1000;
const TIMEOUT = 4000;

interface Cache {
  t: number;
  d: Downloads;
}

function readCache(): Downloads | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cache;
    if (!c || typeof c.t !== 'number' || Date.now() - c.t > CACHE_TTL) return null;
    return c.d;
  } catch {
    return null;
  }
}

function writeCache(d: Downloads): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d } as Cache));
  } catch {
    // Приватный режим или переполнение — просто не кэшируем.
  }
}

/** Обновляем разметку, только если пришла версия, отличная от вшитой. */
function apply(d: Downloads): void {
  const versionEl = document.querySelector<HTMLElement>('.dl .version');
  const baked = versionEl?.dataset.version ?? '';
  if (!d.version || d.version === baked) return;

  // Ссылки чипов форматов в блоке «Скачать».
  const chips: Record<string, string | null> = {
    appimage: d.linux.appimage,
    deb: d.linux.deb,
    rpm: d.linux.rpm,
    msi: d.windows.msi,
    exe: d.windows.exe,
    arm: d.mac.arm,
    x64: d.mac.x64,
  };
  document.querySelectorAll<HTMLAnchorElement>('.os-card .fmts a[data-fmt]').forEach((a) => {
    const fmt = a.dataset.fmt ?? '';
    if (fmt in chips) a.setAttribute('href', pick(chips[fmt] ?? null));
  });

  // Главная кнопка: данные для всех систем и ссылка для системы посетителя.
  const cta = document.getElementById('cta-main') as HTMLAnchorElement | null;
  if (cta) {
    const linux = d.linux.appimage ?? d.linux.deb ?? '';
    const win = d.windows.msi ?? d.windows.exe ?? '';
    const macArm = d.mac.arm ?? '';
    const macX64 = d.mac.x64 ?? '';
    cta.dataset.linux = linux;
    cta.dataset.win = win;
    cta.dataset.macArm = macArm;
    cta.dataset.macX64 = macX64;
    const { os, arm } = detectOs();
    const url = chooseUrl(os, arm, { linux, win, macArm, macX64 });
    if (url) cta.setAttribute('href', url);
  }

  // Номер версии.
  if (versionEl) {
    versionEl.dataset.version = d.version;
    versionEl.textContent = `Версия ${d.version}`;
    versionEl.hidden = false;
  }
}

export function initLiveRelease(): void {
  const cached = readCache();
  if (cached) {
    apply(cached);
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);

  fetch(API, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: ctrl.signal,
  })
    .then((res) => (res.ok ? (res.json() as Promise<{ tag_name?: string; assets?: Parameters<typeof classify>[0] }>) : null))
    .then((rel) => {
      if (!rel) return;
      const d = classify(rel.assets ?? []);
      d.version = (rel.tag_name ?? '').replace(/^v/, '') || null;
      if (!d.version) return;
      writeCache(d);
      apply(d);
    })
    .catch(() => {
      // Сеть, таймаут, лимит — оставляем вшитые значения.
    })
    .finally(() => clearTimeout(timer));
}
