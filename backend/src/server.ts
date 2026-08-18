import app from './app'
import config from './config'
import { startScheduler } from './services/cl-engine/runtime'

app.listen(config.port, () => {
  console.error(`Server running on port ${config.port} [${config.nodeEnv}]`)
  // Drive the Continuous Learning loop in the background (evaluate targets →
  // detect drift → propose remedies → reconcile promotions). On-demand passes
  // are also available via POST /api/v1/continuous-learning/baselines/evaluate.
  startScheduler()
})
