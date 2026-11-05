// 多语言翻译函数
// 支持插值，例如 t('login.welcome', { name: '张三' })
import { createContext, useCallback, useContext } from 'react'
import { useSettingsStore } from '../store/settings'
import messages from './messages'
import { partyTerminology } from './partyTerminology'

/** 由党委门户布局提供，使共用页面与弹窗采用党建用语。 */
export const PartyTerminologyContext = createContext(false)

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
  const partyPortal = useContext(PartyTerminologyContext)
  const locale = useSettingsStore((s) => s.locale)  // 从状态中获取当前语言

  // 定义缓存翻译函数，支持插值
  return useCallback<TranslateFn>(
    (key, vars) => {
      const dict = messages[locale]  // 从消息字典中获取当前语言的翻译
      let text = resolve(dict, key) ?? resolve(messages.zh, key) ?? key  // 从当前语言或默认语言中获取翻译，或返回键名
      if (partyPortal) text = partyTerminology(key, text, locale)
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value))
        }
      }
      return text
    },
    [locale, partyPortal],   //依赖语言与门户，切换工作端后同步文案
  )
}

/** 供非组件场景（枚举映射等）使用的命令式翻译 */
export function translate(locale: 'zh' | 'en', key: string): string {
  return resolve(messages[locale], key) ?? resolve(messages.zh, key) ?? key
}
