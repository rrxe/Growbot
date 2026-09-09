import express, {
  type NextFunction,
  type Request,
  type Response
} from 'express'

import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  paymentsRouter
} from './routes/payments.js'

import {
  runVerificationJob
} from './jobs/verification.js'

const app = express()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

app.use(
  cors({
    origin: true,
    credentials: false
  })
)

// راوت رفع سكرين شوت مهام Join Bot يحتاج حد أعلى لحجم الـ body (صورة base64)،
// فهو مستثنى هون ويُطبَّق عليه body parser بحد أعلى داخل server/routes/tasks.ts
const SCREENSHOT_UPLOAD_PATH =
  /^\/api\/tasks\/[^/]+\/complete-with-screenshot\/?$/

app.use(
  (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (SCREENSHOT_UPLOAD_PATH.test(req.path)) {
      return next()
    }

    express.json({
      limit: '100kb'
    })(req, res, next)
  }
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
  '/api/payments',
  paymentsRouter
)

// Vercel serverless ما بيسمح بـ setInterval بالخلفية،
// فـ startJobs() بملف server/index.ts ما بينشغل أبدًا بالإنتاج.
// هاد الـ endpoint لازم يتنادى من Vercel Cron كل بضع دقايق.
app.get(
  '/api/cron/verify',
  async (
    req: Request,
    res: Response
  ) => {
    const secret =
      process.env.CRON_SECRET || ''

    const given =
      req.header('authorization') ||
      ''

    if (
      !secret ||
      given !== `Bearer ${secret}`
    ) {
      return res
        .status(401)
        .json({
          error: 'Unauthorized'
        })
    }

    try {
      await runVerificationJob()

      res.status(200).json({
        ok: true
      })
    } catch (error) {
      console.error(
        '[cron:verify]',
        error
      )

      res.status(500).json({
        ok: false
      })
    }
  }
)

app.use(
  express.static(distDir)
)

app.use(
  (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (
      req.method === 'GET' &&
      !req.path.startsWith('/api/')
    ) {
      res.sendFile(
        path.join(distDir, 'index.html')
      )

      return
    }

    next()
  }
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

    const message =
      error instanceof Error
        ? error.message
        : (error as any)?.message ||
          (error as any)?.error_description ||
          'Internal server error'

    res.status(500).json({
      error: message
    })
  }
)

export default app
