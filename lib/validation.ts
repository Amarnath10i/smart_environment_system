import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PAYMENT_METHOD_IDS } from '@/lib/payments'

/**
 * Identity fields (userId, creatorId) are deliberately absent from every
 * schema below. They are read from the caller's token, never from the body —
 * see lib/api-auth.ts.
 */

export const registerSchema = z.object({
  email: z.string().email('A valid email is required').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name: z.string().trim().min(1).max(80).optional(),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
})

export const campaignSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().trim().min(1).max(5000),
})

export const groupSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(80),
  issue: z.string().trim().min(1).max(120),
})

export const messageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(2000),
  groupId: z.coerce.number().int().positive(),
})

/** groupId is required: without it the endpoint used to dump every group's chat. */
export const messageQuerySchema = z.object({
  groupId: z.coerce.number().int().positive(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const fundraiserSchema = z.object({
  cause: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(5000),
  goal: z.coerce.number().positive('Goal must be greater than zero').max(10_000_000),
})

export const donationSchema = z.object({
  fundraiserId: z.coerce.number().int().positive(),
  amount: z.coerce
    .number()
    .positive('Donation amount must be greater than zero')
    .max(1_000_000),
  // Derived from lib/payments.ts rather than restated here: a hand-written
  // enum drifted from the picker and rejected every real donation.
  method: z.enum(PAYMENT_METHOD_IDS),
})

/** Join routes take only the target id — the joiner is the authenticated caller. */
export const joinGroupSchema = z.object({
  groupId: z.coerce.number().int().positive(),
})

export const joinCampaignSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
})

export const sensorDataSchema = z.object({
  sensorId: z.coerce.number().int().positive(),
  value: z.coerce.number().finite(),
})

export const sensorSchema = z.object({
  type: z.enum(['temperature', 'humidity', 'air_quality', 'noise']),
  location: z.string().trim().min(1).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  status: z.enum(['active', 'inactive', 'maintenance']).default('active'),
})

/** How many readings per sensor the dashboard charts should receive. */
export const sensorQuerySchema = z.object({
  history: z.coerce.number().int().min(1).max(100).default(24),
})

export const alertSchema = z.object({
  type: z.enum(['info', 'warning', 'critical']),
  message: z.string().trim().min(1).max(500),
  sensorId: z.coerce.number().int().positive().optional(),
})

/** Cursor-free page/limit paging shared by the list endpoints. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type Paginated<T> = {
  items: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

/**
 * Parses a request body against `schema`. Returns either the typed data or a
 * ready-to-return 400 listing every field that failed, so callers can do:
 *
 *   const parsed = await parseBody(request, campaignSchema)
 *   if (!parsed.ok) return parsed.response
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 }) }
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Validation failed', fields: flattenIssues(result.error) },
        { status: 400 },
      ),
    }
  }
  return { ok: true, data: result.data }
}

/** Same as parseBody but for querystrings. */
export function parseQuery<T extends z.ZodTypeAny>(
  url: string,
  schema: T,
): { ok: true; data: z.infer<T> } | { ok: false; response: NextResponse } {
  const params = Object.fromEntries(new URL(url).searchParams)
  const result = schema.safeParse(params)
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid query parameters', fields: flattenIssues(result.error) },
        { status: 400 },
      ),
    }
  }
  return { ok: true, data: result.data }
}

function flattenIssues(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    if (!fields[key]) fields[key] = issue.message
  }
  return fields
}
