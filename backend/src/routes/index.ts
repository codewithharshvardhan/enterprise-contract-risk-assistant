import { Router } from 'express'
import healthRouter from './health.route'
import itemsRouter from './items.route'
import governanceRouter from './governance.route'
import continuousLearningRouter from './continuous-learning.route'
import contractRouter from './contract.route'
import webhookRouter from './webhook.route'

const router = Router()

router.use('/health', healthRouter)
router.use('/api/v1/items', itemsRouter)
router.use('/api/v1/governance', governanceRouter)
router.use('/api/v1/continuous-learning', continuousLearningRouter)
router.use('/api/v1/contracts', contractRouter)
router.use('/webhook', webhookRouter)

export default router
