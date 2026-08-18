import { randomUUID } from 'crypto'
import type { Item, CreateItemDto, UpdateItemDto } from '../types'

class ItemsService {
  private store: Map<string, Item> = new Map()

  list(): Item[] {
    return Array.from(this.store.values())
  }

  get(id: string): Item | undefined {
    return this.store.get(id)
  }

  create(dto: CreateItemDto): Item {
    const item: Item = {
      id: randomUUID(),
      name: dto.name,
      description: dto.description ?? '',
      createdAt: new Date().toISOString(),
    }
    this.store.set(item.id, item)
    return item
  }

  update(id: string, dto: UpdateItemDto): Item | undefined {
    const existing = this.store.get(id)
    if (!existing) return undefined
    const updated: Item = {
      ...existing,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    }
    this.store.set(id, updated)
    return updated
  }

  delete(id: string): boolean {
    return this.store.delete(id)
  }
}

export const itemsService = new ItemsService()
