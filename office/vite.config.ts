import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, '/.netlify/functions'),
      },
    },
  },
  build: { target: 'es2022' },
});
