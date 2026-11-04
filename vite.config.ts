/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

// M5 fills in icons and the full manifest; M6 sets `base` to the repository name.
export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Iron Log',
        short_name: 'Iron Log',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        theme_color: '#11151c',
        background_color: '#11151c',
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // One bundle, nothing to preload: leave out Vite's preload polyfill, the only fetch() it would ship.
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
