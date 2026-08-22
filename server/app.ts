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

import {
  runVerificationJob
} from './jobs/verification.js'

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
