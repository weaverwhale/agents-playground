import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4567,
    proxy: {
      '/chat': {
        target: 'http://localhost:9876',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:9876',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
