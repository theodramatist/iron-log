/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { minimal2023Preset } from '@vite-pwa/assets-generator/config';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

const DARK = '#11151c';

// The icon's dark field fills the padding the maskable and Apple icons need.
const iconPreset = {
  ...minimal2023Preset,
  maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: DARK } },
  apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: DARK } },
};

export default defineConfig({
  // Every app on theodramatist.github.io shares one origin; this one lives
  // under /iron-log/ (CLAUDE.md, repo instruction 2).
  base: '/iron-log/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      pwaAssets: {
        image: 'public/icon.svg',
        preset: iconPreset,
        includeHtmlHeadLinks: true,
        overrideManifestIcons: true,
      },
      manifest: {
        id: '/iron-log/',
        name: 'Iron Log',
        short_name: 'Iron Log',
        description: 'Runs the Retraining Protocol: what to lift today, what you did, and what comes next.',
        lang: 'en',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        theme_color: DARK,
        background_color: DARK,
      },
      workbox: {
        // Caches named for this app, on an origin other apps share.
        cacheId: 'iron-log',
        // The plugin adds manifest.webmanifest itself. Globbing it too lists it
        // twice with different revisions, and Workbox then caches nothing.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        cleanupOutdatedCaches: true,
        // Deletes the earlier app's ironlog-v* caches (public/sw-cleanup.js).
        importScripts: ['sw-cleanup.js'],
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
