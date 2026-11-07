/**
 * 极简 XLSX 读取工具（可复用，代码要求 1）。
 *
 * 只做「把 .xlsx 的第一个数据表读成二维数组」这一件事，用于「批量添加新成员」的导入分析：
 *   - 自己解 zip（store / deflate 两种都支持，deflate 用浏览器内置 DecompressionStream）；
 *   - 自己解 sharedStrings / inlineStr / 数字 / 布尔；
 *   - 数字单元格若套用了日期格式，自动换算成 YYYY-MM-DD 文本，避免把 45292 这类序列号当生日。
 *
 * 不支持 .xls（老二进制格式）、宏、公式计算（只读缓存值），与页面「仅支持 .xlsx」的限制一致。
 */
import { BULK_MEMBER_SHEET_NAME } from '../config/bulkMembers'
import { createZipReader } from './zip'

/** 单元格值：文本、数字或空 */
export type XlsxCellValue = string | number | null

/** 读取结果 */
export interface ReadXlsxResult {
  /** 实际读取的工作表名称（必填） */
  sheetName: string
  /** 工作表全部行（必填；下标 0 对应 Excel 第 1 行，缺失行为空数组） */
  rows: XlsxCellValue[][]
}

const textDecoder = new TextDecoder('utf-8')

/**
 * 解析 XML 文本。
 * @param text XML 字符串（必填）
 * @param label 出错时用于提示的文件名（必填）
 * @returns Document
 */
function parseXml(text: string, label: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`${label} 解析失败（XML 格式错误）`)
  }
  return doc
}

/** 取直接子元素中指定本地名的元素 */
function childElements(parent: Element, localName: string): Element[] {
  const result: Element[] = []
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 1 && (node as Element).localName === localName) {
      result.push(node as Element)
    }
  }
  return result
}

/** 取元素内所有 <t> 文本（兼容富文本的多个 run） */
function joinTextNodes(parent: Element): string {
  return Array.from(parent.getElementsByTagName('t'))
    .map((node) => node.textContent ?? '')
    .join('')
}

/** 读取关系表中的 rId → target 映射 */
function readRelationships(doc: Document): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of Array.from(doc.getElementsByTagName('Relationship'))) {
    const id = node.getAttribute('Id')
    const target = node.getAttribute('Target')
    if (id && target) map.set(id, target)
  }
  return map
}

/** 取元素的 r:id（命名空间属性需按 localName 找） */
function getRelationshipId(element: Element): string | null {
  for (const attr of Array.from(element.attributes)) {
    if (attr.localName === 'id') return attr.value
  }
  return null
}

/** Excel 内置的日期数字格式编号 */
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
])

/**
 * 解析样式表，得到「第几个样式是日期格式」的数组。
 * @param doc styles.xml 文档（必填）
 * @returns boolean[] 下标即单元格的 s 属性值
 */
function readDateStyles(doc: Document): boolean[] {
  const customFormats = new Map<number, string>()
  for (const node of Array.from(doc.getElementsByTagName('numFmt'))) {
    const id = Number(node.getAttribute('numFmtId'))
    const code = node.getAttribute('formatCode') ?? ''
    if (Number.isFinite(id)) customFormats.set(id, code)
  }

  const result: boolean[] = []
  const cellXfs = doc.getElementsByTagName('cellXfs')[0]
  if (!cellXfs) return result
  for (const xf of childElements(cellXfs, 'xf')) {
    const numFmtId = Number(xf.getAttribute('numFmtId') ?? '0')
    if (BUILTIN_DATE_FORMATS.has(numFmtId)) {
      result.push(true)
      continue
    }
    const code = customFormats.get(numFmtId)
    if (code) {
      // 去掉引号内的字面量与颜色/条件段，再看是否含年月日占位符
      const cleaned = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')
      result.push(/[yYmMdD]/.test(cleaned))
      continue
    }
    result.push(false)
  }
  return result
}

/** 把 Excel 日期序列号转成 YYYY-MM-DD */
function serialToDateString(serial: number): string {
  // Excel 以 1899-12-30 为原点（已包含 1900 闰年兼容）
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000)
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return String(serial)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** 列引用（如 AB12）转 0 基列号 */
function columnIndexFromRef(ref: string): number {
  const letters = ref.replace(/\d+/g, '')
  let index = 0
  for (const char of letters) {
    index = index * 26 + (char.toUpperCase().charCodeAt(0) - 64)
  }
  return Math.max(0, index - 1)
}

