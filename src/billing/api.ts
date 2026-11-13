import { request } from '../services/api'
import type { Batch, CodeView, CreatedOrder, NewBatch, OrderView, Product, Quote, Redeemed, Wallet } from './model'
const root = '/api/admin/billing'
const post = (body?: unknown, key?: string): RequestInit => ({ method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(key ? { headers: { 'Idempotency-Key': key } } : {}) })
export const billingApi = {
  quote: (tier: 'image.standard' | 'tryon.realtime') => request<Quote>(`/api/billing/quote?tier=${tier}`, { cache: 'no-store' }),
  wallet: () => request<Wallet>('/api/billing/wallet', { cache: 'no-store' }),
  redeem: (code: string, key: string) => request<Redeemed>('/api/billing/redeem', post({ code }, key)),
  products: () => request<Product[]>('/api/billing/products', { cache: 'no-store' }),
  order: (productId: string, key: string) => request<CreatedOrder>('/api/billing/orders', post({ productId }, key)),
  orders: () => request<OrderView[]>('/api/billing/orders', { cache: 'no-store' }),
  sandboxPay: (id: string) => request<OrderView>(`/api/billing/orders/${encodeURIComponent(id)}/sandbox-pay`, post()),
  state: () => request<{ enabled: boolean }>(`${root}/state`, { cache: 'no-store' }),
  batches: () => request<Batch[]>(`${root}/redemption-batches`, { cache: 'no-store' }),
  create: (body: NewBatch) => request<{ batch: Batch; codes: string[] }>(`${root}/redemption-batches`, post(body)),
  codes: (id: string) => request<CodeView[]>(`${root}/redemption-batches/${encodeURIComponent(id)}/codes`, { cache: 'no-store' }),
  disable: (id: string) => request<Batch>(`${root}/redemption-batches/${encodeURIComponent(id)}/disable`, post()),
  grant: (username: string, points: number, note: string, key: string) => request(`${root}/users/${encodeURIComponent(username)}/points`, post({ points, note }, key)),
}
