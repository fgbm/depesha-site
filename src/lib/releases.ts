/*
 * Ссылки на последний релиз берутся у GitHub во время сборки, а не в браузере
 * посетителя: никаких запросов со страницы наружу. Нет сети или лимит —
 * сборка не падает, все ссылки ведут на страницу релизов.
 */
const FALLBACK = 'https://github.com/fgbm/depesha/releases/latest';
const API = 'https://api.github.com/repos/fgbm/depesha/releases/latest';

export interface Downloads {
  /** Номер версии без ведущей «v», либо null, если релиз не получен. */
  version: string | null;
  linux: { appimage: string | null; deb: string | null; rpm: string | null };
  windows: { msi: string | null; exe: string | null };
  mac: { arm: string | null; x64: string | null };
}

interface GhAsset {
  name?: string;
  browser_download_url?: string;
}

const empty = (): Downloads => ({
  version: null,
  linux: { appimage: null, deb: null, rpm: null },
  windows: { msi: null, exe: null },
  mac: { arm: null, x64: null },
});

/** Из имён ассетов релиза раскладываем ссылки по системам и архитектурам. */
function classify(assets: GhAsset[]): Downloads {
  const d = empty();
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

export async function getDownloads(): Promise<Downloads> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'depesha-site-build',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(API, { headers });
    if (!res.ok) return empty();
    const rel = (await res.json()) as { tag_name?: string; assets?: GhAsset[] };
    const d = classify(rel.assets ?? []);
    d.version = (rel.tag_name ?? '').replace(/^v/, '') || null;
    return d;
  } catch {
    return empty();
  }
}

/** Ссылка на страницу всех релизов — запасной вариант для любой кнопки. */
export { FALLBACK };

export const pick = (...urls: (string | null)[]): string => urls.find((u): u is string => !!u) ?? FALLBACK;
