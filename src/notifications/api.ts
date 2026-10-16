import { request, usingMocks } from '../services/api'

/** In-site notifications (server: /api/notifications; design 模型内存与图像向量 §8.2). Written by the server, shown as is. */
export type NotificationKind = 'DUPLICATE' | 'DUPLICATE_SUMMARY' | 'DUPLICATE_SCAN' | string
export type ClosetNotification = { id: string; kind: NotificationKind; title: string; body: string; href: string | null; payload: Record<string, unknown>; createdAt: number; read: boolean }
export type NotificationList = { items: ClosetNotification[]; unread: number }

export const notificationApi = {
  list: (limit = 20) => usingMocks ? Promise.resolve<NotificationList>({ items: [], unread: 0 }) : request<NotificationList>(`/api/notifications?limit=${limit}`),
  read: (id: string) => request<{ unread: number }>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  readAll: () => request<{ unread: number }>('/api/notifications/read-all', { method: 'POST' }),
  remove: (id: string) => request<{ unread: number }>(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  removeAll: () => request<{ unread: number }>('/api/notifications', { method: 'DELETE' }),
}
