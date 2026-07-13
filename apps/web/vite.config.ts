import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version

export default defineConfig({
  base: '/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
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
      '@siteweave/onboarding-ui': path.resolve(__dirname, '../../packages/onboarding-ui/src/index.js'),
      'frappe-gantt/dist/frappe-gantt.css': path.resolve(__dirname, './node_modules/frappe-gantt/dist/frappe-gantt.css')
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    cssMinify: 'lightningcss',
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter(
          (dep) =>
            !dep.includes('jspdf') &&
            !dep.includes('html2canvas') &&
            !dep.includes('pdf-vendor'),
        )
      },
    },
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
