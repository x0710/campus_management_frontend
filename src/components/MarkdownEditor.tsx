/** Markdown 编辑器组件 */

import {
  BoldOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  FontSizeOutlined,
  ItalicOutlined,
  LinkOutlined,
  MinusOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Input, Segmented, Space, Tooltip } from 'antd'
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import MarkdownView from './MarkdownView'
import { useT } from '../i18n'

const { TextArea } = Input

type Mode = 'edit' | 'split' | 'preview'

interface Props {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  rows?: number
  maxLength?: number
  showCount?: boolean
  defaultMode?: Mode
}

/** 待恢复的光标选区（onChange 触发重渲染后重新应用） */
interface PendingRange {
  start: number
  end: number
}

/** 工具栏按钮定义 */
interface ToolItem {
  key: string
  tip: string
  icon: ReactNode
  onClick: () => void
}

/**
 * 可复用的 Markdown 编辑器：
 * 工具栏支持一~六级标题、粗体、斜体、粗斜体、删除线、行内代码、代码块、
 * 引用、无序/有序/任务列表、链接、分割线；支持编辑 / 分屏 / 预览三种模式。
 * 受控接口（value + onChange），可直接放进 antd Form.Item 使用。
 */
export default function MarkdownEditor({
  value = '',
  onChange,
  placeholder,
  rows = 8,
  maxLength,
  showCount = false,
  defaultMode = 'split',
}: Props) {
  const t = useT()
  const [mode, setMode] = useState<Mode>(defaultMode)
  const textareaRef = useRef<ComponentRef<typeof TextArea>>(null)
  const pendingRange = useRef<PendingRange | null>(null)

  // 重渲染后恢复选区
  useLayoutEffect(() => {
    const el = textareaRef.current?.nativeElement as HTMLTextAreaElement | undefined
    if (pendingRange.current && el) {
      const { start, end } = pendingRange.current
      el.focus()
      el.setSelectionRange(start, end)
      pendingRange.current = null
    }
  })

  const applyChange = useCallback(
    (next: string, start: number, end: number) => {
      onChange?.(next)
      pendingRange.current = { start, end }
    },
    [onChange],
  )

  /** 行内包裹：**粗体** / *斜体* / `代码` 等；无选中文本时插入占位并选中占位便于直接输入 */
  const wrapInline = useCallback(
    (marker: string, placeholderKey: string) => {
      const ta = (textareaRef.current?.nativeElement ?? null) as HTMLTextAreaElement | null
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = value.slice(start, end)
      const inner = selected || t(placeholderKey)
      const next = value.slice(0, start) + marker + inner + marker + value.slice(end)
      const caretStart = start + marker.length
      applyChange(next, caretStart, caretStart + inner.length)
    },
    [value, applyChange, t],
  )

  /** 对选区涉及的每一行加前缀（标题/引用/列表）；再次点击同级标题则取消 */
  const prefixLines = useCallback(
    (makePrefix: (line: string) => string) => {
      const ta = (textareaRef.current?.nativeElement ?? null) as HTMLTextAreaElement | null
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      // 选区对齐到行首行尾
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const lineEndIdx = value.indexOf('\n', end)
      const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
      const block = value.slice(lineStart, lineEnd)
      const nextBlock = block
        .split('\n')
        .map((line) => makePrefix(line))
        .join('\n')
      const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd)
      applyChange(next, lineStart, lineStart + nextBlock.length)
    },
    [value, applyChange],
  )

  /** 插入块级片段（代码块 / 分割线），保证前后空行 */
  const insertBlock = useCallback(
    (snippet: string, placeholderKey?: string) => {
      const ta = (textareaRef.current?.nativeElement ?? null) as HTMLTextAreaElement | null
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const before = value.slice(0, start)
      const after = value.slice(end)
      const prefix = before.length > 0 && !before.endsWith('\n\n') ? '\n\n' : ''
      const suffix = after.length > 0 && !after.startsWith('\n\n') ? '\n\n' : ''
      const next = before + prefix + snippet + suffix + after
      // 占位文本（如代码语言）默认选中便于修改
      if (placeholderKey) {
        const placeholder = t(placeholderKey)
        const idx = snippet.indexOf(placeholder)
        if (idx >= 0) {
          const s = start + prefix.length + idx
          applyChange(next, s, s + placeholder.length)
          return
        }
      }
      const pos = start + prefix.length + snippet.length
      applyChange(next, pos, pos)
    },
    [value, applyChange, t],
  )

  const insertLink = useCallback(() => {
    const ta = (textareaRef.current?.nativeElement ?? null) as HTMLTextAreaElement | null
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = value.slice(start, end) || t('mdEditor.linkText')
    const snippet = `[${text}](${t('mdEditor.linkUrl')})`
    const next = value.slice(0, start) + snippet + value.slice(end)
    const urlStart = start + text.length + 3
    const urlEnd = urlStart + t('mdEditor.linkUrl').length
    applyChange(next, urlStart, urlEnd)
  }, [value, applyChange, t])

  // Tab 缩进：插入两个空格而不是跳出输入框
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Tab') return
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const next = value.slice(0, start) + '  ' + value.slice(ta.selectionEnd)
      applyChange(next, start + 2, start + 2)
    },
    [value, applyChange],
  )

  // 标题：先去掉已有的 '#{1,6} ' 前缀，再添加目标级别；同级再点则取消
  const applyHeading = useCallback(
    (level: number) => {
      prefixLines((line) => {
        const stripped = line.replace(/^#{1,6}\s+/, '')
        const current = /^#{1,6}\s+/.exec(line)?.[0].trim().length ?? 0
        return current === level ? stripped : `${'#'.repeat(level)} ${stripped}`
      })
    },
    [prefixLines],
  )

  const insertCodeBlock = useCallback(() => {
    const placeholder = t('mdEditor.codePlaceholder')
    insertBlock('```js\n' + placeholder + '\n```', 'mdEditor.codePlaceholder')
  }, [insertBlock, t])

  const toggleQuote = useCallback(
    () => prefixLines((line) => (/^>\s?/.test(line) ? line.replace(/^>\s?/, '') : `> ${line}`)),
    [prefixLines],
  )
  const toggleUl = useCallback(
    () => prefixLines((line) => (/^[-*]\s/.test(line) ? line : `- ${line}`)),
    [prefixLines],
  )
  const toggleOl = useCallback(() => {
    let i = 0
    prefixLines((line) => {
      i += 1
      return /^\d+\.\s/.test(line) ? line : `${i}. ${line}`
    })
  }, [prefixLines])
  const toggleTask = useCallback(
    () =>
      prefixLines((line) =>
        /^- \[[ x]\]\s/.test(line) ? line.replace(/^- \[[ x]\]\s/, '') : `- [ ] ${line}`,
      ),
    [prefixLines],
  )

  /** 分组之间渲染竖分隔线 */
  const toolbarGroups: ToolItem[][] = [
    [
      {
        key: 'bold',
        tip: t('mdEditor.bold'),
        icon: <BoldOutlined />,
        onClick: () => wrapInline('**', 'mdEditor.textPlaceholder'),
      },
      {
        key: 'italic',
        tip: t('mdEditor.italic'),
        icon: <ItalicOutlined />,
        onClick: () => wrapInline('*', 'mdEditor.textPlaceholder'),
      },
      {
        key: 'strike',
        tip: t('mdEditor.strike'),
        icon: <span className="md-toolbar-strike">S</span>,
        onClick: () => wrapInline('~~', 'mdEditor.textPlaceholder'),
      },
      {
        key: 'code',
        tip: t('mdEditor.inlineCode'),
        icon: <CodeOutlined />,
        onClick: () => wrapInline('`', 'mdEditor.codePlaceholder'),
      },
    ],
    [
      {
        key: 'quote',
        tip: t('mdEditor.quote'),
        icon: <span className="md-toolbar-quote">&rdquo;</span>,
        onClick: toggleQuote,
      },
      {
        key: 'codeblock',
        tip: t('mdEditor.codeBlock'),
        icon: <span className="md-toolbar-text">{'</>'}</span>,
        onClick: insertCodeBlock,
      },
      {
        key: 'hr',
        tip: t('mdEditor.hr'),
        icon: <MinusOutlined />,
        onClick: () => insertBlock('---'),
      },
    ],
    [
      { key: 'ul', tip: t('mdEditor.ul'), icon: <UnorderedListOutlined />, onClick: toggleUl },
      { key: 'ol', tip: t('mdEditor.ol'), icon: <OrderedListOutlined />, onClick: toggleOl },
      { key: 'task', tip: t('mdEditor.task'), icon: <CheckSquareOutlined />, onClick: toggleTask },
      { key: 'link', tip: t('mdEditor.link'), icon: <LinkOutlined />, onClick: insertLink },
    ],
  ]

  // H1~H6 下拉项
  const headingMenuItems = [1, 2, 3, 4, 5, 6].map((level) => ({
    key: String(level),
    label: t(`mdEditor.heading${level}`),
    onClick: () => applyHeading(level),
  }))

  // 预览区在分屏/预览模式下展示
  const showEditor = mode === 'edit' || mode === 'split'
  const showPreview = mode === 'split' || mode === 'preview'

  return (
    <div className={`md-editor md-editor-${mode}`}>
      <div className="md-editor-toolbar">
        <Space size={2} wrap>
          <Dropdown menu={{ items: headingMenuItems }} trigger={['click']}>
            <Tooltip title={t('mdEditor.headingTip')}>
              <Button size="small" icon={<FontSizeOutlined />} className="md-toolbar-btn">
                {t('mdEditor.heading')}
              </Button>
            </Tooltip>
          </Dropdown>
          {toolbarGroups.map((group, gi) => (
            <Space key={gi} size={2} className="md-toolbar-group">
              {group.map((item) => (
                <Tooltip key={item.key} title={item.tip}>
                  <Button
                    size="small"
                    icon={item.icon}
                    className="md-toolbar-btn"
                    onClick={item.onClick}
                  />
                </Tooltip>
              ))}
            </Space>
          ))}
        </Space>
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { value: 'edit', label: t('mdEditor.modeEdit') },
            { value: 'split', label: t('mdEditor.modeSplit') },
            { value: 'preview', label: t('mdEditor.modePreview') },
          ]}
        />
      </div>

      <div className="md-editor-body">
        {showEditor ? (
          <TextArea
            ref={textareaRef}
            className="md-editor-textarea"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={rows}
            maxLength={maxLength}
            showCount={showCount}
          />
        ) : null}
        {showPreview ? (
          <div className="md-editor-preview">
            {value.trim() ? (
              <MarkdownView content={value} />
            ) : (
              <span className="md-editor-preview-empty">{t('mdEditor.previewEmpty')}</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
