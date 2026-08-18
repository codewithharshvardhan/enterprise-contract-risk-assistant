import type { Request, Response } from 'express'
import { itemsService } from '../services/items.service'
import type { CreateItemDto, UpdateItemDto } from '../types'

export function listItems(_req: Request, res: Response): void {
  res.json(itemsService.list())
}

export function getItem(req: Request<{ id: string }>, res: Response): void {
  const item = itemsService.get(req.params.id)
  if (!item) {
    res.status(404).json({ message: 'Item not found' })
    return
  }
  res.json(item)
}

export function createItem(req: Request<object, object, CreateItemDto>, res: Response): void {
  const { name, description } = req.body
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ message: 'name is required' })
    return
  }
  const item = itemsService.create({ name: name.trim(), description: description ?? '' })
  res.status(201).json(item)
}

export function updateItem(
  req: Request<{ id: string }, object, UpdateItemDto>,
  res: Response,
): void {
  const item = itemsService.update(req.params.id, req.body)
  if (!item) {
    res.status(404).json({ message: 'Item not found' })
    return
  }
  res.json(item)
}

export function deleteItem(req: Request<{ id: string }>, res: Response): void {
  const deleted = itemsService.delete(req.params.id)
  if (!deleted) {
    res.status(404).json({ message: 'Item not found' })
    return
  }
  res.status(204).send()
}
