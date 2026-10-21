/**
 * 文件模块：文件上传（POST /api/files）、文件下载（GET /api/files/{id}）、文件软删除（DELETE /api/files/{id}）。
 * 接口契约以后端 Swagger 为准。
 */
import { http } from './http'
import type { UploadedFileResponse } from './types/file'

/**
 * POST /api/files 上传一个或多个文件。
 * 使用 multipart/form-data，字段名统一为 file；返回每个文件的 id 与访问地址，
 * 返回的 id 可直接填入请假附件的 attachment_id 列表。
 * 权限：需要 file.create。
 *
 * @param files 待上传的文件列表（必填，File[] 或 FileList，至少 1 个）
 * @returns 上传成功的文件信息列表，元素含 id、original_name、content_type、size、url
 */
export async function uploadFiles(
  files: File[] | FileList,
): Promise<UploadedFileResponse[]> {
  const formData = new FormData()
  for (const file of Array.from(files)) {
    formData.append('file', file)
  }
  const res = await http.post<UploadedFileResponse[]>('/files', formData)
  return res.data
}

/**
 * 从 Content-Disposition 响应头解析文件名（后端格式：inline; filename="xxx"）。
 * @param header Content-Disposition 响应头（可选）
 * @returns 解析出的文件名；解析失败返回 null
 */
function parseContentDispositionFilename(header?: string): string | null {
  if (!header) return null
  const match = /filename\*?=(?:UTF-8''|")?([^"]+)/i.exec(header)
  return match?.[1] ?? null
}

/** downloadFile 的可选参数 */
export interface DownloadFileOptions {
  /** 下载保存的文件名（可选；缺省时优先用后端 Content-Disposition 里的原始文件名） */
  filename?: string
  /** 业务接口签发的短时下载令牌（可选；接口不要求令牌校验时可不传） */
  token?: string
}

/**
 * GET /api/files/{id} 下载指定文件。
 * 该接口改用「业务接口签发的短时下载令牌」鉴权（查询参数 `token`），不再依赖 file.read 权限；
 * 令牌由业务接口（如请假详情返回的附件地址）下发，因此调用方需把令牌一并传入。
 * 通过 axios 以 blob 形式拉取（自动附带 JWT）再转成临时 URL 触发浏览器下载；
 * 不能直接 window.open('/api/files/{id}')，浏览器不会附带令牌，会 401。
 *
 * @param id 文件 ID（必填）
 * @param options 下载选项（可选，见 DownloadFileOptions）
 * @returns 无返回值（触发浏览器下载后返回）
 */
export async function downloadFile(
  id: number,
  options?: DownloadFileOptions,
): Promise<void> {
  const res = await http.get<Blob>(`/files/${id}`, {
    responseType: 'blob',
    params: options?.token ? { token: options.token } : undefined,
  })
  const header = res.headers['content-disposition'] as string | undefined
  const name =
    options?.filename ?? parseContentDispositionFilename(header) ?? `file-${id}`

  const objectUrl = URL.createObjectURL(res.data)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 稍后再释放，避免个别浏览器（Safari）在点击瞬间就回收导致下载失败
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

/**
 * DELETE /api/files/{id} 软删除指定文件。
 * 仅上传者本人可删除，非上传者需要 file.delete 权限；
 * 软删除后文件元数据与磁盘文件保留，下载接口会返回 404。
 * 权限：需要登录认证（上传者本人）或 file.delete。
 *
 * @param id 文件 ID（必填）
 * @returns 无返回值（后端返回 204 无内容）
 */
export async function deleteFile(id: number): Promise<void> {
  await http.delete(`/files/${id}`)
}
