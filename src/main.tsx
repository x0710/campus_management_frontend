/** 入口文件 */

import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import type { Locale } from 'antd/es/locale'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './index.css'
import { useClearButtonTabOrder } from './hooks/useClearButtonTabOrder'
import { useSettingsStore } from './store/settings'

// antd 的 locale 入口在 Vite 预构建后可能仍带一层 CJS 的 `default` 包装；
// 直接读取 `.DatePicker` 会得到 undefined，首屏渲染即抛错导致白屏。
// 这里统一解包，保证 ConfigProvider 拿到的是真正的 locale 对象。
function unwrapLocale(locale: Locale): Locale {
  return (locale as Locale & { default?: Locale }).default ?? locale
}

const zhCNBase = unwrapLocale(zhCN)
const enUSBase = unwrapLocale(enUS)

// antd 的 zh_CN 未内置日历的月份/星期文案，日期面板会回落到 dayjs locale；
// 打包后 DatePicker 与入口可能持有不同的 dayjs 实例，导致中文界面下日历仍显示英文月份（Jan/Feb）。
// 这里直接补齐中文文案，保证日历面板的月份与星期始终为中文。
const zhDatePicker = zhCNBase.DatePicker
const zhCNLocale: Locale = zhDatePicker
  ? {
      ...zhCNBase,
      DatePicker: {
        ...zhDatePicker,
        lang: {
          ...zhDatePicker.lang,
          monthFormat: 'M月',
          shortMonths: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
          shortWeekDays: ['日', '一', '二', '三', '四', '五', '六'],
        },
      } as NonNullable<Locale['DatePicker']>,
    }
  : zhCNBase

function RootProviders() {
  useClearButtonTabOrder()
  const locale = useSettingsStore((s) => s.locale)  // 语言切换
  const themeMode = useSettingsStore((s) => s.theme)  // 主题切换
  const dark = themeMode === 'dark'

  // 同步到 <html data-theme>，供自定义 CSS 变量切换明暗配色
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  // dayjs 语言：DatePicker / Calendar 的月份名、星期名取自 dayjs locale，需与应用语言同步
  useEffect(() => {
    dayjs.locale(locale === 'zh' ? 'zh-cn' : 'en')
  }, [locale])

  return (
    <ConfigProvider
      locale={locale === 'zh' ? zhCNLocale : enUSBase}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#b4232b',
          colorLink: '#a61f27',
          colorInfo: '#b4232b',
          borderRadius: 6,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}

// 首屏渲染前先按持久化的语言设置 dayjs locale，避免日期组件短暂显示英文月份
dayjs.locale(useSettingsStore.getState().locale === 'zh' ? 'zh-cn' : 'en')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootProviders />
  </StrictMode>,
)
