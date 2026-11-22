// 本地界面假数据：镜头试穿的精选整套与跟着摆（server 设计 2026-11-22-镜头试穿：精选整套、动作管理与敏感检查设计 3.3、6.3）。
// 只用于本地看效果；图片是程序画的合成平铺图，不含人物，也不来自任何外部图库。规则以服务端 PresetLooks 为准。
const CATEGORIES = [['spring', '春装'], ['summer', '夏装'], ['commute', '通勤'], ['date', '约会']]
// [id, 名称, 分类, 覆盖范围, 上装色, 下装色, 鞋色, 是否未上架（只有管理员看得到）]
const LOOKS = [
  ['look-spring-1', '浅蓝衬衫配白裤', 'spring', 'FULL', '#9eb4c8', '#f1efe8', '#c9b8a3', false],
  ['look-spring-2', '燕麦针织套装', 'spring', 'FULL', '#d8c7ab', '#c9b394', '#5b4a3c', false],
  ['look-spring-3', '卡其风衣', 'spring', 'UPPER', '#b8a07a', null, null, false],
  ['look-summer-1', '白T 牛仔短裤', 'summer', 'FULL', '#f6f5f1', '#7d97b8', '#e9e4da', false],
  ['look-summer-2', '碎花半裙', 'summer', 'LOWER', null, '#e7b7b5', '#f2ede4', false],
  ['look-commute-1', '灰西装套装', 'commute', 'FULL', '#8e9196', '#7d8085', '#2b2b2b', false],
  ['look-commute-2', '藏青针织开衫', 'commute', 'UPPER', '#2f3d5c', null, null, false],
  ['look-date-1', '奶油色连衣裙', 'date', 'FULL', '#efe1c9', '#efe1c9', '#b88f73', false],
  ['look-date-2', '酒红毛衣配黑裙', 'date', 'FULL', '#7b2e3a', '#262626', '#262626', true],
]
export const lookCategories = CATEGORIES.map(([key, name]) => ({ key, name }))

/** 列表接口的返回：admin 时多出 preview 条目；category 为空时返回全部。 */
export function lookPage({ admin = false, category = '', empty = false } = {}) {
  const visible = empty ? [] : LOOKS.filter(l => admin || !l[7])
  const items = visible.filter(l => !category || l[2] === category).map(([id, name, cat, coverage, , , , preview]) => ({
    id, name, category: cat, tags: [], coverage,
    imageUrl: `/api/tryon/looks/${id}/image?v=1`, thumbUrl: `/api/tryon/looks/${id}/image?size=thumb&v=1`,
    ...(preview ? { preview: true } : {}),
  }))
  return { categories: lookCategories.filter(c => visible.some(l => l[2] === c.key)), items, total: items.length }
}
export const lookById = id => LOOKS.find(l => l[0] === id)

