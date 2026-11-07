/**
 * 极简 zip 读取工具（可复用，代码要求 1）。
 *
 * 只支持读取条目：解析中央目录 + 按名称取文件，支持 store（0）与 deflate（8）。
 * 供 xlsx 预览 / 导入、docx 文本预览等场景共用。
 */

/** zip 中央目录里的一条记录 */
interface ZipEntry {
  /** 压缩方式：0 = store，8 = deflate */
  method: number
  /** 文件数据在整段字节中的起始位置 */
  dataStart: number
  /** 压缩后大小 */
  compressedSize: number
}

const textDecoder = new TextDecoder('utf-8')

/**
 * 把 zip 里的 deflate 原始流解压成字节。
 * @param data 压缩数据（必填）
 * @returns 解压后的字节
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.length)
  copy.set(data)
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * 解析 zip 的中央目录，返回按名称读取条目的函数。
 * @param buffer 文件字节（必填）
 * @returns 读取单个 zip 条目的函数（条目不存在时返回 null）
 */
export function createZipReader(
  buffer: ArrayBuffer,
): (name: string) => Promise<Uint8Array | null> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const entries = new Map<string, ZipEntry>()

  // 从文件尾部向前找 EOCD（0x06054b50），常规文件不会超过 64KB 的注释区
  let eocd = -1
  const minPos = Math.max(0, bytes.length - 66000)
  for (let i = bytes.length - 22; i >= minPos; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 zip 文件（缺少 zip 结束记录）')

  const entryCount = view.getUint16(eocd + 10, true)
  let pointer = view.getUint32(eocd + 16, true)

  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break
    const method = view.getUint16(pointer + 10, true)
    const compressedSize = view.getUint32(pointer + 20, true)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const localOffset = view.getUint32(pointer + 42, true)
    const name = textDecoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength))

    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    entries.set(name, {
      method,
      compressedSize,
      dataStart: localOffset + 30 + localNameLength + localExtraLength,
    })

    pointer += 46 + nameLength + extraLength + commentLength
  }

  /**
   * 读取一个条目。
   * @param name zip 内路径（必填，如 xl/workbook.xml）
   * @returns 解压后的字节；不存在时返回 null
   */
  return async function readEntry(name: string): Promise<Uint8Array | null> {
    const entry = entries.get(name)
    if (!entry) return null
    const raw = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize)
    if (entry.method === 0) return raw
    if (entry.method === 8) return inflateRaw(raw)
    throw new Error(`不支持的 zip 压缩方式：${entry.method}`)
  }
}
