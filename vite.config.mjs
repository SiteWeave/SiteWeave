import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file - Vite automatically loads .env files
  // Using '' as prefix loads ALL env vars, then we can access VITE_ prefixed ones
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    root: process.cwd(),
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    resolve: {
      alias: {
        '@siteweave/core-logic': path.resolve(__dirname, './packages/core-logic/src/index.js'),
        '@siteweave/i18n': path.resolve(__dirname, './packages/i18n/index.js'),
        '@siteweave/onboarding-ui': path.resolve(__dirname, './packages/onboarding-ui/src/index.js'),
        'frappe-gantt/dist/frappe-gantt.css': path.resolve(__dirname, './node_modules/frappe-gantt/dist/frappe-gantt.css')
      }
    },
    publicDir: 'public',
    plugins: [
      react(),
      electron([
        {
          // Main-Process entry file of the Electron App.
          entry: 'electron/main.cjs',
          onstart(options) {
            // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, 
            // instead of restarting the entire Electron App.
            options.reload()
          },
          vite: {
            build: {
              rollupOptions: {
                output: {
                  // FORCE CommonJS format to match .cjs extension
                  format: 'cjs',
                  entryFileNames: 'main.cjs'
                },
                external: ['electron', 'http', 'url', 'path', 'https', 'net', 'fs', 'child_process', 'electron-updater']
              }
            }
          }
        },
        {
          entry: 'electron/preload.js',
          onstart(options) {
            // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, 
            // instead of restarting the entire Electron App.
            options.reload()
          },
        },
      ]),
      renderer()
    ],
    base: './', // Required for Electron file:// protocol
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: 'terser',
      sourcemap: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        external: [],
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
          },
        },
      },
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
    },
    server: {
      port: 5173,
    },
    optimizeDeps: {
      include: [
        '@fullcalendar/core',
        '@fullcalendar/react',
        '@fullcalendar/daygrid',
        '@fullcalendar/timegrid',
        '@fullcalendar/interaction',
        'qrcode',
      ],
      esbuildOptions: {
        resolveExtensions: ['.js', '.jsx', '.ts', '.tsx', '.json']
      }
    }
  }
})
