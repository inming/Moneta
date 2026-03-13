import type { TransactionType } from './transaction'

export interface AIRecognizedItem {
  amount: number
  description: string
  type: TransactionType
  suggestedCategory: string | null
}

export interface RecognitionResultRow {
  key: string
  type: TransactionType
  amount: number
  description: string
  category_id: number | null
  operator_id: number | null
}

export interface RecognizeRequest {
  images: string[]
  providerId?: string
}

export interface RecognizeResponse {
  items: RecognitionResultRow[]
  warnings: string[]
}
