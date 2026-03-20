import { create } from 'zustand'
import type { DraftSummary, ImportDraft } from '../../../shared/types'

interface DraftState {
  /** 草稿摘要 */
  summary: DraftSummary
  /** 是否正在加载 */
  loading: boolean
  /** 初始化草稿摘要 */
  initialize: () => Promise<void>
  /** 刷新草稿摘要 */
  refreshSummary: () => Promise<void>
  /** 保存草稿 */
  saveDraft: (draft: ImportDraft) => Promise<void>
  /** 删除草稿 */
  deleteDraft: () => Promise<void>
  /** 获取完整草稿 */
  getDraft: () => Promise<ImportDraft | undefined>
}

export const useDraftStore = create<DraftState>((set) => ({
  summary: { exists: false, count: 0, missingCategoryCount: 0 },
  loading: false,

  initialize: async (): Promise<void> => {
    const summary = await window.api.draft.getSummary()
    set({ summary })
  },

  refreshSummary: async (): Promise<void> => {
    const summary = await window.api.draft.getSummary()
    set({ summary })
  },

  saveDraft: async (draft: ImportDraft): Promise<void> => {
    await window.api.draft.save({
      source: draft.source,
      data: draft.data
    })
    // 保存后刷新摘要
    const summary = await window.api.draft.getSummary()
    set({ summary })
  },

  deleteDraft: async (): Promise<void> => {
    await window.api.draft.delete()
    set({ summary: { exists: false, count: 0, missingCategoryCount: 0 } })
  },

  getDraft: async (): Promise<ImportDraft | undefined> => {
    return await window.api.draft.get()
  }
}))
