/** 公告编辑器：所见即所得（WYSIWYG），底层仍存 Markdown。
 *
 * - 受控接口：value(markdown) / onChange(markdown)，可直接放进 antd Form.Item；
 * - 内部用 TipTap 渲染富文本工具栏（粗体/斜体/删除线/标题/引用/代码块/无序/有序/
 *   任务列表/链接/分割线），点标题或列表直接应用到正文，不再显示 Markdown 语法；
 * - 载入：marked 将 Markdown 转为 HTML（含 GFM），DOMPurify 消毒后注入编辑器；
 * - 回写：turndown + turndown-plugin-gfm 将 HTML 转回 Markdown 存库，保留表格等 GFM，
 *   避免旧 Markdown 数据往返丢失。
 */
import { Extension } from '@tiptap/core'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import DOMPurify from 'dompurify'
import { useEffect, useRef } from 'react'
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
import { Button, Dropdown, Space, Tooltip } from 'antd'
import { useT } from '../i18n'

marked.setOptions({ gfm: true, breaks: true })

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  // 斜体必须用 * ：marked 对紧邻中文的 _下划线_ 不做强调，会导致斜体丢失
  emDelimiter: '*',
  strongDelimiter: '**',
})
turndown.use(gfm)
turndown.remove(['script', 'style'])

/**
 * Tab 缩进：
 * 列表内交给 StarterKit 的 ListKeymap 处理（Tab 缩进 / Shift+Tab 反缩进）；
 * 普通段落里 Tab 插入两个空格，Shift+Tab 不做处理。
 * 两者都必须返回 true，否则事件冒泡到浏览器默认行为会把焦点移出编辑器
 * （表现为光标消失、打不了字，需要重新点击）。
 */
const TabIndent = Extension.create({
  name: 'tabIndent',
  addKeyboardShortcuts() {
    const inList = () =>
      this.editor.isActive('listItem') || this.editor.isActive('taskItem')
    return {
      Tab: () => (inList() ? false : this.editor.commands.insertContent('  ')),
      'Shift-Tab': () => inList(),
    }
  },
})

/** 工具栏按钮项 */
interface ToolItem {
  key: string
  tip: string
  icon?: React.ReactNode
  isActive?: () => boolean
  onClick: () => void
}

interface Props {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  maxLength?: number
  showCount?: boolean
}

