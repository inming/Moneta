import { describe, expect, it } from 'vitest'
import { buildCsvBytes, buildXlsxBytes, parseExcelBytes, type ExportRowData } from './excel'

const sampleRows: ExportRowData[] = [
  {
    date: '2025-01-15',
    type: 'expense',
    amount: 123.45,
    category_name: '餐饮',
    description: '午饭, 含"饮料"',
    operator_name: '张三',
    created_at: '2025-01-15 12:30:00',
    is_occasional: 1
  },
  {
    date: '2025-02-01',
    type: 'income',
    amount: 8000,
    category_name: '工资',
    description: '',
    operator_name: '',
    created_at: '2025-02-01 09:00:00',
    is_occasional: 0
  }
]

describe('excel 导入导出往返', () => {
  it('xlsx 导出后可被解析回等价数据（新旧版同一实现，互通）', () => {
    const bytes = buildXlsxBytes(sampleRows)
    const preview = parseExcelBytes(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    )

    expect(preview.errors).toEqual([])
    expect(preview.rowCount).toBe(2)

    const [r1, r2] = preview.rows
    expect(r1).toMatchObject({
      date: '2025-01-15',
      type: 'expense',
      amount: 123.45,
      categoryName: '餐饮',
      description: '午饭, 含"饮料"',
      operatorName: '张三',
      createdAt: '2025-01-15 12:30:00',
      isOccasional: true
    })
    expect(r2).toMatchObject({
      date: '2025-02-01',
      type: 'income',
      amount: 8000,
      categoryName: '工资',
      operatorName: '',
      isOccasional: false
    })

    expect(preview.uniqueOperators).toEqual(['张三'])
    expect(preview.uniqueCategories).toEqual(
      expect.arrayContaining([
        { name: '餐饮', type: 'expense' },
        { name: '工资', type: 'income' }
      ])
    )
  })

  it('csv 导出含 UTF-8 BOM、CRLF 与正确转义', () => {
    const bytes = buildCsvBytes(sampleRows)
    // BOM: EF BB BF
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes.slice(3))
    const lines = text.split('\r\n')
    expect(lines[0]).toBe('日期,类型,金额,分组,描述,操作人,添加时间,偶发交易')
    expect(lines[1]).toContain('"午饭, 含""饮料"""')
    expect(lines[1]).toContain('消费')
    expect(lines[2]).toContain('收入')
  })

  it('无效行被跳过并记录错误', () => {
    const bad: ExportRowData[] = [
      { ...sampleRows[0], date: 'not-a-date' },
      sampleRows[1]
    ]
    const bytes = buildXlsxBytes(bad)
    const preview = parseExcelBytes(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    )
    expect(preview.rowCount).toBe(1)
    expect(preview.errors).toHaveLength(1)
    expect(preview.errors[0]).toContain('日期格式无效')
  })
})
