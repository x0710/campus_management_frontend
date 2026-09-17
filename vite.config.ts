import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 后端（campus-server）默认监听 [::]:8000，且未配置 CORS，
// 开发环境通过 Vite 代理把 /api 请求转发到后端，保持同源访问。
export default defineConfig({
  plugins: [react()],
  resolve: {
    // react / react-dom 安装在 campus-ts/node_modules，antd 等安装在 frontend/node_modules，
    // 强制统一解析到同一份 React，避免出现两个 React 副本。
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
