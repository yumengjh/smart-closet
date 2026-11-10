import { request } from '../services/api'
import type { Batch, CodeView, NewBatch, Redeemed, Wallet } from './model'
const root = '/api/admin/billing'
const post = (body?: unknown, key?: string): RequestInit => ({ method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(key ? { headers: { 'Idempotency-Key': key } } : {}) })
export const billingApi = {
  wallet: () => request<Wallet>('/api/billing/wallet', { cache: 'no-store' }),
  redeem: (code: string, key: string) => request<Redeemed>('/api/billing/redeem', post({ code }, key)),
  state: () => request<{ enabled: boolean }>(`${root}/state`, { cache: 'no-store' }),
  batches: () => request<Batch[]>(`${root}/redemption-batches`, { cache: 'no-store' }),
  create: (body: NewBatch) => request<{ batch: Batch; codes: string[] }>(`${root}/redemption-batches`, post(body)),
  codes: (id: string) => request<CodeView[]>(`${root}/redemption-batches/${encodeURIComponent(id)}/codes`, { cache: 'no-store' }),
  disable: (id: string) => request<Batch>(`${root}/redemption-batches/${encodeURIComponent(id)}/disable`, post()),
  grant: (username: string, points: number, note: string, key: string) => request(`${root}/users/${encodeURIComponent(username)}/points`, post({ points, note }, key)),
}