export default function RichTextEditor({
  value = '',
  onChange,
  placeholder,
  maxLength,
  showCount = false,
}: Props) {
  const t = useT()
  const lastValue = useRef(value)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      CharacterCount.configure({ limit: maxLength ?? null }),
      TabIndent,
    ],
    content: '<p></p>',
    immediatelyRender: false,
    // 打开事务重渲染，工具栏激活态才能随光标/选区实时刷新
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: e }) => {
      const md = editorToMarkdown(e)
      lastValue.current = md
      onChange?.(md)
    },
  })

  // 外部 value 变化（Form 回填 / 重置）时同步进编辑器；与 onUpdate 比较避免死循环
  useEffect(() => {
    if (!editor) return
    if (value === lastValue.current) return
    lastValue.current = value
    const html = markdownToHtml(value)
    editor.commands.setContent(html.length ? html : '<p></p>')
  }, [editor, value])

  const run = (fn: () => void) => {
    if (!editor) return
    fn()
    editor.commands.focus()
  }

  const applyLink = () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selected = editor.state.doc.textBetween(from, to, ' ').trim()
    const url = t('mdEditor.linkUrl')
    if (selected) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    } else {
      const text = t('mdEditor.linkText')
      editor.chain().focus().insertContent(`<a href="${url}">${text}</a>`).run()
    }
  }

  const addHeading = (level: 1 | 2 | 3 | 4 | 5 | 6) => {
    if (!editor) return
    if (editor.isActive('heading', { level })) {
      editor.chain().focus().setParagraph().run()
    } else {
      editor.chain().focus().toggleHeading({ level }).run()
    }
  }

  const headingMenuItems = ([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    key: String(level),
    label: t(`mdEditor.heading${level}`),
    onClick: () => addHeading(level),
  }))

  const groups: ToolItem[][] = [
    [
      {
        key: 'bold',
        tip: t('mdEditor.bold'),
        icon: <BoldOutlined />,
        isActive: () => !!editor?.isActive('bold'),
        onClick: () => editor?.chain().focus().toggleBold().run(),
      },
      {
        key: 'italic',
        tip: t('mdEditor.italic'),
        icon: <ItalicOutlined />,
        isActive: () => !!editor?.isActive('italic'),
        onClick: () => editor?.chain().focus().toggleItalic().run(),
      },
      {
        key: 'strike',
        tip: t('mdEditor.strike'),
        icon: <span className="md-toolbar-strike">S</span>,
        isActive: () => !!editor?.isActive('strike'),
        onClick: () => editor?.chain().focus().toggleStrike().run(),
      },
      {
        key: 'code',
        tip: t('mdEditor.inlineCode'),
        icon: <CodeOutlined />,
        isActive: () => !!editor?.isActive('code'),
        onClick: () => editor?.chain().focus().toggleCode().run(),
      },
    ],
    [
      {
        key: 'quote',
        tip: t('mdEditor.quote'),
        icon: <span className="md-toolbar-quote">&rdquo;</span>,
        isActive: () => !!editor?.isActive('blockquote'),
        onClick: () => editor?.chain().focus().toggleBlockquote().run(),
      },
      {
        key: 'codeblock',
        tip: t('mdEditor.codeBlock'),
        icon: <span className="md-toolbar-text">{'</>'}</span>,
        isActive: () => !!editor?.isActive('codeBlock'),
        onClick: () => editor?.chain().focus().toggleCodeBlock().run(),
      },
      {
        key: 'hr',
        tip: t('mdEditor.hr'),
        icon: <MinusOutlined />,
        onClick: () => editor?.chain().focus().setHorizontalRule().run(),
      },
    ],
    [
      {
        key: 'ul',
        tip: t('mdEditor.ul'),
        icon: <UnorderedListOutlined />,
        isActive: () => !!editor?.isActive('bulletList'),
        onClick: () => editor?.chain().focus().toggleBulletList().run(),
      },
      {
        key: 'ol',
        tip: t('mdEditor.ol'),
        icon: <OrderedListOutlined />,
        isActive: () => !!editor?.isActive('orderedList'),
        onClick: () => editor?.chain().focus().toggleOrderedList().run(),
      },
      {
        key: 'task',
        tip: t('mdEditor.task'),
        icon: <CheckSquareOutlined />,
        isActive: () => !!editor?.isActive('taskList'),
        onClick: () => editor?.chain().focus().toggleTaskList().run(),
      },
      {
        key: 'link',
        tip: t('mdEditor.link'),
        icon: <LinkOutlined />,
        onClick: applyLink,
      },
    ],
  ]

  const chars = editor?.storage.characterCount.characters() ?? 0

  return (
    <div className="md-editor md-editor-rich">
      <div className="md-editor-toolbar">
        <Space size={2} wrap>
          <Dropdown menu={{ items: headingMenuItems }} trigger={['click']}>
            <Tooltip title={t('mdEditor.headingTip')}>
              <Button size="small" icon={<FontSizeOutlined />} className="md-toolbar-btn">
                {t('mdEditor.heading')}
              </Button>
            </Tooltip>
          </Dropdown>
          {groups.map((group, gi) => (
            <Space key={gi} size={2} className="md-toolbar-group">
              {group.map((item) => (
                <Tooltip key={item.key} title={item.tip}>
                  <Button
                    size="small"
                    icon={item.icon}
                    className={`md-toolbar-btn${item.isActive?.() ? ' is-active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run(item.onClick)}
                  />
                </Tooltip>
              ))}
            </Space>
          ))}
        </Space>
        {showCount && maxLength ? (
          <span className="md-editor-count">
            {chars} / {maxLength}
          </span>
        ) : null}
      </div>
      <EditorContent editor={editor} className="md-editor-rich-body" />
    </div>
  )
}

/** Markdown → 干净 HTML（含 GFM），供编辑器初始化 / 外部更新注入 */
function markdownToHtml(md: string): string {
  if (!md) return ''
  try {
    const raw = marked.parse(md, { async: false }) as string
    return DOMPurify.sanitize(raw)
  } catch {
    return ''
  }
}

/** 编辑器 HTML → Markdown（保留 GFM：表格/删除线/任务列表） */
function editorToMarkdown(editor: Editor): string {
  try {
    const md = turndown.turndown(editor.getHTML() || '')
    return md.trim()
  } catch {
    return editor.getText().trim()
  }
}