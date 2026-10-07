import { createUuid } from '../domain/id'
import { apiUrl } from './urls'
import { normalizeScene, sceneWrite } from '../domain/outfit'
import personCatalog from '../domain/person-stickers.json'
import type { PersonCatalog } from '../domain/person-stickers'
import type { MetadataField } from '../domain/metadata'
import type { Outfit, OutfitScene } from '../domain/outfit'
export type ClosetStatus = 'DRAFT' | 'ACTIVE' | 'TRASHED'
export type ImageProcessing = { jobId: string; status: string; stickerRequired: boolean; stickerReady: boolean; stickerAssetId: string | null }
export type TransparencyReport = { verdict: string; hasAlpha: boolean; transparentRatio: number; reasons: string[] }
export type GarmentTarget = { description: string; worn: boolean; bounds: { x: number; y: number; width: number; height: number } }
export type Garment = {
  name?: string | null
  favorite?: boolean
  id: string
  revision: number
  sourceAssetId: string
  displayAssetId: string
  status: ClosetStatus
  updatedAt: string
  displayUrl: string
  sourceUrl: string
  category: string[]
  automatic: Record<string, string[]>
  metadataEvidence?: Record<string, { status?: string; evidence?: string }>
  overrides: Record<string, string[]>
  primaryColor: string[]
  secondaryColors: string[]
  patterns: string[]
  neckline: string[]
  sleeveLength: string[]
  garmentLength: string[]
  closure: string[]
  fit?: string[]
  thickness?: string[]
  wearingModes?: string[]
  texture: string[]
  styles: string[]
  seasons: string[]
  brand: string[]
  size: string[]
  materialComposition: string[]
  careInstructions: string[]
  visibleText: string[]
  sourceOrigin: 'USER_UPLOAD' | 'GENERATED' | 'UNKNOWN'
  imageProcessing?: ImageProcessing | null
  assessment?: string
  target?: GarmentTarget | null
  issues?: { message: string }[]
  reviewMessage?: string
  imageColor: string
  taskStatus?: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'NEEDS_REVIEW' | 'FAILED' | 'UNKNOWN' | 'CANCEL_REQUESTED' | 'CANCELLED'
  taskId?: string
  restoreStatus?: 'ACTIVE' | 'DRAFT'
  images: { id: string; url: string; kind: string; reviewStatus: string; aiGenerated?: boolean }[]
}

export type TaskStep = { name: string; type?: string; status: 'completed' | 'running' | 'failed' | 'waiting' | 'review' | 'skipped'; startedAt?: string; finishedAt?: string; inputUrl?: string; outputUrl?: string; error?: string; transparency?: { after: TransparencyReport }; recognition?: { target?: GarmentTarget | null; assessment?: string; issues?: { code?: string; message: string; suggestedAction?: string }[] } }
export type ClosetTask = {
  id: string
  garmentId: string
  parentJobId?: string
  title: string
  status: NonNullable<Garment['taskStatus']>
  mode: '识别并整理' | '仅识别' | '本地贴纸' | '图片整理'
  createdAt: string
  steps: TaskStep[]
  note?: string
  updatedAt?: string
  inputUrl?: string
  outputUrl?: string
  assets?: Garment['images']
  attempts?: { provider: string; model: string; status: string; startedAt: string; finishedAt?: string }[]
}

export const fieldLabels: Record<keyof Pick<Garment, 'category' | 'primaryColor' | 'secondaryColors' | 'patterns' | 'neckline' | 'sleeveLength' | 'garmentLength' | 'closure' | 'texture' | 'fit' | 'thickness' | 'wearingModes' | 'styles' | 'seasons' | 'brand' | 'size' | 'materialComposition' | 'careInstructions' | 'visibleText'>, string> = {
  category: '品类', primaryColor: '主色', secondaryColors: '辅色', patterns: '图案', neckline: '领型',
  sleeveLength: '袖长', garmentLength: '衣物长度', closure: '门襟', texture: '表面纹理', styles: '风格',
  fit: '版型建议（需核对）', thickness: '厚薄线索（需核对）', wearingModes: '穿着用途建议（需核对）',
  seasons: '季节', brand: '品牌', size: '尺码', materialComposition: '成分', careInstructions: '洗护', visibleText: '可见文字',
}

export type ListQuery = { status: ClosetStatus; q: string; category: string; color: string; season: string; page: number; size: number }
export type GarmentPage = { items: Garment[]; total: number; page: number; size: number }
export type ProcessingChoice = { value: string; label: string }

