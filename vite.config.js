import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Dev keeps `/` so local http://localhost:5173/ works.
// Production is always deployed under `/open-sea/` (override via CLI still honored).
export default defineConfig(({ command }) => ({
  plugins: [vue()],
  base: command === 'build' ? '/open-sea/' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/webgpu')) return 'three-webgpu'
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
}))
