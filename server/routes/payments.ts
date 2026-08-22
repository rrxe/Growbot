import {
  Router
} from 'express'

import {
  authMiddleware
} from '../lib/auth.js'

import {
  getSettings
} from '../lib/settings.js'

import {
  supabase
} from '../lib/supabase.js'

const router =
  Router()

const PACKAGES = [
  {
    stars: 10,
    pointsMultiplier: 10
  },
  {
    stars: 50,
    pointsMultiplier: 10
  },
  {
    stars: 100,
    pointsMultiplier: 10
  },
  {
    stars: 250,
    pointsMultiplier: 10
  },
  {
    stars: 500,
    pointsMultiplier: 10
  }
]

router.post(
  '/stars/invoice',
  authMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const stars =
        Number(
          req.body?.stars
        )

      const selected =
        PACKAGES.find(
          item =>
            item.stars ===
            stars
        )

      if (!selected) {
        return res
          .status(400)
          .json({
            error:
              'الباقة غير متاحة.'
          })
      }

      const token =
        process.env.BOT_TOKEN ||
        ''

      if (!token) {
        throw new Error(
          'BOT_TOKEN is missing'
        )
      }

      const points =
        selected.stars *
        selected.pointsMultiplier

      const payload =
        `gb_${cryptoRandom()}`

      const {
        error: insertError
      } = await supabase
        .from('purchases')
        .insert({
          user_id:
            req.dbUser.id,

          usd_amount:
            0,

          stars_amount:
            selected.stars,

          points_amount:
            points,

          provider:
            'telegram_stars',

          status:
            'pending',

          invoice_payload:
            payload
        })

      if (insertError) {
        throw insertError
      }

      const telegramResponse =
        await fetch(
          `https://api.telegram.org/bot${token}/createInvoiceLink`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json'
            },

            body:
              JSON.stringify({
                title:
                  `${points} نقطة`,

                description:
                  `شراء ${points} نقطة داخل GrowBot`,

                payload,

                currency:
                  'XTR',

                prices: [
                  {
                    label:
                      `${points} نقطة`,
                    amount:
                      selected.stars
                  }
                ]
              })
          }
        )

      const result =
        await telegramResponse.json() as {
          ok: boolean
          result?: string
          description?: string
        }

      if (
        !result.ok ||
        !result.result
      ) {
        await supabase
          .from(
            'purchases'
          )
          .update({
            status:
              'failed'
          })
          .eq(
            'invoice_payload',
            payload
          )

        throw new Error(
          result.description ||
          'تعذر إنشاء فاتورة Stars.'
        )
      }

      res.json({
        invoiceUrl:
          result.result,

        points,

        stars:
          selected.stars
      })
    } catch (error) {
      next(error)
    }
  }
)


function cryptoRandom() {
  return `${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 12)}`
}

export {
  router as paymentsRouter
}
