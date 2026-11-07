import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  excelColumnLabel,
  fileExtension,
  parseFileUrl,
  resolvePreviewKind,
} from '../src/utils/filePreview.ts'

test('fileExtension 忽略查询串并转小写', () => {
  assert.equal(fileExtension('报告.DOCX?token=abc'), 'docx')
  assert.equal(fileExtension('/api/files/12?token=abc'), '')
})

test('resolvePreviewKind 按 MIME 或扩展名识别预览方式', () => {
  assert.equal(resolvePreviewKind('a.PNG'), 'image')
  assert.equal(resolvePreviewKind('a.bin', 'application/pdf'), 'pdf')
  assert.equal(resolvePreviewKind('a.xlsx'), 'xlsx')
  assert.equal(resolvePreviewKind('a.bin', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx')
  assert.equal(resolvePreviewKind('a.csv'), 'text')
  assert.equal(resolvePreviewKind('a.zip', 'application/zip'), 'unsupported')
})

test('parseFileUrl 解析文件 ID 与短时令牌', () => {
  assert.deepEqual(parseFileUrl('/api/files/42?token=abc'), { id: 42, token: 'abc' })
  assert.deepEqual(parseFileUrl('http://example.com/api/files/7'), { id: 7, token: undefined })
  assert.deepEqual(parseFileUrl(''), {})
})

test('excelColumnLabel 生成 Excel 列名', () => {
  assert.equal(excelColumnLabel(0), 'A')
  assert.equal(excelColumnLabel(25), 'Z')
  assert.equal(excelColumnLabel(26), 'AA')
  assert.equal(excelColumnLabel(51), 'AZ')
  assert.equal(excelColumnLabel(52), 'BA')
})
