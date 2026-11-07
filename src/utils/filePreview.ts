/**
 * 附件预览的通用工具：文件类型识别、文件 URL 解析、Excel 列名。
 */

/** 预览方式 */
export type PreviewKind = 'image' | 'pdf' | 'xlsx' | 'docx' | 'text' | 'unsupported'

/** 图片扩展名 */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'])

/** 纯文本扩展名 */
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'json', 'xml', 'log', 'yaml', 'yml'])

/**
 * 取文件名或 URL 的扩展名（忽略查询串与哈希）。
 * @param nameOrUrl 文件名或 URL（必填）
 * @returns 小写扩展名；没有扩展名时返回空串
 */
export function fileExtension(nameOrUrl: string): string {
  const clean = nameOrUrl.split(/[?#]/)[0]
  const match = /\.([a-z0-9]+)$/i.exec(clean)
  return match?.[1]?.toLowerCase() ?? ''
}

/**
 * 根据 MIME 类型或扩展名判断预览方式。
 * @param name 文件名或 URL（必填）
 * @param contentType MIME 类型（可选）
 * @returns PreviewKind 预览方式
 */
export function resolvePreviewKind(name: string, contentType?: string): PreviewKind {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
  const ext = fileExtension(name)

  if (type.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type.includes('spreadsheetml') || ext === 'xlsx') return 'xlsx'
  if (type.includes('wordprocessingml') || ext === 'docx') return 'docx'
  if (type.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text'
  return 'unsupported'
}

/**
 * 从 `/api/files/{id}?token=…` 形式的地址中解析文件 ID 与下载令牌。
 * @param url 文件地址（可选）
 * @returns 文件 ID 与令牌；无法解析时字段为 undefined
 */
export function parseFileUrl(url?: string | null): { id?: number; token?: string } {
  if (!url) return {}
  try {
    const parsed = new URL(url, 'http://localhost')
    const match = /\/files\/(\d+)(?:\/|$)/.exec(parsed.pathname)
    return {
      id: match ? Number(match[1]) : undefined,
      token: parsed.searchParams.get('token') ?? undefined,
    }
  } catch {
    return {}
  }
}

/**
 * 0 基列序号转 Excel 列名（0 → A，26 → AA）。
 * @param index 0 基列序号（必填）
 * @returns Excel 列名
 */
export function excelColumnLabel(index: number): string {
  let value = index + 1
  let label = ''
  while (value > 0) {
    const mod = (value - 1) % 26
    label = String.fromCharCode(65 + mod) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}
