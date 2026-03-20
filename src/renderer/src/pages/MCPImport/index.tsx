import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spin, message, Alert } from 'antd'
import type { Dayjs } from 'dayjs'
import ImportConfirm, { type ImportRow } from '../../components/ImportConfirm'
import type { MCPSendTransactionsParams } from '../../../mcp/types'
import type { CreateTransactionDTO, ImportDraft } from '@shared/types'
import { useDraftStore } from '../../stores/draft.store'

export default function MCPImport(): React.JSX.Element {
  const navigate = useNavigate()
  const draftStore = useDraftStore()
  const [loading, setLoading] = useState(true)
  const [importData, setImportData] = useState<MCPSendTransactionsParams | null>(null)
  const [initialRows, setInitialRows] = useState<ImportRow[]>([])
  const [showDraftOverwriteAlert, setShowDraftOverwriteAlert] = useState(false)
  const hasCheckedDraftRef = useRef(false)
  const importedRef = useRef(false)

  // 从草稿加载数据
  const loadFromDraft = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[MCPImport] Trying to load from draft...')
      const draft: ImportDraft | undefined = await draftStore.getDraft()
      
      if (!draft || draft.source !== 'mcp') {
        console.log('[MCPImport] No MCP draft found')
        return false
      }

      console.log('[MCPImport] Loading from draft:', draft)
      
      // 从草稿构建导入数据
      const source = draft.data.mcpSpecific?.source || 'MCP 导入草稿'
      setImportData({
        transactions: draft.data.transactions.map(t => ({
          date: t.date,
          type: t.type,
          amount: t.amount ?? 0,
          category_id: t.category_id ?? undefined,
          description: t.description,
          operator_id: t.operator_id ?? undefined
        })),
        source
      })
      
      // 转换为表格行数据
      const rows: ImportRow[] = draft.data.transactions.map((tx) => ({
        key: tx.key,
        type: tx.type,
        amount: tx.amount ?? 0,
        category_id: tx.category_id,
        description: tx.description,
        operator_id: tx.operator_id
      }))
      
      setInitialRows(rows)
      // 不显示提示，用户主动点击继续导入，无需额外提示
      return true
    } catch (err) {
      console.error('[MCPImport] Failed to load from draft:', err)
      return false
    }
  }, [draftStore])

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

      // 检查是否覆盖了旧草稿（只检查一次，避免 ImportConfirm 创建草稿后误判）
      if (!hasCheckedDraftRef.current) {
        const summary = await window.api.draft.getSummary()
        console.log('[MCPImport] Draft check:', summary)
        if (summary.exists) {
          console.log('[MCPImport] Showing overwrite alert, old draft count:', summary.count)
          setShowDraftOverwriteAlert(true)
        }
        hasCheckedDraftRef.current = true
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
  }, [navigate, draftStore.summary])

  useEffect(() => {
    // 首先尝试立即加载 MCP 数据
    loadImportData().then((success) => {
      if (!success) {
        // MCP 没有数据，尝试从草稿加载
        loadFromDraft().then((draftLoaded) => {
          if (draftLoaded) {
            setLoading(false)
          } else {
            // 草稿也没有，可能是数据还没设置好，开始轮询
            console.log('[MCPImport] No draft found, starting poll...')
            let attempts = 0
            const maxAttempts = 10
            const interval = setInterval(async () => {
              // 如果已经导入成功，停止轮询
              if (importedRef.current) {
                clearInterval(interval)
                return
              }
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
      }
    })
  }, [loadImportData, loadFromDraft, navigate])

  // 确认导入
  const handleConfirm = async (rows: ImportRow[], accountingDate: Dayjs) => {
    // 标记已导入，阻止轮询
    importedRef.current = true
    
    const dateStr = accountingDate.format('YYYY-MM-DD')
    const items: CreateTransactionDTO[] = rows.map((row) => ({
      date: dateStr,
      type: row.type,
      amount: row.amount,
      category_id: row.category_id!,
      description: row.description || '',
      operator_id: row.operator_id
    }))

    // 判断是从 MCP 还是草稿导入
    const mcpData = await window.api.mcp.getImportData()
    if (mcpData) {
      // 从 MCP 导入
      const result = await window.api.mcp.confirmImport(items)
      if (!result.success) {
        throw new Error(result.error || '导入失败')
      }
      // 清除导入数据
      await window.api.mcp.clearImportData()
    } else {
      // 从草稿导入，直接创建交易
      await window.api.transaction.batchCreate(items)
    }
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
      {showDraftOverwriteAlert && (
        <Alert
          message={`已开始新的导入，之前的草稿（${draftStore.summary.count}条）已被替换`}
          type="info"
          showIcon
          closable
          onClose={() => setShowDraftOverwriteAlert(false)}
          style={{ marginBottom: 16 }}
        />
      )}
      <ImportConfirm
        title="MCP 账单导入确认"
        sourceInfo={importData?.source}
        initialRows={initialRows}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        draftSource="mcp"
        mcpSource={importData?.source}
      />
    </div>
  )
}
