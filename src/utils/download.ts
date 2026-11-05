/**
 * 浏览器文件下载工具（可复用，代码要求 1）。
 *
 * 目前提供文本文件下载（校验报错日志等）；xlsx 下载见 utils/xlsx.ts。
 */

/**
 * 触发浏览器下载一个文本文件。
 * @param fileName 下载文件名（必填，建议带 .txt 后缀）
 * @param content 文本内容（必填；自动加 UTF-8 BOM，避免 Windows 记事本打开中文乱码）
 * @param mime 文件 MIME（可选，默认 text/plain;charset=utf-8）
 */
export function downloadTextFile(
  fileName: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob(['\ufeff', content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // 交给浏览器完成下载后再释放 URL
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
