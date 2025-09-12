import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 允许外网访问
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:9001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:9001',
        changeOrigin: true,
        ws: true
      }
    }
  }
})