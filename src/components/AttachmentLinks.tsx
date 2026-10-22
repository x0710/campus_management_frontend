/**
 * 附件展示（可复用）。
 * 详情接口返回的附件地址优先按图片缩略图展示（点击可放大预览），
 * 图片加载失败（如 PDF 等非图片文件）时自动回退为下载链接；
 * 样式沿用 antd 主题 token，自动适配亮色与夜间模式。
 */
import { Image, Space, Typography, theme } from 'antd'
import { useState } from 'react'
import { useT } from '../i18n'

const { Link: TypographyLink, Text } = Typography

/** 组件属性 */
interface Props {
  /** 附件下载地址列表（可选；null/undefined 视为无附件） */
  urls?: string[] | null
  /** 无附件时的占位文案（必填） */
  emptyText: string
}

/** 单个附件：优先展示图片缩略图，非图片回退为下载链接 */
function AttachmentItem({ url, index }: { url: string; index: number }) {
  const t = useT()
  const { token } = theme.useToken()
  const [imageFailed, setImageFailed] = useState(false)

  if (imageFailed) {
    return (
      <TypographyLink
        href={url}
        target="_blank"
        rel="noreferrer"
        title={url}
        style={{ wordBreak: 'break-all' }}
      >
        {url}
      </TypographyLink>
    )
  }

  return (
    <Space direction="vertical" size={4} align="center">
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
      <TypographyLink href={url} target="_blank" rel="noreferrer" title={url}>
        {`${t('common.attachment')} ${index + 1}`}
      </TypographyLink>
    </Space>
  )
}

/** 附件列表：图片直接内联展示，其余以链接形式展示 */
export default function AttachmentLinks({ urls, emptyText }: Props) {
  const list = (urls ?? []).filter((url) => url.trim())

  if (list.length === 0) {
    return <Text type="secondary">{emptyText}</Text>
  }

  return (
    <Space wrap size={12} align="start">
      {list.map((url, index) => (
        <AttachmentItem key={url} url={url} index={index} />
      ))}
    </Space>
  )
}
