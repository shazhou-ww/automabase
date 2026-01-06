import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Use default Vite port to avoid conflict with SAM Local (3000)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000', // SAM Local API
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
