import { Router } from 'express'
import {
  getOverview,
  getAudit,
  getFleet,
  getPolicies,
  getCompliance,
  getSlo,
} from '../controllers/governance.controller'

const router = Router()

router.get('/overview', getOverview)
router.get('/audit', getAudit)
router.get('/fleet', getFleet)
router.get('/policies', getPolicies)
router.get('/compliance', getCompliance)
router.get('/slo', getSlo)

export default router
