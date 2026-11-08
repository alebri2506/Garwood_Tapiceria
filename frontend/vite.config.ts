import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo, /api va a la API local: mismo origen, sin CORS y con la cookie de refresh.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
