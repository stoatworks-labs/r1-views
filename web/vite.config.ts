import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Static SPA. No backend: a project never leaves the browser.
// R1_DEV_FILES (dev server only) lets a test page fetch project files from one
// folder outside the repo, so a browser can be driven without a file dialog.
const devFiles = process.env.R1_DEV_FILES
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version}`) },
  plugins: [react()],
  server: devFiles ? { fs: { allow: ['.', devFiles] } } : undefined,
  base: './',
  // No source maps: the page is the product, and they'd publish every comment.
  build: { outDir: 'dist', sourcemap: false },
})
