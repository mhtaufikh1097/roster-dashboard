import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Saat dev, /api diteruskan ke backend sehingga tidak perlu CORS/URL manual.
    proxy: { '/api': 'http://localhost:3000' },
  },
});

