import { isApiUrl, resolveApiUrl } from '../config/api'
/**
 * 附件在线预览弹窗（可复用）。
 *
 * 支持图片、PDF、xlsx（首个工作表）、docx（纯文字）和常见文本文件；
 * 其他类型提示下载查看。文件通过 axios 以 Blob 读取，避免直接打开
 * /api/files/{id} 时浏览器不带 JWT 导致 401。
 */
import { DownloadOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Modal,
  Space,
  Spin,
  Table,
  Typography,
  theme,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useEffect, useMemo, useRef, useState } from 'react'
import { extractErrorReason } from '../api/common'
import { downloadFile, fetchFileBlob, fetchFileBlobByUrl } from '../api/file'
import { useT } from '../i18n'
import { readDocxText } from '../utils/docxReader'
import {
  excelColumnLabel,
  parseFileUrl,
  resolvePreviewKind,
  type PreviewKind,
} from '../utils/filePreview'
import { readXlsx, type XlsxCellValue } from '../utils/xlsxReader'

/** 预览文件信息 */
export interface PreviewFile {
  /** 文件 ID（可选；有 ID 时优先按 ID 读取） */
  id?: number
  /** 原始文件名（必填，用于识别类型与展示） */
  name: string
  /** 文件地址（可选；详情接口返回的 /api/files/{id}?token=…） */
  url?: string
  /** MIME 类型（可选，上传响应里带） */
  contentType?: string
  /** 短时下载令牌（可选；也可从 URL 中解析） */
  token?: string
}

