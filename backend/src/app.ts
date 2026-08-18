import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'

import config from './config'
import router from './routes'
import { notFound } from './middleware/notFound'
import { errorHandler } from './middleware/errorHandler'

const app = express()

app.use(helmet())
// In development (preview), reflect any requesting origin so the dynamic preview
// domain (e.g. staging.zbrain.ai:<PORT>) is never rejected. In production, restrict
// to the explicitly configured CORS_ORIGINS list.
app.use(cors({
  origin: config.nodeEnv === 'production' ? config.corsOrigins : true,
  credentials: true,
}))
app.use(express.json())
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))

app.use('/', router)

app.use(notFound)
app.use(errorHandler)

export default app
