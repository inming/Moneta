import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spin, message } from 'antd'
import type { Dayjs } from 'dayjs'
import ImportConfirm, { type ImportRow } from '../../components/ImportConfirm'
import type { MCPSendTransactionsParams } from '../../../mcp/types'
import type { CreateTransactionDTO } from '@shared/types'

export default function MCPImport(): React.JSX.Element {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [importData, setImportData] = useState<MCPSendTransactionsParams | null>(null)
  const [initialRows, setInitialRows] = useState<ImportRow[]>([])

  // 加载导入数据（支持轮询）
  const loadImportData = useCallback(async (isPoll = false): Promise<boolean> => {
    try {
      if (!isPoll) {
        console.log('[MCPImport] Loading import data...')
      }
      const data = await window.api.mcp.getImportData()
      console.log('[MCPImport] Got import data:', data)
      if (!data) {
        return false
      }

      setImportData(data)
      
      // 转换为表格行数据
      const rows: ImportRow[] = data.transactions.map((tx, index) => ({
        key: `mcp-${index}-${Date.now()}`,
        type: tx.type,
        amount: tx.amount,
        category_id: tx.category_id ?? null,
        description: tx.description,
        operator_id: tx.operator_id ?? null
      }))
      
      setInitialRows(rows)
      return true
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载导入数据失败')
      navigate('/')
      return false
    } finally {
      if (!isPoll) {
        setLoading(false)
      }
    }
  }, [navigate])

  useEffect(() => {
    // 首先尝试立即加载
    loadImportData().then((success) => {
      if (!success) {
        // 如果立即加载失败，可能是数据还没设置好，开始轮询
        console.log('[MCPImport] Immediate load failed, starting poll...')
        let attempts = 0
        const maxAttempts = 10
        const interval = setInterval(async () => {
          attempts++
          console.log(`[MCPImport] Polling attempt ${attempts}...`)
          const result = await loadImportData(true)
          if (result || attempts >= maxAttempts) {
            clearInterval(interval)
            if (!result && attempts >= maxAttempts) {
              message.error('没有待导入的数据')
              navigate('/')
            }
          }
        }, 300)
        
        // 清理函数
        return () => clearInterval(interval)
      }
    })
  }, [loadImportData, navigate])

  // 确认导入
  const handleConfirm = async (rows: ImportRow[], accountingDate: Dayjs) => {
    const dateStr = accountingDate.format('YYYY-MM-DD')
    const items: CreateTransactionDTO[] = rows.map((row) => ({
      date: dateStr,
      type: row.type,
      amount: row.amount,
      category_id: row.category_id!,
      description: row.description || '',
      operator_id: row.operator_id
    }))

    const result = await window.api.mcp.confirmImport(items)
    if (!result.success) {
      throw new Error(result.error || '导入失败')
    }
    // 清除导入数据
    await window.api.mcp.clearImportData()
  }

  // 取消
  const handleCancel = () => {
    navigate('/')
  }

  if (loading || initialRows.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spin size="large" />
        <p style={{ marginTop: 16 }}>加载导入数据...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <ImportConfirm
        title="MCP 账单导入确认"
        sourceInfo={importData?.source}
        initialRows={initialRows}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  )
}
