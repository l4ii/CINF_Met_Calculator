import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  root: '.',
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/katex') || id.includes('node_modules/react-katex')) {
            return 'katex-vendor'
          }
          if (id.includes('/components/modules/CopperWorkflow') || id.includes('/utils/copper')) {
            return 'copper-workflow'
          }
        },
      },
    },
  },
  define: {
    // 打包时由 scripts/build-frontend.js 注入，用于界面显示以确认是否为当次构建
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(process.env.VITE_BUILD_ID || 'dev'),
  },
})
