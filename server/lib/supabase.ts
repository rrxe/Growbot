import {
  createClient
} from '@supabase/supabase-js'

const rawUrl =
  process.env.SUPABASE_URL || ''

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!rawUrl) {
  throw new Error(
    'SUPABASE_URL is missing'
  )
}

if (!serviceRoleKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is missing'
  )
}

let normalizedUrl: string

try {
  const parsed =
    new URL(rawUrl.trim())

  parsed.pathname =
    ''

  parsed.search =
    ''

  parsed.hash =
    ''

  normalizedUrl =
    parsed.toString().replace(
      /\/$/,
      ''
    )
} catch {
  throw new Error(
    'SUPABASE_URL is invalid'
  )
}

export const supabase =
  createClient(
    normalizedUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
