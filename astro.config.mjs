// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Astro не умеет добавлять style-src-attr через опции CSP, а в макете много
// атрибутов style="…". После сборки дописываем директиву в готовую meta.
function cspStyleAttr() {
  /** @param {string} d @returns {string[]} */
  const walk = (d) =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  /** @type {(ctx: { dir: URL }) => void} */
  const buildDone = (ctx) => {
    const root = fileURLToPath(ctx.dir);
    for (const file of walk(root)) {
      if (!file.endsWith('.html')) continue;
      let html = readFileSync(file, 'utf8');
      if (html.includes('style-src-attr') || !html.includes('http-equiv="content-security-policy"')) continue;
      html = html.replace(/(<meta http-equiv="content-security-policy" content="[^"]*)(")/, "$1 style-src-attr 'unsafe-inline';$2");
      writeFileSync(file, html);
    }
  };
  return {
    name: 'csp-style-attr',
    hooks: { 'astro:build:done': buildDone },
  };
}

// Статический сайт: никаких адаптеров, никаких UI-фреймворков и Tailwind.
export default defineConfig({
  site: 'https://depesha-app.ru',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [sitemap(), cspStyleAttr()],
  build: {
    format: 'directory',
    // CSS отдельным файлом: в style-src меньше хешей, вид не меняется.
    inlineStylesheets: 'never',
  },
  experimental: {
    // CSP собирается Astro: инлайновые скрипты получают хеши, поэтому
    // script-src обходится без 'unsafe-inline'.
    csp: {
      algorithm: 'SHA-256',
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
      directives: ["default-src 'self'", "img-src 'self' data:", "connect-src 'self' https://api.github.com"],
    },
  },
});
