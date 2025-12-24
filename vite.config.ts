import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // 可以让局域网其他设备访问
    port: 3000,        // 修改端口，例如改成 3000
    open: true         // 启动时自动打开浏览器
  },
  base: '/static/',
})
