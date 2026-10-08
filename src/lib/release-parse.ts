/*
 * Чистое сопоставление ассетов релиза GitHub форматам и системам. Общий код для
 * сборки (src/lib/releases.ts) и браузера (src/scripts/live-release.ts), чтобы
 * правила разбора имён файлов не разъезжались.
 */
export interface Downloads {
  /** Номер версии без ведущей «v», либо null, если релиз не получен. */
  version: string | null;
  linux: { appimage: string | null; deb: string | null; rpm: string | null };
  windows: { msi: string | null; exe: string | null };
  mac: { arm: string | null; x64: string | null };
}

export interface GhAsset {
  name?: string;
  browser_download_url?: string;
}

export const emptyDownloads = (): Downloads => ({
  version: null,
  linux: { appimage: null, deb: null, rpm: null },
  windows: { msi: null, exe: null },
  mac: { arm: null, x64: null },
});

/** Из имён ассетов релиза раскладываем ссылки по системам и архитектурам. */
export function classify(assets: GhAsset[]): Downloads {
  const d = emptyDownloads();
  for (const a of assets) {
    const name = a.name ?? '';
    const url = a.browser_download_url;
    if (!url) continue;
    if (name.endsWith('.sig') || name.endsWith('.tar.gz') || name === 'latest.json') continue;
    const lower = name.toLowerCase();
    if (lower.endsWith('.appimage')) d.linux.appimage ??= url;
    else if (lower.endsWith('.deb')) d.linux.deb ??= url;
    else if (lower.endsWith('.rpm')) d.linux.rpm ??= url;
    else if (lower.endsWith('.msi')) d.windows.msi ??= url;
    else if (lower.endsWith('.exe')) d.windows.exe ??= url;
    else if (lower.endsWith('.dmg')) {
      if (/(aarch64|arm64)/.test(lower)) d.mac.arm ??= url;
      else if (/(x64|x86_64|amd64)/.test(lower)) d.mac.x64 ??= url;
    }
  }
  return d;
}

/** Ответ GitHub API превращаем в набор ссылок на файлы последнего релиза. */
export function parseRelease(rel: { tag_name?: string; assets?: GhAsset[] }): Downloads {
  const d = classify(rel.assets ?? []);
  d.version = (rel.tag_name ?? '').replace(/^v/, '') || null;
  return d;
}

/** Ссылка на страницу всех релизов — запасной вариант для любой кнопки. */
export const FALLBACK = 'https://github.com/fgbm/depesha/releases/latest';

export const pick = (...urls: (string | null)[]): string => urls.find((u): u is string => !!u) ?? FALLBACK;
