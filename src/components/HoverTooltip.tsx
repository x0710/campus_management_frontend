import { Tooltip } from 'antd'
import type { TooltipProps } from 'antd'
import { useSyncExternalStore } from 'react'

const HOVER_QUERY = '(hover: hover) and (pointer: fine)'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(HOVER_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(HOVER_QUERY).matches
}

/** 当前设备是否支持真正的悬停（桌面鼠标） */
export function useCanHover() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}

/**
 * 仅在支持悬停的设备上渲染 Tooltip。
 * 手机/平板滑动时手指误触按钮会触发 hover 模拟，提示气泡会一直停留遮挡内容，
 * 因此触摸设备上直接渲染子元素，不生成气泡。
 */
export default function HoverTooltip({ children, ...rest }: TooltipProps) {
  const canHover = useCanHover()
  if (!canHover) return <>{children}</>
  return <Tooltip {...rest}>{children}</Tooltip>
}
