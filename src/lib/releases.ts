/*
 * Ссылки на последний релиз берутся у GitHub во время сборки, а не в браузере
 * посетителя: запасной вариант, если браузер не смог обновить их сам
 * (src/scripts/live-release.ts). Нет сети или лимит — сборка не падает,
 * все ссылки ведут на страницу релизов.
 */
import { emptyDownloads, parseRelease } from './release-parse';
import type { Downloads, GhAsset } from './release-parse';

export type { Downloads, GhAsset } from './release-parse';
export { FALLBACK, pick } from './release-parse';

const API = 'https://api.github.com/repos/fgbm/depesha/releases/latest';

export async function getDownloads(): Promise<Downloads> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'depesha-site-build',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(API, { headers });
    if (!res.ok) return emptyDownloads();
    const rel = (await res.json()) as { tag_name?: string; assets?: GhAsset[] };
    return parseRelease(rel);
  } catch {
    return emptyDownloads();
  }
}
