import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Node 可直接运行可擦除的 TypeScript；兼容前端使用的无扩展名相对导入。
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context)
      const index = new URL(`${specifier}/index.ts`, context.parentURL)
      if (existsSync(fileURLToPath(index))) return nextResolve(index.href, context)
    }
    return nextResolve(specifier, context)
  },
})
