import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tauri-apps/api': path.resolve(__dirname, 'node_modules/@tauri-apps/api'),
    }
  },
  ssr: {
    noExternal: ['@tauri-apps/api', '@wave/native-bindings', '@wave/core']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react';
          if (id.includes('packages/core/')) return 'core';
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    server: {
      deps: {
        inline: ['@wave/native-bindings', '@wave/core']
      }
    }
  }
})
