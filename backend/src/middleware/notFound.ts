import type { Request, Response } from 'express'

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` })
}
