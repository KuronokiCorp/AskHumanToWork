import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // E2E runs point this at the test API instance (see playwright.config.ts).
      '/api': process.env.VITE_API_PROXY ?? 'http://localhost:3000',
    },
  },
});
