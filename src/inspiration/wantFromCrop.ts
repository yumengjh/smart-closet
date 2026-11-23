import { apiUrl } from '../services/urls'
import { createUuid } from '../domain/id'
import { pumpUploads, savePhoto } from '../services/quickIntake'

/**
 * “收进种草”（体验改版，用户 2026-11-23 确认）：把拆出的某一件的裁剪图当作一张衣物照片，走现有快速入柜，
 * 标为种草。照片里有人时，快速入柜会自动用 AI 整理成干净的单品图（personInterference → 增强）。
 * 只发这一件的裁剪区域，不发整张截图；由用户逐件点击才发生。
 */
export async function wantFromCrop(owner: string, cropUrl: string, name: string) {
  const response = await fetch(apiUrl(cropUrl), { credentials: 'include' })
  if (!response.ok) throw new Error('这一件的小图没有拿到，请重试。')
  const blob = await response.blob()
  const file = new File([blob], `${name || 'inspiration-item'}.png`, { type: blob.type || 'image/png' })
  await savePhoto(owner, file, 'BASE_READY', createUuid(), false, true)
  void pumpUploads(() => owner)
}
