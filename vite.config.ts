import { defineConfig } from 'vite';

// Optional settings for a hosted copy (.env.example): unset means empty, so index.html never shows a literal %VITE_…%.
for (const k of ['VITE_SITE_URL', 'VITE_IMPRESSUM_URL', 'VITE_PRIVACY_URL']) process.env[k] ??= '';

export default defineConfig({});
