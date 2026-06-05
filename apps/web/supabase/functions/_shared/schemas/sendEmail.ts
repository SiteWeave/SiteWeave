import { z } from 'https://esm.sh/zod@3.23.8'

export const sendEmailBodySchema = z.object({
  to: z.union([z.string().email().max(254), z.array(z.string().email().max(254)).max(10)]),
  subject: z.string().min(1).max(200),
  html: z.string().max(50_000).optional(),
  text: z.string().max(50_000).optional(),
}).refine((v) => Boolean(v.html || v.text), { message: 'html or text required' })

export function parseSendEmailBody(raw: unknown) {
  return sendEmailBodySchema.safeParse(raw)
}
