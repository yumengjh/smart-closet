import { PlatformRequestError } from '../services/platform'
import type { Quote } from './model'

export function imageErrorMessage(cause: unknown) {
  if (cause instanceof PlatformRequestError && cause.code === 'IMAGE_QUOTA_EXCEEDED' && cause.message.includes('已用完')) return '今天的图片次数已用完。'
  return cause instanceof Error ? cause.message : String(cause)
}

export async function offerImagePurchase(billing: { image?: Quote; refresh(): Promise<void>; purchase: string }, cause: unknown) {
  if (!(cause instanceof PlatformRequestError) || !['IMAGE_QUOTA_EXCEEDED', 'AI_DAILY_QUOTA_EXCEEDED'].includes(cause.code || '')) return false
  await billing.refresh()
  if (!billing.image?.enabled || (cause.code === 'IMAGE_QUOTA_EXCEEDED' && !cause.message.includes('已用完') && billing.image.freeRemainingToday > 0)) return false
  billing.purchase = 'image'
  return true
}
