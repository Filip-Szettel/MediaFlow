import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Konfiguracja proxy jest kluczowa.
// Dzięki temu React (port 5173) może gadać z Node (port 3000)
// bez błędów CORS i podawania pełnych adresów URL.

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MediaFlow v6.0 Enterprise',
        short_name: 'MediaFlow',
        description: 'Advanced Media Management Application',
        theme_color: '#1e1b4b',
        background_color: '#1e1b4b',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    }
  }
});
