import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const configuredSite = process.env.PUBLIC_SITE_URL?.trim();
const SITE_URL = configuredSite || 'https://oaraiseasidepark.com';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