const MOCK_KEY = 'yixu.mock-data.v2'
export const usingMocks = import.meta.env.VITE_USE_MOCKS === 'true'
let csrfToken = ''

function now(offset = 0) {
  return new Date(Date.now() - offset * 86_400_000).toISOString()
}

function garment(id: string, category: string, primaryColor: string, color: string, extra: Partial<Garment> = {}): Garment {
  const ageInDays = Number(id)
  const item: Garment = {
    id, revision: 0, sourceAssetId: `source-${id}`, displayAssetId: `asset-${id}`, images: [], status: 'ACTIVE', updatedAt: now(Number.isFinite(ageInDays) ? ageInDays : 0), displayUrl: '', sourceUrl: '', category: [category], primaryColor: [primaryColor],
    automatic: {}, overrides: {},
    secondaryColors: [], patterns: ['纯色'], neckline: ['圆领'], sleeveLength: ['长袖'], garmentLength: ['常规'], closure: ['套头'],
    texture: ['针织'], styles: ['休闲'], seasons: ['春季', '秋季'], brand: [], size: [], materialComposition: [], careInstructions: [], visibleText: [],
    sourceOrigin: 'USER_UPLOAD', imageColor: color, ...extra,
  }
  for (const key of Object.keys(fieldLabels) as (keyof typeof fieldLabels)[]) item.automatic[key] = [...(item[key] || [])]
  return item
}

const initialGarments = [
  garment('1', '针织衫', '奶油白', '#e6e0d5', { patterns: ['绞花'], seasons: ['秋季', '冬季'], styles: ['简约', '通勤'] }),
  garment('2', '衬衫', '浅蓝', '#a8c2d1', { patterns: ['细条纹'], neckline: ['翻领'], closure: ['纽扣'], texture: ['棉质'] }),
  garment('3', '外套', '橄榄绿', '#737e60', { category: ['夹克'], sleeveLength: ['长袖'], seasons: ['春季', '秋季'] }),
  garment('4', '连衣裙', '陶土红', '#b76e55', { category: ['连衣裙'], garmentLength: ['中长'], seasons: ['春季', '夏季'], patterns: ['碎花'] }),
  garment('5', '长裤', '海军蓝', '#3e5368', { category: ['牛仔裤'], garmentLength: ['长款'], seasons: ['春季', '秋季'] }),
  garment('6', 'T恤', '鼠尾草绿', '#9cae98', { category: ['T恤'], sleeveLength: ['短袖'], seasons: ['春季', '夏季'], texture: ['棉质'] }),
  garment('7', '开衫', '燕麦色', '#c8baa3', { category: ['针织开衫'], neckline: ['V领'], closure: ['纽扣'], seasons: ['秋季', '冬季'] }),
  garment('8', '半身裙', '炭灰', '#666761', { category: ['半身裙'], garmentLength: ['中长'], seasons: ['春季', '秋季'] }),
  garment('9', '卫衣', '雾紫', '#a19aaa', { category: ['卫衣'], sleeveLength: ['长袖'], seasons: ['秋季', '冬季'] }),
  garment('10', '衬衫', '白色', '#e3e2dc', { status: 'DRAFT', taskStatus: 'NEEDS_REVIEW', reviewMessage: '图片已整理完成，请确认衣物细节后入柜。', taskId: 'task-10' }),
  garment('11', '风衣', '卡其色', '#b3a081', { status: 'DRAFT', taskStatus: 'RUNNING', reviewMessage: '图片整理进行中，请稍候。', taskId: 'task-11' }),
  garment('12', '背心', '深棕', '#746052', { status: 'TRASHED' }),
]

const initialTasks: ClosetTask[] = [
  { id: 'task-10', garmentId: '10', title: '白色衬衫', status: 'NEEDS_REVIEW', mode: '识别并整理', createdAt: now(0), steps: [{ name: '识别衣物', status: 'completed' }, { name: '整理图片', status: 'completed' }, { name: '透明背景', status: 'completed' }, { name: '制作贴纸', status: 'completed' }], note: '已完成，正在等待你核对。' },
  { id: 'task-11', garmentId: '11', title: '卡其色风衣', status: 'RUNNING', mode: '识别并整理', createdAt: now(1), steps: [{ name: '识别衣物', status: 'completed' }, { name: '整理图片', status: 'running' }, { name: '透明背景', status: 'waiting' }, { name: '制作贴纸', status: 'waiting' }] },
  { id: 'task-09', garmentId: '9', title: '雾紫卫衣', status: 'SUCCEEDED', mode: '识别并整理', createdAt: now(2), steps: [{ name: '识别衣物', status: 'completed' }, { name: '整理图片', status: 'completed' }, { name: '透明背景', status: 'completed' }, { name: '制作贴纸', status: 'completed' }] },
  { id: 'task-08', garmentId: '8', title: '炭灰半身裙', status: 'FAILED', mode: '识别并整理', createdAt: now(4), steps: [{ name: '识别衣物', status: 'completed' }, { name: '整理图片', status: 'failed' }, { name: '透明背景', status: 'waiting' }, { name: '制作贴纸', status: 'waiting' }], note: '图片服务暂时不可用，可以之后主动重试。' },
]

