import type { TransactionType } from './transaction'

export interface Category {
  id: number
  name: string
  type: TransactionType
  icon: string | null
  description: string
  sort_order: number
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateCategoryDTO {
  name: string
  type: TransactionType
  icon?: string
  description?: string
  sort_order?: number
}

export interface UpdateCategoryDTO {
  name?: string
  icon?: string
  description?: string
  sort_order?: number
  is_active?: boolean
}
