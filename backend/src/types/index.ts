export interface Item {
  id: string
  name: string
  description: string
  createdAt: string
}

export interface CreateItemDto {
  name: string
  description?: string
}

export interface UpdateItemDto {
  name?: string
  description?: string
}

export interface HealthResponse {
  status: string
  timestamp: string
}

export interface ErrorResponse {
  message: string
}