type MockState = { garments: Garment[]; tasks: ClosetTask[]; quotaUsed: number }
function readMock(): MockState {
  try {
    const saved = localStorage.getItem(`${MOCK_KEY}:${localStorage.getItem('yixu.mock-user') || 'anonymous'}`)
    if (saved) {
      const state = JSON.parse(saved) as MockState
      return state
    }
  } catch { /* Reset invalid prototype data below. */ }
  const state: MockState = { garments: initialGarments, tasks: initialTasks, quotaUsed: 4 }
  localStorage.setItem(`${MOCK_KEY}:${localStorage.getItem('yixu.mock-user') || 'anonymous'}`, JSON.stringify(state))
  return state
}
function writeMock(state: MockState) { localStorage.setItem(`${MOCK_KEY}:${localStorage.getItem('yixu.mock-user') || 'anonymous'}`, JSON.stringify(state)) }
function readMockOutfits(): Outfit[] {
  const key = `${MOCK_KEY}:outfits:${localStorage.getItem('yixu.mock-user') || 'anonymous'}`
  try { return JSON.parse(localStorage.getItem(key) || '[]') as Outfit[] }
  catch { return [] }
}
function writeMockOutfits(outfits: Outfit[]) {
  localStorage.setItem(`${MOCK_KEY}:outfits:${localStorage.getItem('yixu.mock-user') || 'anonymous'}`, JSON.stringify(outfits))
}
const delay = (ms = 160) => new Promise((resolve) => setTimeout(resolve, ms))

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const method = (init.method || 'GET').toUpperCase()
  if (!usingMocks && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = await fetch(apiUrl('/api/auth/csrf'), { credentials: 'include' })
    if (csrf.ok) csrfToken = ((await csrf.json()) as { token: string }).token
    if (csrfToken) headers.set('X-XSRF-TOKEN', csrfToken)
  }
  const response = await fetch(apiUrl(path), { ...init, headers, credentials: 'include' })
  if (!response.ok) {
    if (response.status === 401 && !['/api/auth/login', '/api/auth/portable-login', '/api/auth/me'].includes(path)) window.dispatchEvent(new Event('closet-session-expired'))
    const data = await response.json().catch(() => ({})) as { code?: string; message?: string; detail?: string }
    if (response.status === 403 && data.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new Event('closet-password-change-required'))
    throw new Error(data.message || data.detail || `请求失败 (${response.status})`)
  }
  return response.status === 204 ? undefined as T : await response.json() as T
}

type GarmentView = {
  name?: string | null; favorite?: boolean;
  id: string; revision: number; sourceAssetId: string; sourceUrl: string; sourceOrigin: Garment['sourceOrigin'];
  displayAssetId: string; displayUrl: string; images: Garment['images']; automatic: { assessment?: string; target?: GarmentTarget | null; issues?: { message: string }[]; attributes?: Record<string, { values: string[]; status?: string; evidence?: string }> } | null; overrides: Record<string, string[]>; effective: Record<string, string[]>;
  latestRecognitionJobId: string | null; latestImageJobId: string | null; runs: { id: string; status: string; createdAtMs: number }[];
  imageProcessing?: ImageProcessing | null; status: Garment['status']; createdAtMs: number; updatedAtMs: number;
}
type WorkflowResponse = {
  id: string; parentJobId?: string; status: string; createdAt: string; updatedAt: string; inputUrl?: string; outputUrl?: string;
  error?: { message: string } | null;
  request: { garmentId?: string; steps?: { type: string }[] };
  steps: { type: string; status: string; startedAt?: string; finishedAt?: string; inputUrl?: string; outputUrl?: string; error?: { message: string }; transparency?: TaskStep['transparency']; recognition?: TaskStep['recognition'] }[];
  assets: Garment['images']; attempts?: ClosetTask['attempts'];
}
export const stepLabels: Record<string, string> = { RECOGNIZE: 'AI 识别衣物', GENERATE: 'AI 整理图片', SEGMENT: '本地抠图', ENSURE_TRANSPARENCY: '检查透明背景', STICKER: '制作贴纸' }

