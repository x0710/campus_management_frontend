/** Markdown 只读渲染组件 */
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useMemo } from 'react'

// GFM：支持删除线、任务列表、表格；breaks：单换行也渲染为 <br>
marked.setOptions({ gfm: true, breaks: true })

// 所有链接强制新窗口打开并带 noopener，防止反向 tabnabbing
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * 可复用的 Markdown 只读渲染组件：
 * marked 解析 GFM 语法（标题/粗体/斜体/删除线/代码/列表/任务列表/引用/表格/分割线），
 * DOMPurify 消毒后输出，避免 XSS。样式见 index.css 的 .markdown-body，自动适配明暗主题。
 */
export default function MarkdownView({
  content,
  className = '',
}: {
  content: string
  className?: string
}) {
  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content, { async: false }) as string
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target', 'rel'],
    })
  }, [content])

  return (
    <div
      className={`markdown-body ${className}`.trim()}
      // 内容来源为已通过 DOMPurify 消毒的 HTML
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
