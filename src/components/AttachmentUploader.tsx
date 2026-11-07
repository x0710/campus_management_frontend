/**
 * 通用附件上传组件。
 * 负责调用 POST /api/files 上传一个或多个文件，并通过 value/onChange 与 Form.Item 对接，
 * 业务接口只需接收上传成功后返回的文件 ID 列表（如 /api/party-scores 的 files 字段）。
 * 上传失败时展示「状态码 + 原因」（代码要求 9）；文件列表沿用 antd 主题，自动适配夜间模式。
 */
import { UploadOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Upload } from 'antd'
import type { UploadFile, UploadProps } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { extractErrorReason } from '../api/common'
import { uploadFiles } from '../api/file'
import type { UploadedFileResponse } from '../api/types/file'
import { useT } from '../i18n'
import FilePreviewModal, { type PreviewFile } from './FilePreviewModal'

/** 组件属性 */
interface Props {
  /** Form.Item 注入的字段 id，需透传给文件输入框，否则 label 的 for 会指向不存在的元素 */
  id?: string
  /** 已上传文件的 ID 列表（由 Form.Item 注入；默认 undefined，视为空列表） */
  value?: number[]
  /** 文件 ID 列表变化回调（由 Form.Item 注入；默认 undefined，不回调） */
  onChange?: (value: number[]) => void
  /** 最多可选文件数（可选，默认 10） */
  maxCount?: number
}

/**
 * 通用附件上传：选择文件后立即上传，上传成功把文件 ID 追加进表单值
 * @param { value, onChange, maxCount = 10 } 类型：Props；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function AttachmentUploader({ id, value, onChange, maxCount = 10 }: Props) {
  const t = useT()
  const { message } = AntdApp.useApp()
  /** 正在上传的文件列表（上传结束后移除，仅用于展示上传中状态） */
  const [pendingList, setPendingList] = useState<UploadFile[]>([])
  /** 已上传文件元数据（文件 ID → 列表项），用于把 ID 反向渲染成文件名 */
  const [uploadedMap, setUploadedMap] = useState<Map<number, UploadFile>>(() => new Map())
  /** 用户在上传过程中移除的文件 uid，用于忽略稍后返回的上传结果 */
  const cancelledRef = useRef(new Set<string>())
  /** 当前在线预览的文件；null 表示预览弹窗关闭 */
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
  /** 始终指向最新的 value，避免异步回调里拿到过期闭包 */
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  /** 受控文件列表：已上传（按 value 顺序）+ 上传中 */
  const fileList: UploadFile[] = [
    ...(value ?? [])
      .map((id) => uploadedMap.get(id))
      .filter((item): item is UploadFile => item !== undefined),
    ...pendingList,
  ]

  /** 上传单个文件：成功后把返回的文件 ID 追加到表单值 */
  const customRequest: UploadProps['customRequest'] = (options) => {
    const raw = options.file as File & { uid?: string }
    const uid = raw.uid ?? `${raw.name}-${Date.now()}`
    setPendingList((prev) => [...prev, { uid, name: raw.name, status: 'uploading' }])
    void uploadFiles([raw])
      .then(([uploaded]) => {
        if (cancelledRef.current.delete(uid)) return
        if (!uploaded) {
          message.error(t('common.uploadFailed'))
          options.onError?.(new Error('empty upload response'))
          return
        }
        setUploadedMap((prev) => {
          const next = new Map(prev)
          next.set(uploaded.id, {
            uid: String(uploaded.id),
            name: uploaded.original_name,
            status: 'done',
            response: uploaded,
          })
          return next
        })
        onChange?.([...(valueRef.current ?? []), uploaded.id])
        options.onSuccess?.(uploaded)
      })
      .catch((err: unknown) => {
        if (cancelledRef.current.delete(uid)) return
        message.error(extractErrorReason(err, t))
        options.onError?.(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        setPendingList((prev) => prev.filter((item) => item.uid !== uid))
      })
  }

  /** 移除文件：已上传的从表单值中删除 ID；上传中的标记为取消，避免结果回填 */
  const handleRemove: UploadProps['onRemove'] = (file) => {
    const id = Number(file.uid)
    if (uploadedMap.has(id)) {
      onChange?.((valueRef.current ?? []).filter((item) => item !== id))
    } else {
      cancelledRef.current.add(file.uid)
      setPendingList((prev) => prev.filter((item) => item.uid !== file.uid))
    }
    return true
  }

  /** 点击已上传文件名 / 预览图标时打开在线预览 */
  const handlePreview: UploadProps['onPreview'] = (file) => {
    const uploaded =
      (file.response as UploadedFileResponse | undefined) ??
      (uploadedMap.get(Number(file.uid))?.response as UploadedFileResponse | undefined)
    if (!uploaded) return
    setPreviewFile({
      id: uploaded.id,
      name: uploaded.original_name,
      contentType: uploaded.content_type,
      url: uploaded.url,
    })
  }

  return (
    <>
      <Upload
        id={id}
        multiple
        maxCount={maxCount}
        fileList={fileList}
        customRequest={customRequest}
        onRemove={handleRemove}
        onPreview={handlePreview}
      >
        <Button icon={<UploadOutlined />}>{t('common.uploadAttachment')}</Button>
      </Upload>
      <FilePreviewModal
        file={previewFile}
        open={previewFile !== null}
        onClose={() => setPreviewFile(null)}
      />
    </>
  )
}
