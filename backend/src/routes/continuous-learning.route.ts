import { Router } from 'express'
import {
  getOverview,
  getBaselines,
  createBaseline,
  updateBaseline,
  deleteBaseline,
  inferBaselines_,
  runDetector,
  getFeedback,
  captureFeedback,
  captureTrace,
  getDriftAlerts,
  getOpportunities,
  acceptOpportunity,
  decideOpportunity_,
  getExperiments,
  backtestExperimentHandler,
  retireExperimentHandler,
  recordShadowHandler,
  reconcilePromotions,
  getPromoted,
  getTimelines,
  getConfig,
  promote,
  rollback,
} from '../controllers/continuous-learning.controller'

const router = Router()

// Read model — the five-stage workspace.
router.get('/overview', getOverview)

// Quality targets (baselines) — operator-defined, editable; numbers inferred from data.
router.get('/baselines', getBaselines)
router.post('/baselines', createBaseline)
router.post('/baselines/infer', inferBaselines_)
router.post('/baselines/evaluate', runDetector)
router.put('/baselines/:id', updateBaseline)
router.delete('/baselines/:id', deleteBaseline)

router.get('/feedback', getFeedback)
router.post('/feedback', captureFeedback)
router.post('/traces', captureTrace)
router.get('/drift-alerts', getDriftAlerts)
router.get('/opportunities', getOpportunities)
router.post('/opportunities/:id/accept', acceptOpportunity)
router.post('/opportunities/:id/decide', decideOpportunity_)
router.get('/experiments', getExperiments)
router.post('/experiments/:id/backtest', backtestExperimentHandler)
router.post('/experiments/:id/retire', retireExperimentHandler)
router.post('/shadow', recordShadowHandler)
router.get('/promoted', getPromoted)
router.post('/promotions/reconcile', reconcilePromotions)
router.get('/timelines', getTimelines)

// Loop D — operator-tunable agent config.
router.get('/config', getConfig)
router.post('/promote', promote)
router.post('/rollback', rollback)

export default router
