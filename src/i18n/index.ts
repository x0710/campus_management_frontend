// 多语言翻译函数
// 支持插值，例如 t('login.welcome', { name: '张三' })
import { useCallback } from 'react'
import { useSettingsStore } from '../store/settings'
import messages from './messages'

function resolve(dict: unknown, path: string): string | undefined {
  const value = path.split('.').reduce<unknown>(
    (acc, key) => (acc != null && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    dict,
  )
  return typeof value === 'string' ? value : undefined
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

/** 多语言钩子：t('login.welcome')，支持 {name} 形式的插值 */
export function useT(): TranslateFn {
  const locale = useSettingsStore((s) => s.locale)  // 从状态中获取当前语言

  // 定义缓存翻译函数，支持插值
  return useCallback<TranslateFn>(
    (key, vars) => {
      const dict = messages[locale]  // 从消息字典中获取当前语言的翻译
      let text = resolve(dict, key) ?? resolve(messages.zh, key) ?? key  // 从当前语言或默认语言中获取翻译，或返回键名
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value))
        }
      }
      return text
    },
    [locale],   //依赖当前语言，确保翻译结果与语言变化同步
  )
}

/** 供非组件场景（枚举映射等）使用的命令式翻译 */
export function translate(locale: 'zh' | 'en', key: string): string {
  return resolve(messages[locale], key) ?? resolve(messages.zh, key) ?? key
}