/**
 * 读取 .xlsx 的工作表数据。
 * @param file 浏览器选择的文件（必填，需为 .xlsx）
 * @param preferredSheetName 优先读取的工作表名（可选，默认「新成员」；找不到则用第一张表）
 * @returns Promise<ReadXlsxResult> 工作表名与二维数据（下标 0 = Excel 第 1 行）
 */
export async function readXlsx(
  file: File,
  preferredSheetName: string = BULK_MEMBER_SHEET_NAME,
): Promise<ReadXlsxResult> {
  const readEntry = createZipReader(await file.arrayBuffer())

  const workbookBytes = await readEntry('xl/workbook.xml')
  if (!workbookBytes) throw new Error('不是有效的 xlsx 文件（缺少 xl/workbook.xml）')
  const workbookDoc = parseXml(textDecoder.decode(workbookBytes), 'xl/workbook.xml')

  const relsBytes = await readEntry('xl/_rels/workbook.xml.rels')
  const relsDoc = relsBytes ? parseXml(textDecoder.decode(relsBytes), 'workbook.xml.rels') : null
  const relationships = relsDoc ? readRelationships(relsDoc) : new Map<string, string>()

  const sheetNodes = Array.from(workbookDoc.getElementsByTagName('sheet'))
  if (sheetNodes.length === 0) throw new Error('工作簿里没有工作表')

  const picked =
    sheetNodes.find((node) => node.getAttribute('name') === preferredSheetName) ?? sheetNodes[0]
  const sheetName = picked.getAttribute('name') ?? 'Sheet1'
  const relId = getRelationshipId(picked)
  const target = relId ? relationships.get(relId) : undefined
  const sheetPath = target
    ? target.startsWith('/')
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, '')}`
    : 'xl/worksheets/sheet1.xml'

  const sharedStrings: string[] = []
  const sharedBytes = await readEntry('xl/sharedStrings.xml')
  if (sharedBytes) {
    const sharedDoc = parseXml(textDecoder.decode(sharedBytes), 'sharedStrings.xml')
    for (const item of Array.from(sharedDoc.getElementsByTagName('si'))) {
      sharedStrings.push(joinTextNodes(item))
    }
  }

  let dateStyles: boolean[] = []
  const styleBytes = await readEntry('xl/styles.xml')
  if (styleBytes) {
    dateStyles = readDateStyles(parseXml(textDecoder.decode(styleBytes), 'styles.xml'))
  }

  const sheetBytes = await readEntry(sheetPath)
  if (!sheetBytes) throw new Error(`找不到工作表数据（${sheetPath}）`)
  const sheetDoc = parseXml(textDecoder.decode(sheetBytes), sheetPath)

  const rows: XlsxCellValue[][] = []
  for (const rowNode of Array.from(sheetDoc.getElementsByTagName('row'))) {
    const rowNumber = Number(rowNode.getAttribute('r') ?? '0')
    const targetRow = Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : rows.length
    const values: XlsxCellValue[] = []

    for (const cell of childElements(rowNode, 'c')) {
      const ref = cell.getAttribute('r') ?? ''
      const colIndex = ref ? columnIndexFromRef(ref) : values.length
      const type = cell.getAttribute('t') ?? 'n'
      const styleIndex = Number(cell.getAttribute('s') ?? '-1')

      const valueNode = childElements(cell, 'v')[0]
      const rawValue = valueNode?.textContent ?? ''
      let value: XlsxCellValue = null

      if (type === 's') {
        const index = Number(rawValue)
        value = Number.isFinite(index) ? (sharedStrings[index] ?? '') : ''
      } else if (type === 'inlineStr') {
        value = joinTextNodes(cell)
      } else if (type === 'str' || type === 'd') {
        value = rawValue
      } else if (type === 'b') {
        value = rawValue === '1' ? 'TRUE' : 'FALSE'
      } else if (type === 'e') {
        value = rawValue
      } else if (rawValue !== '') {
        const numeric = Number(rawValue)
        if (!Number.isFinite(numeric)) {
          value = rawValue
        } else if (dateStyles[styleIndex]) {
          value = serialToDateString(numeric)
        } else {
          value = numeric
        }
      }

      while (values.length < colIndex) values.push(null)
      values[colIndex] = value
    }

    while (rows.length < targetRow) rows.push([])
    rows[targetRow] = values
  }

  return { sheetName, rows }
}
