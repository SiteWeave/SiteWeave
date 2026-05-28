import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/',
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
  ],
  resolve: {
    alias: {
      '@siteweave/core-logic': path.resolve(__dirname, '../../packages/core-logic/src/index.js'),
      '@siteweave/i18n': path.resolve(__dirname, '../../packages/i18n/index.js'),
      'frappe-gantt/dist/frappe-gantt.css': path.resolve(__dirname, './node_modules/frappe-gantt/dist/frappe-gantt.css')
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    cssMinify: 'lightningcss',
    commonjsOptions: {
      transformMixedEsModules: true
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'supabase-vendor'
          }
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
            return 'pdf-vendor'
          }
          if (id.includes('node_modules/frappe-gantt')) {
            return 'gantt-vendor'
          }
          return undefined
        }
      }
    }
  },
  css: {
    transformer: 'lightningcss',
  },
  publicDir: 'public',
  // Vite automatically loads .env files from the project root
  // Environment variables prefixed with VITE_ are automatically exposed
})


