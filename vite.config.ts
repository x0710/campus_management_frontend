import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { DEFAULT_APP_BASE, adminBaseOf, normalizeAppBase } from './src/config/deployment.ts'

/**
 * 管理端不使用 Vite base 前缀（/campus/party/admin -> /campus/admin），
 * 开发与预览服务器需把该前缀的页面请求重写到 base 下的 index.html，
 * 浏览器地址保持不变。生产环境由 Nginx 做同样的回退。
 */
function adminBasePlugin(adminBase: string, appBase: string): Plugin {
  const rewrite = (url = '') => {
    const [pathname = '', query] = url.split('?')
    if (pathname !== adminBase && !pathname.startsWith(`${adminBase}/`)) return url
    return `${appBase}/index.html${query ? `?${query}` : ''}`
  }
  const middleware = (req: { url?: string }, _res: unknown, next: () => void) => {
    req.url = rewrite(req.url)
    next()
  }
  return {
    name: 'campus-admin-base',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// 后端（campus-server）默认监听 [::]:8000，且未配置 CORS，
// 开发环境将部署用 API 前缀转发到后端 /api，保持同源访问。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const appBase = normalizeAppBase(env.VITE_APP_BASE || DEFAULT_APP_BASE)
  const adminBase = adminBaseOf(appBase)
  const apiBase = (env.VITE_API_BASE?.trim() || `${appBase}/api`).replace(/\/+$/, '')
  return {
    base: `${appBase}/`,
    plugins: [react(), adminBasePlugin(adminBase, appBase)],
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
