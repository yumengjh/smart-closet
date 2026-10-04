import { createApiUrls } from '../domain/api-url'

export const { apiUrl, mediaUrl, isApiMedia } = createApiUrls(import.meta.env.VITE_API_BASE_URL || '')
