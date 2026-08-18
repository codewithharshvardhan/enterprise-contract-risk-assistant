import type { Request, Response } from 'express'
import { governanceService } from '../services/governance.service'

export function getOverview(_req: Request, res: Response): void {
  res.json(governanceService.getOverview())
}

export function getAudit(_req: Request, res: Response): void {
  res.json(governanceService.getAudit())
}

export function getFleet(_req: Request, res: Response): void {
  res.json(governanceService.getFleet())
}

export function getPolicies(_req: Request, res: Response): void {
  res.json(governanceService.getPolicies())
}

export function getCompliance(_req: Request, res: Response): void {
  res.json(governanceService.getCompliance())
}

export function getSlo(_req: Request, res: Response): void {
  res.json(governanceService.getSlo())
}
