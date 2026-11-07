/**
 * DOCX 纯文本读取（可复用，代码要求 1）。
 *
 * 浏览器不能直接渲染 Word，这里只解出 `word/document.xml` 里的文字，
 * 用于附件在线预览；格式、图片、表格边框等不保留。
 */
import { createZipReader } from './zip'

const textDecoder = new TextDecoder('utf-8')

/**
 * 读取 .docx 的纯文本内容。
 * @param blob docx 文件（必填）
 * @returns Promise<string> 按段落分隔的纯文本
 */
export async function readDocxText(blob: Blob): Promise<string> {
  const readEntry = createZipReader(await blob.arrayBuffer())
  const bytes = await readEntry('word/document.xml')
  if (!bytes) throw new Error('不是有效的 docx 文件（缺少 word/document.xml）')

  const doc = new DOMParser().parseFromString(textDecoder.decode(bytes), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('docx 文档解析失败（XML 格式错误）')
  }

  // 按段落提取 <w:t> 文本；表格单元格里的段落也会包含在 document.xml 中
  const paragraphs = Array.from(doc.getElementsByTagName('*')).filter(
    (node) => node.localName === 'p',
  )
  const lines = paragraphs.map((paragraph) =>
    Array.from(paragraph.getElementsByTagName('*'))
      .filter((node) => node.localName === 't')
      .map((node) => node.textContent ?? '')
      .join(''),
  )

  return lines.join('\n').trim()
}