const colors: Record<string, string> = { '白色': '#e3e2dc', '奶油白': '#e6e0d5', '黑色': '#383a38', '浅蓝': '#a8c2d1', '海军蓝': '#3e5368', '橄榄绿': '#737e60', '陶土红': '#b76e55', '鼠尾草绿': '#9cae98', '卡其色': '#b3a081', '燕麦色': '#c8baa3', '炭灰': '#666761' }
function fromView(view: GarmentView): Garment {
  const status = view.status || 'ACTIVE'
  const latestId = [...(view.runs || [])].sort((a, b) => b.createdAtMs - a.createdAtMs)[0]?.id || view.latestRecognitionJobId || view.latestImageJobId
  let latestStatus = view.runs.find((run) => run.id === latestId)?.status || ''
  if (view.imageProcessing && ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(view.imageProcessing.status)) latestStatus = view.imageProcessing.status
  const taskStatus = latestStatus === 'QUEUED' ? 'QUEUED' : latestStatus === 'RUNNING' ? 'RUNNING' : latestStatus === 'CANCEL_REQUESTED' ? 'CANCEL_REQUESTED'
    : latestStatus === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : latestStatus === 'FAILED' ? 'FAILED' : latestStatus === 'CANCELLED' ? 'CANCELLED'
      : latestStatus === 'SUCCEEDED' ? 'SUCCEEDED' : latestStatus === 'UNKNOWN' ? 'UNKNOWN' : undefined
  return {
    id: view.id, name: view.name, favorite: view.favorite, revision: view.revision, sourceAssetId: view.sourceAssetId, displayAssetId: view.displayAssetId, images: view.images || [], assessment: view.automatic?.assessment, target: view.automatic?.target, issues: view.automatic?.issues || [], status, updatedAt: new Date(view.updatedAtMs).toISOString(), displayUrl: view.displayUrl, sourceUrl: view.sourceUrl,
    metadataEvidence: view.automatic?.attributes || {}, automatic: Object.fromEntries(Object.entries(view.automatic?.attributes || {}).map(([key, attribute]) => [key, attribute.values])), overrides: view.overrides || {},
    category: view.effective.category || [], primaryColor: view.effective.primaryColor || [], secondaryColors: view.effective.secondaryColors || [],
    patterns: view.effective.patterns || [], neckline: view.effective.neckline || [], sleeveLength: view.effective.sleeveLength || [],
    garmentLength: view.effective.garmentLength || [], closure: view.effective.closure || [], texture: view.effective.texture || [], fit: view.effective.fit || [], thickness: view.effective.thickness || [], wearingModes: view.effective.wearingModes || [],
    styles: view.effective.styles || [], seasons: view.effective.seasons || [], brand: view.effective.brand || [], size: view.effective.size || [],
    materialComposition: view.effective.materialComposition || [], careInstructions: view.effective.careInstructions || [], visibleText: view.effective.visibleText || [],
    sourceOrigin: view.sourceOrigin, imageColor: colors[view.effective.primaryColor?.[0] || ''] || '#d6d5cc',
    taskStatus, taskId: latestId || undefined, imageProcessing: view.imageProcessing,
  }
}
function fromJob(job: WorkflowResponse): ClosetTask {
  const status: ClosetTask['status'] = ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(job.status)
    ? job.status as ClosetTask['status'] : 'UNKNOWN'
  const mode = job.steps.some((step) => step.type === 'GENERATE') ? job.steps.some((step) => step.type === 'RECOGNIZE') ? '识别并整理' : '图片整理' : job.steps.some((step) => step.type === 'RECOGNIZE') ? '仅识别' : '本地贴纸'
  return { id: job.id, parentJobId: job.parentJobId, garmentId: job.request.garmentId || '', title: '衣物图片处理', status, mode, createdAt: job.createdAt, updatedAt: job.updatedAt,
    inputUrl: job.inputUrl, outputUrl: job.outputUrl, assets: job.assets || [], attempts: job.attempts || [],
    steps: job.steps.map((step) => ({ name: stepLabels[step.type] || step.type, type: step.type,
      startedAt: step.startedAt, finishedAt: step.finishedAt, inputUrl: step.inputUrl, outputUrl: step.outputUrl, error: step.error?.message, transparency: step.transparency, recognition: step.recognition,
      status: step.status === 'SUCCEEDED' ? 'completed' : step.status === 'RUNNING' ? 'running' : ['FAILED', 'UNKNOWN', 'INTERRUPTED'].includes(step.status) ? 'failed' : step.status === 'NEEDS_REVIEW' ? 'review' : step.status === 'SKIPPED' ? 'skipped' : 'waiting' })),
    note: job.error?.message,
  }
}

