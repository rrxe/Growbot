import express, {
  type NextFunction,
  type Request,
  type Response
} from 'express'

import cors from 'cors'

import {
  meRouter
} from './routes/me.js'

import {
  tasksRouter
} from './routes/tasks.js'

import {
  adminRouter
} from './routes/admin.js'

import {
  adsRouter
} from './routes/ads.js'

import {
  paymentsRouter
} from './routes/payments.js'

const app = express()

app.use(
  cors({
    origin: true,
    credentials: false
  })
)

app.use(
  express.json({
    limit: '100kb'
  })
)

app.get(
  '/api/health',
  (
    _req: Request,
    res: Response
  ) => {
    res.status(200).json({
      ok: true,
      service: 'growbot-api'
    })
  }
)

app.use(
  '/api/me',
  meRouter
)

app.use(
  '/api/tasks',
  tasksRouter
)

app.use(
  '/api/admin',
  adminRouter
)

app.use(
  '/api/ads',
  adsRouter
)

app.use(
  '/api/payments',
  paymentsRouter
)

app.use(
  (
    _req: Request,
    res: Response
  ) => {
    res.status(404).json({
      error: 'API route not found'
    })
  }
)

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(
      '[growbot-api]',
      error
    )

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Internal server error'
    })
  }
)

export default app
