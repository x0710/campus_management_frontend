/**
 * 附件展示（可复用）。
 * 图片优先展示缩略图（点击可放大）；其他文件显示「附件 N」，
 * 点击后按类型在线预览图片 / PDF / xlsx / docx / 文本，无法预览时提示下载。
 * 样式沿用 antd 主题 token，自动适配亮色与夜间模式。
 */
import { Image, Space, Typography, theme } from 'antd'
import { useState } from 'react'
import { useT } from '../i18n'
import { fileExtension, parseFileUrl } from '../utils/filePreview'
import FilePreviewModal, { type PreviewFile } from './FilePreviewModal'

const { Link: TypographyLink, Text } = Typography

/** 组件属性 */
interface Props {
  /** 附件下载地址列表（可选；null/undefined 视为无附件） */
  urls?: string[] | null
  /** 无附件时的占位文案（必填） */
  emptyText: string
}

/** 单个附件：优先展示图片缩略图，非图片回退为可点击预览的链接 */
function AttachmentItem({
  url,
  index,
  onPreview,
}: {
  url: string
  index: number
  onPreview: (url: string, index: number) => void
}) {
  const t = useT()
  const { token } = theme.useToken()
  const [imageFailed, setImageFailed] = useState(false)

  if (imageFailed) {
    return (
      <TypographyLink
        onClick={() => onPreview(url, index)}
        title={url}
        style={{ wordBreak: 'break-all', cursor: 'pointer' }}
      >
        {`${t('common.attachment')} ${index + 1}`}
      </TypographyLink>
    )
  }

  return (
    <Space orientation="vertical" size={4} align="center">
      <Image
        src={url}
        alt={`${t('common.attachment')} ${index + 1}`}
        width={120}
        height={120}
        style={{
          objectFit: 'cover',
          borderRadius: 6,
          border: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
        }}
        onError={() => setImageFailed(true)}
      />
      <TypographyLink
        onClick={() => onPreview(url, index)}
        title={url}
        style={{ cursor: 'pointer' }}
      >
        {`${t('common.attachment')} ${index + 1}`}
      </TypographyLink>
    </Space>
  )
}

/**
 * 附件列表：图片直接内联展示，其余以链接形式展示
 * @param { urls, emptyText } 类型：Props；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function AttachmentLinks({ urls, emptyText }: Props) {
  const t = useT()
  const [preview, setPreview] = useState<PreviewFile | null>(null)
  const list = (urls ?? []).filter((url) => url.trim())

  if (list.length === 0) {
    return <Text type="secondary">{emptyText}</Text>
  }

  /**
   * 打开附件预览：优先解析 /api/files/{id} 与 token；
   * 解析不到 ID 时仍把 URL 交给弹窗尝试读取。
   */
  const openPreview = (url: string, index: number) => {
    const { id, token } = parseFileUrl(url)
    // 非 /api/files/{id} 的静态地址无法走带 JWT 的 Blob 读取，直接新窗口打开
    if (id === undefined && !url.startsWith('/api/')) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    const ext = fileExtension(url)
    setPreview({
      id,
      token,
      url,
      name: `${t('common.attachment')} ${index + 1}${ext ? `.${ext}` : ''}`,
    })
  }

  return (
    <>
      <Space wrap size={12} align="start">
        {list.map((url, index) => (
          <AttachmentItem key={url} url={url} index={index} onPreview={openPreview} />
        ))}
      </Space>
      <FilePreviewModal
        file={preview}
        open={preview !== null}
        onClose={() => setPreview(null)}
      />
    </>
  )
}