/** 组件属性 */
interface Props {
  /** 当前预览文件（null 表示关闭） */
  file: PreviewFile | null
  /** 是否打开弹窗 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
}

/** 表格预览最多展示的行数 / 列数，避免超大表格卡顿 */
const MAX_SHEET_ROWS = 200
const MAX_SHEET_COLS = 50
/** 文本预览最多展示的字符数 */
const MAX_TEXT_CHARS = 100_000

/**
 * 从预览文件信息里补齐 ID 与令牌（URL 中可能自带 token）。
 * @param file 预览文件（必填）
 * @returns 文件 ID 与令牌
 */
function resolveFileRef(file: PreviewFile): { id?: number; token?: string } {
  const parsed = parseFileUrl(file.url)
  return { id: file.id ?? parsed.id, token: file.token ?? parsed.token }
}

/**
 * 把异常转成可展示文案；普通 Error 优先展示自身 message。
 * @param err 捕获到的异常（必填）
 * @param t 翻译函数（必填）
 * @returns 展示文案
 */
function toErrorText(err: unknown, t: ReturnType<typeof useT>): string {
  if (err instanceof Error && !axios.isAxiosError(err) && err.message) return err.message
  return extractErrorReason(err, t)
}

/**
 * 附件预览弹窗。
 * @param { file, open, onClose } 类型：Props；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function FilePreviewModal({ file, open, onClose }: Props) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const { token: themeToken } = theme.useToken()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<PreviewKind>('unsupported')
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [textPreview, setTextPreview] = useState('')
  const [sheet, setSheet] = useState<{
    name: string
    rows: XlsxCellValue[][]
  } | null>(null)
  /** 图片 / PDF 的临时 Blob URL，关闭或切换文件时释放 */
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !file) {
      setLoading(false)
      setError(null)
      setKind('unsupported')
      setObjectUrl(null)
      setTextPreview('')
      setSheet(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setObjectUrl(null)
    setTextPreview('')
    setSheet(null)
    setKind('unsupported')

    const load = async () => {
      const { id, token } = resolveFileRef(file)
      const blob = id !== undefined
        ? await fetchFileBlob(id, token)
        : file.url
          ? await fetchFileBlobByUrl(file.url)
          : null
      if (!blob) throw new Error(t('common.previewUnavailable'))
      if (cancelled) return

      const detected = resolvePreviewKind(file.name, file.contentType || blob.type)
      setKind(detected)

      if (detected === 'image' || detected === 'pdf') {
        const mime =
          detected === 'pdf'
            ? 'application/pdf'
            : file.contentType || blob.type || 'application/octet-stream'
        const typed = blob.type === mime ? blob : new Blob([blob], { type: mime })
        objectUrlRef.current = URL.createObjectURL(typed)
        setObjectUrl(objectUrlRef.current)
        return
      }

      if (detected === 'xlsx') {
        const fileName = file.name || 'attachment.xlsx'
        const result = await readXlsx(
          new File([blob], fileName, {
            type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          '',
        )
        if (!cancelled) setSheet({ name: result.sheetName, rows: result.rows })
        return
      }

      if (detected === 'docx') {
        const text = await readDocxText(blob)
        if (!cancelled) setTextPreview(text.slice(0, MAX_TEXT_CHARS))
        return
      }

      if (detected === 'text') {
        const text = await blob.text()
        if (!cancelled) setTextPreview(text.slice(0, MAX_TEXT_CHARS))
      }
    }

    void load()
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorText(err, t))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [open, file, t])

  /** 表格预览数据：最多 200 行 × 50 列 */
  const sheetPreview = useMemo(() => {
    if (!sheet || sheet.rows.length === 0) return null
    const rows = sheet.rows.slice(0, MAX_SHEET_ROWS)
    const colCount = Math.min(
      MAX_SHEET_COLS,
      rows.reduce((max, row) => Math.max(max, row.length), 0),
    )
    if (colCount === 0) return null

    const columns: ColumnsType<Record<string, unknown>> = Array.from(
      { length: colCount },
      (_, index) => ({
        title: excelColumnLabel(index),
        dataIndex: `c${index}`,
        key: `c${index}`,
        width: 150,
        ellipsis: true,
        render: (value: unknown) => String(value ?? ''),
      }),
    )
    const dataSource = rows.map((row, rowIndex) => {
      const record: Record<string, unknown> = { key: rowIndex }
      for (let col = 0; col < colCount; col += 1) record[`c${col}`] = row[col]
      return record
    })
    const truncated =
      sheet.rows.length > MAX_SHEET_ROWS || sheet.rows.some((row) => row.length > MAX_SHEET_COLS)
    return { columns, dataSource, truncated }
  }, [sheet])

  /** 下载当前文件 */
  const handleDownload = async () => {
    if (!file) return
    const { id, token } = resolveFileRef(file)
    try {
      if (id !== undefined) {
        await downloadFile(id, { filename: file.name, token })
      } else if (file.url) {
        window.open(isApiUrl(file.url) ? resolveApiUrl(file.url) : file.url, '_blank', 'noopener,noreferrer')
      } else {
        message.error(t('common.previewUnavailable'))
      }
    } catch (err) {
      message.error(extractErrorReason(err, t))
    }
  }

  /** 弹窗正文：按类型切换预览方式 */
  const renderBody = () => {
    if (!file) return null
    if (loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spin size="large" />
        </div>
      )
    }
    if (error) return <Alert type="error" showIcon title={error} />

    if (kind === 'image' && objectUrl) {
      return (
        <img
          src={objectUrl}
          alt={file.name}
          style={{
            display: 'block',
            maxWidth: '100%',
            maxHeight: '65vh',
            margin: '0 auto',
            objectFit: 'contain',
          }}
        />
      )
    }

    if (kind === 'pdf' && objectUrl) {
      return (
        <iframe
          src={objectUrl}
          title={file.name}
          style={{ width: '100%', height: '65vh', border: 0 }}
        />
      )
    }

    if (kind === 'xlsx') {
      if (!sheetPreview) {
        return <Typography.Text type="secondary">{t('common.previewEmpty')}</Typography.Text>
      }
      return (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {t('common.previewSheet', { name: sheet?.name ?? '' })}
          </Typography.Text>
          {sheetPreview.truncated ? (
            <Alert
              type="info"
              showIcon
              title={t('common.previewTruncated', {
                rows: MAX_SHEET_ROWS,
                cols: MAX_SHEET_COLS,
              })}
            />
          ) : null}
          <Table
            size="small"
            bordered
            columns={sheetPreview.columns}
            dataSource={sheetPreview.dataSource}
            pagination={false}
            scroll={{ x: 'max-content', y: 420 }}
          />
        </Space>
      )
    }

    if (kind === 'docx') {
      return (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Alert type="info" showIcon title={t('common.previewDocxHint')} />
          <pre
            style={{
              margin: 0,
              padding: 12,
              maxHeight: '60vh',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: themeToken.colorFillQuaternary,
              borderRadius: 6,
            }}
          >
            {textPreview || t('common.previewEmpty')}
          </pre>
        </Space>
      )
    }

    if (kind === 'text') {
      return (
        <pre
          style={{
            margin: 0,
            padding: 12,
            maxHeight: '60vh',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: themeToken.colorFillQuaternary,
            borderRadius: 6,
          }}
        >
          {textPreview || t('common.previewEmpty')}
        </pre>
      )
    }

    return <Alert type="info" showIcon title={t('common.previewUnsupported')} />
  }

  return (
    <Modal
      open={open}
      title={<span style={{ wordBreak: 'break-all' }}>{file?.name ?? ''}</span>}
      width={900}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => void handleDownload()}>
            {t('common.download')}
          </Button>
        </Space>
      }
    >
      {renderBody()}
    </Modal>
  )
}
