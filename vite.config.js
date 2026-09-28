import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Dev keeps `/` so local http://localhost:5173/ works.
// Production is always deployed under `/open-sea/` (override via CLI still honored).
export default defineConfig(({ command }) => ({
  plugins: [vue()],
  base: command === 'build' ? '/open-sea/' : '/',
  server: {
    host: true, // 0.0.0.0 — allow LAN access (e.g. http://192.168.x.x:5173)
  },
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
