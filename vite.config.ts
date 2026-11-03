/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// M5 fills in icons and the full manifest; M6 sets `base` to the repository name.
export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Retraining Tracker',
        short_name: 'Retraining',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        theme_color: '#0f1115',
        background_color: '#0f1115',
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