/** 3:4 的整套平铺示意图：上装、下装、鞋按位置摆开，配一行小字说明是本地示意。 */
export function lookSvg(id) {
  const look = lookById(id)
  if (!look) return null
  const [, name, , coverage, top, bottom, shoes] = look
  const parts = []
  if (top) parts.push(coverage === 'UPPER'
    ? `<path d="M150 210 l90 -40 q60 50 120 0 l90 40 60 110 -60 40 -30 -40 v310 h-240 v-310 l-30 40 -60 -40 Z" fill="${top}"/>`
    : `<path d="M180 120 l70 -30 q50 40 100 0 l70 30 50 90 -50 30 -25 -30 v200 h-190 v-200 l-25 30 -50 -30 Z" fill="${top}"/>`)
  if (bottom) parts.push(coverage === 'LOWER'
    ? `<path d="M200 200 h200 l70 420 h-340 Z" fill="${bottom}"/>`
    : `<path d="M215 450 h170 l20 300 h-80 l-25 -220 -25 220 h-80 Z" fill="${bottom}"/>`)
  if (shoes) parts.push(`<rect x="210" y="${coverage === 'LOWER' ? 680 : 790}" width="80" height="34" rx="16" fill="${shoes}"/><rect x="310" y="${coverage === 'LOWER' ? 680 : 790}" width="80" height="34" rx="16" fill="${shoes}"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="#f3f1ec"/>${parts.join('')}<text x="300" y="772" text-anchor="middle" font-size="22" fill="#8a877f" font-family="sans-serif">${name} · 本地示意</text></svg>`
}

/** /api/tryon/preparations 的假返回：精选只能单独试（3.4），覆盖范围映射为 LOOK_* 位置。 */
export function lookPreparation(items) {
  const looks = (items || []).filter(i => i.type === 'LOOK')
  if (looks.length && items.length > 1) return { status: 400, body: { message: '精选整套不能和其他衣服一起试' } }
  if (!looks.length) return null
  const look = lookById(looks[0].id)
  if (!look) return { status: 409, body: { code: 'TRYON_GARMENT_CHANGED', message: '这套已经更新或下架，请重新选择' } }
  const [id, name, , coverage] = look
  return { status: 200, body: { id: 'fixture-preparation', revision: 1, expiresAtMs: Date.now() + 900_000, previewUrl: `/api/tryon/looks/${id}/image?size=thumb&v=1`,
    items: [{ type: 'LOOK', id, revision: 1, assetId: id, hash: 'fixture', name, wearingRole: `LOOK_${coverage}` }] } }
}

// 跟着摆用的三个预设（关节坐标与 server 的 ootd/pose-presets.json 相同）。
export const posePresets = [
  { id: 'stand', name: '自然站立', viewAngle: 'FRONT', tags: [], source: 'PRESET', description: '', createdAt: 0,
    keypoints: { HEAD: [0.5, 0.11], NECK: [0.5, 0.2], L_SHOULDER: [0.6, 0.23], R_SHOULDER: [0.4, 0.23], L_ELBOW: [0.63, 0.38], R_ELBOW: [0.37, 0.38], L_WRIST: [0.64, 0.52], R_WRIST: [0.36, 0.52], L_HIP: [0.56, 0.52], R_HIP: [0.44, 0.52], L_KNEE: [0.565, 0.71], R_KNEE: [0.435, 0.71], L_ANKLE: [0.57, 0.9], R_ANKLE: [0.43, 0.9] } },
  { id: 'hand-on-hip', name: '单手叉腰', viewAngle: 'FRONT', tags: [], source: 'PRESET', description: '', createdAt: 0,
    keypoints: { HEAD: [0.49, 0.11], NECK: [0.5, 0.2], L_SHOULDER: [0.6, 0.23], R_SHOULDER: [0.4, 0.235], L_ELBOW: [0.74, 0.36], R_ELBOW: [0.37, 0.38], L_WRIST: [0.6, 0.47], R_WRIST: [0.36, 0.52], L_HIP: [0.56, 0.52], R_HIP: [0.44, 0.53], L_KNEE: [0.58, 0.71], R_KNEE: [0.43, 0.71], L_ANKLE: [0.6, 0.9], R_ANKLE: [0.42, 0.9] } },
  { id: 'hair-touch', name: '抬手拢发', viewAngle: 'FRONT', tags: [], source: 'PRESET', description: '', createdAt: 0,
    keypoints: { HEAD: [0.5, 0.11], NECK: [0.5, 0.2], L_SHOULDER: [0.6, 0.23], R_SHOULDER: [0.4, 0.235], L_ELBOW: [0.7, 0.16], R_ELBOW: [0.37, 0.38], L_WRIST: [0.57, 0.1], R_WRIST: [0.37, 0.52], L_HIP: [0.56, 0.52], R_HIP: [0.44, 0.52], L_KNEE: [0.56, 0.71], R_KNEE: [0.44, 0.71], L_ANKLE: [0.57, 0.9], R_ANKLE: [0.44, 0.89] } },
  // 没有关节的文字动作：不会出现在“跟着摆”里。
  { id: 'text-only', name: '文字动作', viewAngle: null, tags: [], source: 'PRESET', description: '只有文字', createdAt: 0, keypoints: {} },
]
