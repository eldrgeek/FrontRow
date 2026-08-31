// Build config for the SOMA Rooms avatar spike ONLY (2026-08-30).
// Separate from vite.config.ts so the main FRT build is untouched.
// Usage: npx vite build --config vite.spike.config.ts --base=/rooms/frt-spike/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-spike',
    rollupOptions: {
      input: { somaspike: resolve(__dirname, 'somaspike.html'), director3d: resolve(__dirname, 'director3d.html') },
    },
  },
});
