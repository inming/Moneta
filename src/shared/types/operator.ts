export interface Operator {
  id: number
  name: string
  is_default: boolean
  created_at: string
}

export interface CreateOperatorDTO {
  name: string
}

export interface UpdateOperatorDTO {
  name: string
}
