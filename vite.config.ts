import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/chat/',
  appType: 'spa',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'https://kdreamling.work',
        changeOrigin: true,
        secure: true,
      },
      '/v1': {
        target: 'https://kdreamling.work',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
