import { request } from './api'
import type { StyleCoverItem } from '../onboarding/welcome'

/** 首次体验用到的接口（预设衣物管理与引导封面设计 3.4）。封面只给引导页展示，失败时调用方回到原来的拼图或文字。 */
export const onboardingApi = {
  styleCovers: () => request<{ items: StyleCoverItem[] }>('/api/onboarding/style-covers'),
}
