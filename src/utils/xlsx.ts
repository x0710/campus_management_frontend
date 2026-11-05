/**
 * 极简 XLSX 生成工具（可复用，代码要求 1）。
 *
 * 背景：项目需要在浏览器里导出「样表 + 编码对照表」，但只涉及二维文本表格，
 * 引入完整 xlsx 库体积较大，因此这里用原生 API 拼一个最小可用的 xlsx（zip + XML）：
 *   - 只写值、列宽、表头样式、行高与冻结首行，满足导出样表/对照表的需要；
 *   - 单元格一律用 inlineStr 字符串或数值写入，不生成 sharedStrings；
 *   - zip 采用 store（不压缩）方式，浏览器与 Excel/WPS 均可直接打开。
 *
 * 用法：
 *   downloadXlsx('批量添加新成员模板.xlsx', [
 *     { name: '新成员', columns: [{ header: '姓名', width: 12 }], rows: [['张三']] },
 *   ])
 */

/** 一列的表头与列宽（宽度单位为 Excel 字符数） */
export interface XlsxColumn {
  /** 表头文本（必填） */
  header: string
  /** 列宽（可选，默认 14） */
  width?: number
}

/** 一张工作表 */
export interface XlsxSheet {
  /** 工作表名称（必填；非法字符会被替换，超长会截断到 31 字符） */
  name: string
  /** 列定义（必填，决定列数与列宽） */
  columns: XlsxColumn[]
  /** 数据行（必填；字符串按文本写入，数字按数值写入，null/undefined 写空单元格） */
  rows: (string | number | null | undefined)[][]
  /** 需要指定行高的行（可选；键为 1 基行号，值为磅值），如较长的填写说明行 */
  rowHeights?: Record<number, number>
}

/** CRC32 查表（zip 每个条目都需要校验值） */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

/**
 * 计算一段字节的 CRC32。
 * @param bytes 待校验字节（必填）
 * @returns number 无符号 32 位校验值
 */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** 把 0 基列序号转成 Excel 列名（0 → A，26 → AA） */
