/** 入口文件 */

import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './index.css'
import { useSettingsStore } from './store/settings'

function RootProviders() {
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
      locale={locale === 'zh' ? zhCN : enUS}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#2f54eb',
          borderRadius: 8,
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
