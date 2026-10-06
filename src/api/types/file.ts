/** 文件模块类型定义: 文件上传响应体
 * 供 api/file.ts 的请求函数和格视图复用
 */

/** POST /api/files 上传成功后返回单个文件的信息*/
export interface UploadedFileResponse {
    /** 文件 ID */
    id: number
    /** 原始文件名 */
    original_name: string
    /** 文件MIME类型，如image/png */
    content_type: string
    /** 文件大小，单位字节 */
    size: number
    /** 文件访问地址 */
    url: string
}
