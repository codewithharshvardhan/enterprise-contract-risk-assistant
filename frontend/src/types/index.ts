export interface Item {
  id: string
  name: string
  description: string
  createdAt: string
}

export interface ApiError {
  detail: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
