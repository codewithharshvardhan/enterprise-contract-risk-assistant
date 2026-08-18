import type { ErrorRequestHandler } from 'express'

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status: number = (err as { status?: number }).status ?? 500
  const message: string = (err as { message?: string }).message ?? 'Internal Server Error'
  res.status(status).json({ message })
}
