import { defineConfig } from 'tsup'

export default defineConfig([
  {
    clean: true,
    target: 'es2020',
    entry: ['src/main.ts'],
    format: ['cjs', 'esm'],
    outDir: 'dist',
    dts: true,
  },
  {
    clean: true,
    target: 'es2020',
    entry: {
      'frontend': 'src/main-browser.ts',
    },
    format: ['cjs', 'esm'],
    outDir: 'dist',
    dts: true,
  },
  {
    clean: true,
    target: 'es2020',
    entry: {
      'main.browser': 'lib/client-browser.ts',
    },
    outExtension: () => ({
      js: `.js`,
    }),
    format: 'iife',
    globalName: 'RPCWebSocket',
    outDir: 'dist',
  },
])
