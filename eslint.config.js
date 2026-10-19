import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'functions/lib', 'functions/node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Cloud Functions run on Node.
    files: ['functions/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Home Screen widget: runs inside the Scriptable iOS app, not the browser.
    files: ['src/widget/*.scriptable.js'],
    languageOptions: {
      globals: Object.fromEntries(['ListWidget', 'Color', 'Font', 'FileManager', 'Request', 'DrawContext', 'Size', 'Rect',
        'Path', 'Point', 'SFSymbol', 'LinearGradient', 'config', 'Script'].map((name) => [name, 'readonly'])),
    },
  },
  {
    // Push service worker: loads the Firebase compat SDK via importScripts.
    files: ['public/firebase-messaging-sw.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker, firebase: 'readonly' } },
  },
])
