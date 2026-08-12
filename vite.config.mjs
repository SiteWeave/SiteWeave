import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, copyFileSync, mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version
const updateAvailabilitySrc = path.resolve(__dirname, 'electron/updateAvailability.js')
const updateAvailabilityDist = path.resolve(__dirname, 'dist-electron/updateAvailability.js')

/** Keep update helpers as a real CJS file — Vite/Rollup CJS interop was emptying exports. */
function copyUpdateAvailabilityPlugin() {
  const copy = () => {
    mkdirSync(path.dirname(updateAvailabilityDist), { recursive: true })
    copyFileSync(updateAvailabilitySrc, updateAvailabilityDist)
  }
  const rewriteAbsoluteRequire = (code) =>
    String(code).replace(
      /require\((["'])[^"']*updateAvailability\.js\1\)/g,
      'require("./updateAvailability.js")'
    )

  return {
    name: 'copy-update-availability',
    buildStart: copy,
    writeBundle: copy,
    closeBundle: copy,
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && typeof item.code === 'string') {
          item.code = rewriteAbsoluteRequire(item.code)
        }
      }
      copy()
    },
  }
}

function isElectronExternal(id) {
  const externals = new Set([
    'electron',
    'http',
    'url',
    'path',
    'https',
    'net',
    'fs',
    'child_process',
    'electron-updater',
  ])
  if (externals.has(id)) return true
  // Relative or absolute path to the updater helper must stay a runtime require.
  if (/updateAvailability(\.js)?$/.test(String(id).replace(/\\/g, '/'))) return true
  return false
}

// https://vite.dev/config/
export default defineConfig(() => {
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
        '@siteweave/design-tokens/mobile': path.resolve(__dirname, './packages/design-tokens/src/mobile.js'),
        '@siteweave/design-tokens': path.resolve(__dirname, './packages/design-tokens/src/index.js'),
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
            plugins: [copyUpdateAvailabilityPlugin()],
            build: {
              rollupOptions: {
                makeAbsoluteExternalsRelative: true,
                output: {
                  // FORCE CommonJS format to match .cjs extension
                  format: 'cjs',
                  entryFileNames: 'main.cjs'
                },
                external: isElectronExternal,
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