function columnName(index: number): string {
  let value = index + 1
  let name = ''
  while (value > 0) {
    const mod = (value - 1) % 26
    name = String.fromCharCode(65 + mod) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

/** XML 文本转义（& < > " 以及控制字符） */
function escapeXml(text: string): string {
  return (
    text
      // 刻意匹配 XML 不允许的控制字符（U+0000–U+001F 中除 \t \n \r 外的部分），导出前剔除
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/**
 * 生成一张工作表的 XML。
 * @param sheet 工作表定义（必填）
 * @param index 工作表序号（0 基，必填；第 1 张标记为选中）
 * @returns string worksheet XML
 */
function sheetXml(sheet: XlsxSheet, index: number): string {
  const cols = sheet.columns
    .map(
      (col, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${col.width ?? 14}" customWidth="1"/>`,
    )
    .join('')

  const rows: string[] = []
  // 表头行（样式 1：加粗白字蓝底、居中）
  const headerCells = sheet.columns
    .map(
      (col, i) =>
        `<c r="${columnName(i)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(col.header)}</t></is></c>`,
    )
    .join('')
  rows.push(`<row r="1" ht="22" customHeight="1">${headerCells}</row>`)

  sheet.rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2
    const height = sheet.rowHeights?.[rowNumber]
    const heightAttr = height ? ` ht="${height}" customHeight="1"` : ''
    const cells = row
      .map((value, colIndex) => {
        if (value === null || value === undefined || value === '') return ''
        const ref = `${columnName(colIndex)}${rowNumber}`
        if (typeof value === 'number' && Number.isFinite(value)) {
          return `<c r="${ref}" s="2"><v>${value}</v></c>`
        }
        return `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`
      })
      .join('')
    rows.push(`<row r="${rowNumber}"${heightAttr}>${cells}</row>`)
  })

  const tabSelected = index === 0 ? ' tabSelected="1"' : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${tabSelected}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`
}

/** 固定样式表：0 普通、1 表头、2 正文（自动换行、顶端对齐） */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="等线"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="等线"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F54EB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

/**
 * 规整工作表名称：去除 Excel 不允许的字符、截断到 31 字符、重名追加序号。
 * @param name 原始名称（必填，可能为空）
 * @param used 已占用名称集合（必填，会被就地更新）
 * @param index 工作表序号（必填，用于兜底命名）
 * @returns string 合法的唯一工作表名
 */
function normalizeSheetName(name: string, used: Set<string>, index: number): string {
  let base = (name || `Sheet${index + 1}`).replace(/[[\]:*?/\\]/g, '_').trim()
  if (!base) base = `Sheet${index + 1}`
  base = base.slice(0, 31)
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    const tail = `(${suffix})`
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

/**
 * 把若干工作表打包成 xlsx（zip）字节。
 * @param sheets 工作表数组（必填，至少 1 张）
 * @returns Uint8Array<ArrayBuffer> xlsx 文件字节（底层缓冲区可直接交给 Blob）
 */
export function buildXlsxBytes(sheets: XlsxSheet[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const usedNames = new Set<string>()
  const normalized = sheets.map((sheet, index) => ({
    sheet,
    name: normalizeSheetName(sheet.name, usedNames, index),
  }))

  const files: { name: string; data: Uint8Array }[] = []
  const add = (name: string, content: string) =>
    files.push({ name, data: encoder.encode(content) })

  const overrides = normalized
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')

  add(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`,
  )

  add(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  )

  add(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${normalized
      .map(
        (item, i) =>
          `<sheet name="${escapeXml(item.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join('')}</sheets></workbook>`,
  )

  add(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${normalized
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('')}<Relationship Id="rId${normalized.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  )

  add('xl/styles.xml', STYLES_XML)
  normalized.forEach((item, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(item.sheet, i)))

  // ---- 打包为 zip（store 方式，不压缩） ----
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const checksum = crc32(file.data)
    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, 0, true)
    localView.setUint16(12, 0x0021, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, file.data.length, true)
    localView.setUint32(22, file.data.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    chunks.push(local, file.data)

    const record = new Uint8Array(46 + nameBytes.length)
    const recordView = new DataView(record.buffer)
    recordView.setUint32(0, 0x02014b50, true)
    recordView.setUint16(4, 20, true)
    recordView.setUint16(6, 20, true)
    recordView.setUint16(8, 0x0800, true)
    recordView.setUint16(10, 0, true)
    recordView.setUint16(12, 0, true)
    recordView.setUint16(14, 0x0021, true)
    recordView.setUint32(16, checksum, true)
    recordView.setUint32(20, file.data.length, true)
    recordView.setUint32(24, file.data.length, true)
    recordView.setUint16(28, nameBytes.length, true)
    recordView.setUint32(42, offset, true)
    record.set(nameBytes, 46)
    central.push(record)

    offset += local.length + file.data.length
  }

  const centralSize = central.reduce((sum, item) => sum + item.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const total = new Uint8Array(offset + centralSize + end.length)
  let position = 0
  for (const chunk of [...chunks, ...central, end]) {
    total.set(chunk, position)
    position += chunk.length
  }
  return total
}

/**
 * 生成 xlsx 文件的 Blob（MIME 为 Excel 工作簿）。
 * @param sheets 工作表数组（必填，至少 1 张）
 * @returns Blob 可直接下载或预览的 xlsx 文件
 */
export function buildXlsxBlob(sheets: XlsxSheet[]): Blob {
  if (sheets.length === 0) throw new Error('buildXlsxBlob 至少需要一张工作表')
  return new Blob([buildXlsxBytes(sheets)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * 在浏览器中下载 xlsx 文件。
 * @param fileName 下载文件名（必填，建议带 .xlsx 后缀）
 * @param sheets 工作表数组（必填，至少 1 张）
 * @returns 无返回值（void）
 */
export function downloadXlsx(fileName: string, sheets: XlsxSheet[]): void {
  const blob = buildXlsxBlob(sheets)
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