export type PortableLoginLink = { id: string; createdAt: number; expiresAt: number; sessionExpiresAt: number | null; status: 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED' }
export type PortableLoginGrant = { id: string; token: string; expiresAt: number }
export const closetApi = {
  async metadataOptions(): Promise<Record<string, string[]>> {
    if (!usingMocks) return request<Record<string, string[]>>('/api/closet/metadata-options')
    return Object.fromEntries(Object.keys(fieldLabels).map(key => [key, [...new Set(readMock().garments.filter(item => item.status === 'ACTIVE').flatMap(item => item[key as keyof typeof fieldLabels] || []))]]))
  },
  async metadataFields(): Promise<MetadataField[]> {
    if (usingMocks) return Object.entries(fieldLabels).map(([key, label]) => ({ key, label, options: [], multiple: ['secondaryColors', 'patterns', 'closure', 'texture', 'styles', 'seasons', 'wearingModes', 'visibleText'].includes(key), suggestion: ['styles', 'seasons', 'fit', 'thickness', 'wearingModes'].includes(key) }))
    return (await request<{ fields: MetadataField[] }>('/api/recognition/schema')).fields
  },
  async processingChoices(): Promise<{ generation: ProcessingChoice[]; recognition: ProcessingChoice[] }> {
    if (usingMocks) return {
      generation: [{ value: JSON.stringify({ provider: 'demo', model: '衣物整理默认模型' }), label: '衣物整理默认模型' }],
      recognition: [{ value: JSON.stringify({ provider: 'demo', model: '衣物识别默认模型' }), label: '衣物识别默认模型' }],
    }
    type Provider = { id: string; defaultModel: string | null; configured: boolean; preferred?: boolean }
    const [generators, recognizers] = await Promise.all([
      request<Provider[]>('/api/generation/providers'), request<Provider[]>('/api/recognition/providers'),
    ])
    const choices = (providers: Provider[]) => providers.filter((provider) => provider.configured && provider.defaultModel)
      .map((provider) => ({ value: JSON.stringify({ provider: provider.id, model: provider.defaultModel }), label: `${provider.id} · ${provider.defaultModel}` }))
    const generation = choices(generators)
    const recognition = choices(recognizers).sort((a, b) => Number(JSON.parse(b.value).provider === recognizers.find((provider) => provider.preferred)?.id) - Number(JSON.parse(a.value).provider === recognizers.find((provider) => provider.preferred)?.id))
    return { generation, recognition }
  },
  async list(query: ListQuery): Promise<GarmentPage> {
    if (!usingMocks) {
      const page = await request<{ items: GarmentView[]; total: number; page: number; size: number }>(`/api/closet/garments?${new URLSearchParams({ ...query, q: query.q || '', category: query.category || '', color: query.color || '', season: query.season || '', size: String(query.size), page: String(query.page) })}`)
      return { ...page, items: page.items.map(fromView) }
    }
    await delay()
    const state = readMock()
    const search = query.q.trim().toLocaleLowerCase()
    const matching = state.garments.filter((item) => item.status === query.status)
      .filter((item) => !search || [item.category, item.primaryColor, item.secondaryColors, item.patterns, item.brand, item.styles, item.seasons].flat().join(' ').toLocaleLowerCase().includes(search))
      .filter((item) => !query.category || item.category.includes(query.category))
      .filter((item) => !query.color || item.primaryColor.includes(query.color))
      .filter((item) => !query.season || item.seasons.includes(query.season))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const start = (query.page - 1) * query.size
    return { items: matching.slice(start, start + query.size), total: matching.length, page: query.page, size: query.size }
  },
  async detail(id: string): Promise<Garment> {
    if (!usingMocks) return fromView(await request<GarmentView>(`/api/garments/${id}`))
    await delay()
    const found = readMock().garments.find((item) => item.id === id)
    if (!found) throw new Error('找不到这件衣物。')
    return structuredClone(found)
  },
  async personStickers(): Promise<PersonCatalog> {
    if (!usingMocks) return request<PersonCatalog>('/api/person-stickers')
    return { ...personCatalog, sets: personCatalog.sets.map(set => ({ ...set, parts: set.parts.map(part => ({ ...part, url: part.url.replace('/api/person-stickers/', '/person-stickers/') })) })) }
  },
  async outfits(): Promise<Outfit[]> {
    if (!usingMocks) return request<Outfit[]>('/api/outfits')
    await delay()
    return structuredClone(readMockOutfits().sort((a, b) => b.updatedAtMs - a.updatedAtMs))
  },
  async outfit(id: string): Promise<Outfit> {
    if (!usingMocks) return request<Outfit>(`/api/outfits/${id}`)
    const found = readMockOutfits().find((outfit) => outfit.id === id)
    if (!found) throw new Error('找不到这套搭配。')
    return structuredClone(found)
  },
  async saveOutfit(id: string | null, revision: number | null, name: string, scene: OutfitScene): Promise<Outfit> {
    const payload = { name, revision, scene: sceneWrite(normalizeScene(scene)) }
    if (!usingMocks) return id
      ? request<Outfit>(`/api/outfits/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : request<Outfit>('/api/outfits', { method: 'POST', body: JSON.stringify(payload) })
    await delay()
    const mockScene: OutfitScene = normalizeScene(scene)
    const outfits = readMockOutfits()
    const now = Date.now()
    if (!id) {
      const created: Outfit = { id: createUuid(), name, revision: 0, createdAtMs: now, updatedAtMs: now, scene: mockScene }
      outfits.unshift(created); writeMockOutfits(outfits); return structuredClone(created)
    }
    const index = outfits.findIndex((outfit) => outfit.id === id)
    if (index < 0) throw new Error('这套搭配已被删除，请返回列表查看。')
    const current = outfits[index]
    if (current.revision !== revision) throw new Error('这套搭配已在另一处更新；你的修改尚未提交。请重新加载或另存副本。')
    outfits[index] = { ...current, name, revision: current.revision + 1, updatedAtMs: now, scene: mockScene }
    writeMockOutfits(outfits)
    return structuredClone(outfits[index])
  },
  async deleteOutfit(id: string, revision: number): Promise<void> {
    if (!usingMocks) return request<void>(`/api/outfits/${id}?revision=${revision}`, { method: 'DELETE' })
    await delay()
    const outfits = readMockOutfits()
    if (!outfits.some((outfit) => outfit.id === id && outfit.revision === revision)) throw new Error('这套搭配已更新，请刷新列表后重试。')
    writeMockOutfits(outfits.filter((outfit) => outfit.id !== id))
  },
  async tasks(): Promise<ClosetTask[]> {
    if (!usingMocks) return (await request<ClosetTask[]>('/api/closet/tasks?page=1&size=50')).map(task => ({ ...task, steps: task.steps.map(step => ({ ...step, name: stepLabels[step.name] || step.name })) }))
    await delay()
    return structuredClone(readMock().tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  },
  async create(file: File, mode: Exclude<ClosetTask['mode'], '图片整理'>, options: { restage: boolean; precut: boolean; postcut: boolean; rotationDegrees: number; transparencyPolicy?: 'AUTO' | 'FORCE'; generationProvider?: string; generationModel?: string; recognitionProvider?: string; recognitionModel?: string }): Promise<ClosetTask> {
    if (!usingMocks) {
      const form = new FormData()
      form.append('file', file)
      form.append('workflow', new Blob([JSON.stringify({ mode, ...options })], { type: 'application/json' }))
      return fromJob(await request<WorkflowResponse>('/api/closet/garments', { method: 'POST', body: form, headers: { 'Idempotency-Key': createUuid() } }))
    }
    throw new Error('当前是界面演示模式，未连接 AI。请关闭 VITE_USE_MOCKS 并登录真实账号后提交。')
  },
  async task(id: string): Promise<ClosetTask> {
    if (!usingMocks) return fromJob(await request<WorkflowResponse>(`/api/workflows/${id}`))
    const task = readMock().tasks.find(item => item.id === id)
    if (!task) throw new Error('演示任务不存在。')
    return structuredClone(task)
  },

  async continueSticker(taskId: string, assetId: string, policy: 'FORCE' | 'REVIEWED', key: string): Promise<ClosetTask> {
    if (usingMocks) throw new Error('演示模式不执行图片处理。')
    if (policy === 'REVIEWED') await request(`/api/workflows/${taskId}/assets/${assetId}/review`, { method: 'POST', body: JSON.stringify({ decision: 'APPROVED', note: '人工核对透明背景与完整衣物后继续制作贴纸' }) })
    return fromJob(await request<WorkflowResponse>(`/api/workflows/${taskId}/continue`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ assetId, policy, method: 'U2NET' }) }))
  },

  async confirm(id: string, patch: Partial<Garment> & { fields?: Record<string, string[]>; resetFields?: string[]; revision?: number; assetId?: string; allowIncompleteSticker?: boolean }) {
    if (!usingMocks) {
      const view = await request<GarmentView>(`/api/garments/${id}`)
      return fromView(await request<GarmentView>(`/api/closet/garments/${id}/confirm`, { method: 'POST', body: JSON.stringify({ revision: patch.revision ?? view.revision, assetId: patch.assetId ?? view.displayAssetId, fields: patch.fields || {}, resetFields: patch.resetFields || [], allowIncompleteSticker: patch.allowIncompleteSticker || false }) }))
    }
    await delay()
    const state = readMock()
    const item = state.garments.find((candidate) => candidate.id === id)
    if (!item) throw new Error('找不到这件衣物。')
    if (patch.fields) Object.assign(item, patch.fields)
    for (const key of Object.keys(patch.fields || {})) item.overrides[key] = [...(patch.fields?.[key] || [])]
    for (const key of patch.resetFields || []) { delete item.overrides[key]; (item as unknown as Record<string, string[]>)[key] = item.automatic[key] || [] }
    if (patch.assetId) {
      const selected = item.images.find((image) => image.id === patch.assetId)
      item.displayAssetId = patch.assetId
      if (selected) item.displayUrl = selected.url
    }
    Object.assign(item, { status: 'ACTIVE', reviewMessage: undefined, updatedAt: now(), revision: item.revision + 1 })
    writeMock(state)
    return item
  },
  async update(id: string, patch: Partial<Garment> & { fields?: Record<string, string[]>; resetFields?: string[]; revision?: number }) {
    if (!usingMocks) {
      const view = await request<GarmentView>(`/api/garments/${id}`)
      return fromView(await request<GarmentView>(`/api/garments/${id}/metadata`, { method: 'PATCH', body: JSON.stringify({ revision: patch.revision ?? view.revision, fields: patch.fields || {}, resetFields: patch.resetFields || [] }) }))
    }
    await delay()
    const state = readMock()
    const index = state.garments.findIndex((item) => item.id === id)
    if (index < 0) throw new Error('找不到这件衣物。')
    const item = state.garments[index]
    Object.assign(item, patch.fields)
    for (const key of Object.keys(patch.fields || {})) item.overrides[key] = [...(patch.fields?.[key] || [])]
    for (const key of patch.resetFields || []) { delete item.overrides[key]; (item as unknown as Record<string, string[]>)[key] = item.automatic[key] || [] }
    state.garments[index] = { ...item, updatedAt: now(), revision: item.revision + 1 }
    writeMock(state)
    return state.garments[index]
  },
  async chooseDisplay(id: string, assetId: string, revision: number) {
    if (!usingMocks) return fromView(await request<GarmentView>(`/api/garments/${id}/display-image`, { method: 'POST', body: JSON.stringify({ revision, assetId }) }))
    const state = readMock()
    const item = state.garments.find((candidate) => candidate.id === id)
    if (!item) throw new Error('找不到这件衣物。')
    item.displayAssetId = assetId
    const selected = item.images.find((image) => image.id === assetId)
    if (selected) item.displayUrl = selected.url
    item.revision += 1; writeMock(state)
    return item
  },
  async trash(id: string, revision?: number) { return this.setStatus(id, 'TRASHED', revision) },
  async restore(id: string, status: 'ACTIVE' | 'DRAFT' = 'ACTIVE', revision?: number) { return this.setStatus(id, status, revision) },
  async setStatus(id: string, status: ClosetStatus, revision?: number) {
    if (!usingMocks) {
      const view = await request<GarmentView>(`/api/garments/${id}`)
      const result = await request<GarmentView>(`/api/closet/garments/${id}/${status === 'TRASHED' ? 'trash' : 'restore'}`, { method: 'POST', body: JSON.stringify({ revision: revision ?? view.revision }) })
      return fromView(result)
    }
    await delay()
    const state = readMock()
    const item = state.garments.find((candidate) => candidate.id === id)
    if (!item) throw new Error('找不到这件衣物。')
    if (status === 'TRASHED') { item.restoreStatus = item.status === 'TRASHED' ? 'ACTIVE' : item.status }
    else if (item.status === 'TRASHED') status = item.restoreStatus || 'ACTIVE'
    item.status = status
    item.revision += 1
    item.updatedAt = now()
    writeMock(state)
    return item
  },
  async cancel(taskId: string) {
    if (!usingMocks) return request(`/api/workflows/${taskId}/cancel`, { method: 'POST' })
    const state = readMock()
    const task = state.tasks.find((candidate) => candidate.id === taskId)
    if (task) task.status = 'CANCELLED'
    const item = state.garments.find((candidate) => candidate.taskId === taskId)
    if (item) item.taskStatus = 'CANCELLED'
    writeMock(state)
    return task
  },
  async cancelAndWait(taskId: string) {
    await this.cancel(taskId)
    if (usingMocks) return
    const deadline = Date.now() + 10 * 60_000
    let wait = 600
    while (Date.now() < deadline) {
      await delay(wait)
      const task = await request<WorkflowResponse>(`/api/workflows/${taskId}`)
      if (!['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(task.status)) return
      wait = Math.min(wait * 1.6, 5000)
    }
    throw new Error('任务仍在收尾，请稍后再移入回收站。')
  },
  async recognize(id: string, targetDescription = '') { return this.startExistingRun(id, '仅识别', targetDescription) },
  async reprocess(id: string) { return this.startExistingRun(id, '识别并整理') },
  async startExistingRun(id: string, mode: ClosetTask['mode'], targetDescription = '') {
    if (!usingMocks) {
      const task = mode === '仅识别'
        ? await request<WorkflowResponse>(`/api/garments/${id}/recognize`, { method: 'POST', headers: { 'Idempotency-Key': createUuid() }, body: JSON.stringify({ targetDescription }) })
        : await request<WorkflowResponse>(`/api/closet/garments/${id}/reprocess`, { method: 'POST', headers: { 'Idempotency-Key': createUuid() }, body: JSON.stringify({ restage: true, precut: false, postcut: true }) })
      return fromJob(task)
    }
    throw new Error('演示模式不会调用 AI，请使用真实账号提交。')
  },

  async quota() {
    if (!usingMocks) return request<{ limit: number; used: number; resetAt: string }>('/api/me/quota')
    const state = readMock()
    return { limit: 20, used: state.quotaUsed, resetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString() }
  },
  async login(username: string, password: string) {
    if (!usingMocks) { const result = await request<{ username: string; mustChangePassword: boolean; portableLogin?: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); csrfToken = ''; return result }
    await delay(250)
    if (!username.trim() || !password.trim()) throw new Error('请输入用户名和密码。')
    localStorage.setItem('yixu.mock-user', username.trim())
    localStorage.setItem('yixu.mock-first-login', password === 'welcome123' ? '1' : '0')
    return { username: username.trim(), mustChangePassword: password === 'welcome123' }
  },
  async createPortableLoginLink(currentPassword: string) {
    if (usingMocks) throw new Error('演示模式不支持便携登录。')
    return request<PortableLoginGrant>('/api/auth/portable-links', { method: 'POST', body: JSON.stringify({ currentPassword }) })
  },
  async portableLoginLinks() {
    if (usingMocks) return [] as PortableLoginLink[]
    return request<PortableLoginLink[]>('/api/auth/portable-links')
  },
  async revokePortableLoginLink(id: string) {
    if (!usingMocks) await request<void>(`/api/auth/portable-links/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  async consumePortableLogin(token: string) {
    if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) throw new Error('便携登录需要 HTTPS。')
    if (usingMocks) throw new Error('演示模式不支持便携登录。')
    const user = await request<{ username: string; mustChangePassword: boolean; portableLogin?: boolean }>('/api/auth/portable-login', { method: 'POST', body: JSON.stringify({ token }) })
    csrfToken = ''
    return user
  },
  async currentUser() {
    if (!usingMocks) return request<{ username: string; mustChangePassword: boolean; portableLogin?: boolean }>('/api/auth/me')
    const username = localStorage.getItem('yixu.mock-user')
    return username ? { username, mustChangePassword: localStorage.getItem('yixu.mock-first-login') === '1' } : null
  },
  async logout() {
    if (!usingMocks) { await request('/api/auth/logout', { method: 'POST' }); csrfToken = '' }
    else localStorage.removeItem('yixu.mock-user')
  },
  async changePassword(currentPassword: string, newPassword: string) {
    if (!usingMocks) { await request('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); csrfToken = '' }
    else { await delay(); if (!newPassword) throw new Error('请输入新密码。'); localStorage.setItem('yixu.mock-first-login', '0') }
  },
}
