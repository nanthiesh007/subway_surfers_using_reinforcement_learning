import { defineConfig } from 'vite';

// base './' makes the production build work from any sub-path
// (GitHub Pages project sites, Netlify, Vercel, itch.io, plain static hosting).
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 900,
  },
});
