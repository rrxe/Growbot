import express, {
  type NextFunction,
  type Request,
  type Response
} from 'express'

import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { meRouter } from './routes/me'
import { tasksRouter } from './routes/tasks'
import { adminRouter } from './routes/admin'

const app = express()

const __filename =
  fileURLToPath(import.meta.url)

const __dirname =
  path.dirname(__filename)

const projectRoot =
  path.resolve(
    __dirname,
    '..'
  )

const distDir =
  path.join(
    projectRoot,
    'dist'
  )

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
    res.json({
      ok: true,
      service: 'growbot-api',
      time: new Date().toISOString()
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
  express.static(
    distDir
  )
)

app.get(
  '*',
  (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (
      req.path.startsWith('/api/')
    ) {
      return next(
        new Error(
          'API_ROUTE_NOT_FOUND'
        )
      )
    }

    return res.sendFile(
      path.join(
        distDir,
        'index.html'
      )
    )
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
      '[server]',
      error
    )

    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500

    const message =
      error instanceof Error
        ? error.message
        : 'Internal server error'

    res
      .status(status)
      .json({
        error: message
      })
  }
)

export default app
