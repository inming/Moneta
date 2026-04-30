/**
 * 导入草稿类型定义
 * 用于 MCP 导入的自动保存功能
 */

/** 草稿来源类型 */
export type DraftSource = 'mcp'

/** 待导入交易条目（草稿用） */
export interface DraftTransaction {
  key: string
  date: string
  type: 'expense' | 'income' | 'investment'
  amount: number | null
  category_id: number | null
  description: string
  operator_id: number | null
}

/** MCP 导入草稿特有数据 */
export interface MCPDraftSpecific {
  /** 数据来源描述 */
  source: string
}

/** 草稿数据结构 */
export interface DraftData {
  /** 待导入交易记录数组 */
  transactions: DraftTransaction[]
  /** 当前选中的操作人 ID */
  operatorId: number | null
  /** MCP 导入特有数据 */
  mcpSpecific?: MCPDraftSpecific
}

/** 导入草稿完整结构 */
export interface ImportDraft {
  /** 固定值 'current' */
  id: 'current'
  /** 草稿来源 */
  source: DraftSource
  /** 草稿数据 */
  data: DraftData
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/** 创建/更新草稿请求 */
export interface SaveDraftDTO {
  source: DraftSource
  data: DraftData
}

/** 草稿摘要信息（用于列表/提示显示） */
export interface DraftSummary {
  /** 是否存在草稿 */
  exists: boolean
  /** 草稿来源 */
  source?: DraftSource
  /** 交易条数 */
  count: number
  /** 待补充分类的条数 */
  missingCategoryCount: number
  /** 创建时间 */
  createdAt?: string
  /** 最后更新时间 */
  updatedAt?: string
}
