import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Optional settings for a hosted copy (.env.example): unset means empty, so index.html never shows a literal %VITE_…%.
for (const k of ['VITE_SITE_URL', 'VITE_IMPRESSUM_URL', 'VITE_PRIVACY_URL']) process.env[k] ??= '';

// Optional Umami analytics: adds the script tag (counting only on the copy's own host, skipping Do Not Track)
// and allows its server in the CSP of the built _headers. Off unless both settings are set.
function umami(env: Record<string, string>): Plugin {
  const { VITE_UMAMI_SCRIPT: src, VITE_UMAMI_ID: id, VITE_SITE_URL: site } = env;
  if (!src || !id) return { name: 'umami' };
  const origin = new URL(src).origin;
  let outDir = 'dist';
  return {
    name: 'umami',
    apply: 'build',
    configResolved: (c) => { outDir = c.build.outDir; },
    transformIndexHtml: () => [{
      tag: 'script', injectTo: 'head',
      attrs: { defer: true, src, 'data-website-id': id, 'data-do-not-track': 'true', ...(site && { 'data-domains': new URL(site).hostname }) },
    }],
    closeBundle() {
      const f = `${outDir}/_headers`;
      writeFileSync(f, readFileSync(f, 'utf8').replace(/(script-src|connect-src) 'self'/g, `$1 'self' ${origin}`));
    },
  };
}

export default defineConfig(({ mode }) => ({ plugins: [umami(loadEnv(mode, process.cwd(), 'VITE_'))] }));
