import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const configuredSite = process.env.PUBLIC_SITE_URL?.trim();

export default defineConfig({
  site: configuredSite || undefined,
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
