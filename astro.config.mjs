import { defineConfig } from 'astro/config';

// Static reference host. Web components ship as small client module scripts;
// provider renderer code is split into lazy chunks via dynamic import().
export default defineConfig({
  site: 'https://igor-ganov.github.io',
  trailingSlash: 'never',
  build: { format: 'file' },
  vite: {
    optimizeDeps: { include: ['lit'] },
  },
});
