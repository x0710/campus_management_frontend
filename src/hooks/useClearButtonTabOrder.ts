import { useEffect } from 'react'

// Ant Design 的清除按钮没有开放 tabIndex 配置；统一处理动态表单及弹窗中的按钮。
const CLEAR_BUTTON_SELECTOR = [
  'button.ant-input-clear-icon',
  'button.ant-select-clear',
  'button.ant-picker-clear',
].join(',')

export function useClearButtonTabOrder() {
  useEffect(() => {
    const update = (root: Element) => {
      if (root.matches(CLEAR_BUTTON_SELECTOR)) root.setAttribute('tabindex', '-1')
      root.querySelectorAll(CLEAR_BUTTON_SELECTOR).forEach((button) => {
        button.setAttribute('tabindex', '-1')
      })
    }

    update(document.body)
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) {
          update(record.target)
        }
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) update(node)
        })
      }
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])
}
