import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { DEFAULT_APP_BASE, normalizeAppBase } from './src/config/deployment.ts'

// 后端（campus-server）默认监听 [::]:8000，且未配置 CORS，
// 开发环境将部署用 API 前缀转发到后端 /api，保持同源访问。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const appBase = normalizeAppBase(env.VITE_APP_BASE || DEFAULT_APP_BASE)
  const apiBase = (env.VITE_API_BASE?.trim() || `${appBase}/api`).replace(/\/+$/, '')
  return {
    base: `${appBase}/`,
    plugins: [react()],
    resolve: {
      // react / react-dom 安装在 campus-ts/node_modules，antd 等安装在 frontend/node_modules，
      // 强制统一解析到同一份 React，避免出现两个 React 副本。
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: 5173,
      proxy: {
        ...(apiBase.startsWith('/') ? { [apiBase]: {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path: string) => `/api${path.slice(apiBase.length)}`,
        } } : {}),
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
