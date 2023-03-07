import { defineConfig } from 'tsup'

export default defineConfig([
  {
    target: 'es2020',
    entry: ['src/main.ts'],
    outDir: 'dist',
    dts: true,
  },
  {
    target: 'es2020',
    entry: {
      'main.browser': 'src/client-browser.ts',
    },
    outExtension: () => ({
      js: `.js`,
    }),
    format: 'iife',
    globalName: 'RPCWebSocket',
    outDir: 'dist',
  },
])
