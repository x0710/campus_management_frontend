/** 文件模块，提供文件上传和下载api */
import { http } from './http'
import type { UploadedFileResponse } from './types/file'

/** POST /api/files 上传一个或多个文件 
 * 使用 multipart/form-data，字段名统一为 file。
 * 返回每个文件的 ID 和访问地址， 返回的 id 可以直接填入请假附件的 attachment_id 列表。
 * 需要权限 file.create。
 * @param files 要上传的文件列表
 * @returns 上传成功的文件信息列表,元素有id,original_name,content_type,size,url
*/
export async function uploadFiles(
    files: File[] | FileList,
):Promise<UploadedFileResponse[]>{
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
function parseContentDispositionFilename(header?: string): String | null {
    if (!header) return null
    const match = /filename\*?=(?:UTF-8''|")?([^"]+)/i.exec(header)
    return match?.[1] ?? null
}

/**
 * GET /api/files/{id} 下载指定文件（需要 file.read 权限）。
 * 通过 axios 以 blob 形式拉取（自动附带 JWT），再转成临时 URL 触发浏览器下载。
 * 注意：不能直接 window.open('/api/files/{id}')，浏览器不会带 Authorization 头，会 401。
 * @param id 文件 ID（必填）
 * @param filename 下载保存的文件名（可选；缺省时优先用后端 Content-Disposition 里的原始文件名）
 * @returns 无返回值（触发浏览器下载后返回）
 */
export async function downloadFile(id: number, filename?: string): Promise<void> {
  const res = await http.get<Blob>(`/files/${id}`, { responseType: 'blob' })
  const header = res.headers['content-disposition'] as string | undefined
  const name = filename ?? parseContentDispositionFilename(header) ?? `file-${id}`

  const objectUrl = URL.createObjectURL(res.data)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = name as string
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 稍后再释放，避免个别浏览器（Safari）在点击瞬间就回收导致下载失败
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}