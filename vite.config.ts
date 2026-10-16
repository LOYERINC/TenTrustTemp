import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import express from 'express';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'comingsoon-static-route',
        configureServer(server) {
          server.middlewares.use('/comingsoon', express.static(path.resolve(__dirname, 'comingsoon'), { index: 'index.html' }));
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
    },
    // Refresh Vite's dependency cache after package changes. This prevents
    // stale optimized deep imports from returning 504 in the dev browser.
    optimizeDeps: {
      force: true,
    },
  };
});
