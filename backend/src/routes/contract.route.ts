import { Router } from 'express'
import multer, { MulterError } from 'multer'
import {
  analyzeContract,
  analyzeContractFile,
  listExecutions,
  getExecution,
  submitFeedback,
  getReview,
  updateReviewMetadata,
  setRiskDecision,
  addReviewComment,
  setFinalDecision,
} from '../controllers/contract.controller'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
})

router.post('/analyze', analyzeContract)
router.post('/analyze-file', (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof MulterError ? `Upload error: ${err.message}` : err instanceof Error ? err.message : 'Upload failed'
      res.status(400).json({ error: message })
      return
    }
    next()
  })
}, analyzeContractFile)
router.get('/executions', listExecutions)
router.get('/executions/:id', getExecution)
router.post('/feedback', submitFeedback)
router.get('/:id/review', getReview)
router.patch('/:id/review/metadata', updateReviewMetadata)
router.post('/:id/review/risk-decision', setRiskDecision)
router.post('/:id/review/comment', addReviewComment)
router.post('/:id/review/decision', setFinalDecision)

export default router
