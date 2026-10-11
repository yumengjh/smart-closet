<script setup lang="ts">
import { mediaUrl } from '../services/urls'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { recordBoardTrace } from '../agent/trace-client'
import { changeSource } from '../agent/trace-data'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { App, Empty } from 'ant-design-vue'
import Konva from 'konva'
import { Group as VGroup, Image as VImage, Layer as VLayer, Rect as VRect, Stage as VStage, Transformer as VTransformer } from 'vue-konva'
import {
  ArrowLeftOutlined, CheckOutlined, ControlOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined,
  ArrowDownOutlined, ArrowUpOutlined, ExpandOutlined, InfoCircleOutlined, MenuOutlined, MinusOutlined, MoreOutlined, PictureOutlined, PlusOutlined,
  QuestionCircleOutlined, RedoOutlined, ReloadOutlined, SaveOutlined, SearchOutlined, SwapOutlined, UndoOutlined,
  VerticalAlignBottomOutlined, VerticalAlignTopOutlined, DragOutlined, FullscreenOutlined,
} from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { useThemeStore } from '../stores/theme'
import { tokens } from '../theme/tokens'
import { closetApi, type Garment } from '../services/api'
import { dropOutfitLayer, elementKey, normalizeScene, stickerLimit, copySticker, OUTFIT_HEIGHT, OUTFIT_VERSION, OUTFIT_WIDTH, outfitDropPosition, outfitRoleOptions, reorderOutfitElements, restoreOutfitDraft, roleFromGarment, type Outfit, type OutfitDraft, type OutfitElement, type OutfitLayerMove, type OutfitRole, type OutfitScene } from '../domain/outfit'
import { artworkForGarment, createOutfitElement, downloadOutfitPng, loadOutfitImage } from '../domain/outfit-images'
import OutfitReview from '../components/OutfitReview.vue'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import OutfitGarmentPicker from '../components/OutfitGarmentPicker.vue'
import OutfitMultiInspector from '../components/OutfitMultiInspector.vue'
import OutfitInspector from '../components/OutfitInspector.vue'
import OutfitPersonPicker from '../components/OutfitPersonPicker.vue'
import { createPersonElement, type PersonCatalog, type PersonPart } from '../domain/person-stickers'
import OutfitLayers from '../components/OutfitLayers.vue'
import RecommendationStrip from '../recommend/RecommendationStrip.vue'
import ExplainButton from '../recommend/ExplainButton.vue'
import { recommendApi } from '../recommend/api'
import { wornLabel as formatWorn } from '../recommend/format'
import SoundToggle from '../components/SoundToggle.vue'
import { arrangeOutfit } from '../domain/outfit-layout'
import { canvasBridge } from '../agent/bridge'
import { playSound } from '../services/sound'
import type { CueName } from '@foleyjs/core'
import { MIN_VIEW_ZOOM, MAX_VIEW_ZOOM, outfitViewGeometry, outfitWheelZoom } from '../domain/outfit-view'

const props = defineProps<{ board?: import('../domain/outfit-workspace').WorkspaceBoard; saveBoard?: () => Promise<void> }>()
const actualRoute = useRoute()
const route = new Proxy(actualRoute, { get(target, key) { if (props.board && key === 'params') return { id: props.board.outfitId || 'new' }; return Reflect.get(target, key) } })
const router = useRouter()
const closet = useClosetStore()
const appearance = useThemeStore()
const accentColor = computed(() => tokens[appearance.isDark ? 'dark' : 'light'].accent)
const { message, modal } = App.useApp()
const editing = computed(() => Boolean(route.params.id))
const isNew = computed(() => route.params.id === 'new')
const reviewOpen = ref(false)
const pageLoading = ref(false)
const saving = ref(false)
const exporting = ref(false)
const error = ref('')
const saved = ref<Outfit[]>([])
const librarySearch = ref('')
const displayedOutfits = computed(() => saved.value.filter(item => item.name.toLocaleLowerCase().includes(librarySearch.value.trim().toLocaleLowerCase())))
const inspectorTab = ref('properties')
const garments = ref<Garment[]>([])
const materialTab = ref('garments')
const personCatalog = ref<PersonCatalog | null>(null)
const loadingPeople = ref(false)
const peopleError = ref('')
const dragPart = ref<PersonPart | null>(null)
const loadingGarments = ref(false)
const garmentError = ref('')
const search = ref('')
const roleFilter = ref<OutfitRole | 'ALL'>('ALL')
const pickerOpen = ref(false)
const inspectorOpen = ref(false)
const layersOpen = ref(false)
const infoOpen = ref(false)
const infoLoading = ref(false)
const infoError = ref('')
const infoGarment = ref<Garment | null>(null)
const compact = ref(window.matchMedia('(max-width: 1023px)').matches)
const pickerVisible = ref(true)
const inspectorVisible = ref(window.innerWidth >= 1280)
const panTool = ref(false)
const spacePressed = ref(false)
const hoveringView = ref(false)
const draggingView = ref(false)
let panOrigin: { id: number; x: number; y: number; left: number; top: number } | null = null
let measuredViewport: HTMLElement | null = null
let viewRevision = 0
const dragGarmentId = ref('')
const dragOver = ref(false)
const stageFrame = ref<HTMLElement | null>(null)
const contextMenu = ref<HTMLElement | null>(null)
const contextTarget = ref('')
const contextPosition = ref({ x: 0, y: 0 })
const addingGarments = new Set<string>()
const pinching = ref(false)
let touchTimer: number | undefined
let pinchDistance = 0
let pinchZoom = 1
let pinchPoint = { x: .5, y: .5 }
let pinchMoveRevision = 0
const replacementTarget = ref<string | null>(null)
const selectedId = ref('')
const selectedIds = ref<string[]>([])
const selectedItems = computed(() => elements.value.filter(item => selectedIds.value.includes(elementKey(item))))
const failedImage = ref('')
const imageMap = ref<Record<string, HTMLImageElement>>({})
const outfitId = ref('')
const revision = ref<number | null>(null)
const name = ref('未命名搭配')
const draftOwner = ref('')
const elements = ref<OutfitElement[]>([])
const undoStack = ref<OutfitElement[][]>([])
const redoStack = ref<OutfitElement[][]>([])
const localDraftNotice = ref(false)
const remoteConflict = ref(false)
const zoom = ref(1)
const canvasArea = ref<HTMLElement | null>(null)
const availableWidth = ref(520)
const availableHeight = ref(680)
const transformer = ref<{ getNode: () => Konva.Transformer } | null>(null)
const nodeRefs = reactive<Record<string, { getNode: () => Konva.Group } | null>>({})
let loadRevision = 0
let imageLoadRevision = 0
let draftTimer: number | undefined
let resizeObserver: ResizeObserver | undefined
let loaded = false
let baselineSignature = ''
let draftRevision: number | null = null
let synchronizingBoard = false
let traceSource = 'manual-edit'

const activeGarments = computed(() => garments.value.filter((item) => item.status === 'ACTIVE'))
const filteredGarments = computed(() => activeGarments.value.filter((item) => {
  const category = [item.category, item.primaryColor, item.brand, item.styles, item.seasons].flat().join(' ').toLocaleLowerCase()
  return (!search.value || category.includes(search.value.trim().toLocaleLowerCase()))
    && (roleFilter.value === 'ALL' || roleFromGarment(item) === roleFilter.value)
}))
const pickedIds = computed(() => new Set(elements.value.filter(item => item.kind !== 'PERSON_PART').map(item => item.garmentId)))
const viewGeometry = computed(() => outfitViewGeometry(availableWidth.value, availableHeight.value, zoom.value, compact.value ? 24 : 48))
const canvasScale = computed(() => viewGeometry.value.scale)
const stageWidth = computed(() => viewGeometry.value.stageWidth)
const stageHeight = computed(() => viewGeometry.value.stageHeight)
const focusedView = computed(() => !pickerVisible.value && !inspectorVisible.value)
const scene = computed<OutfitScene>(() => ({ version: OUTFIT_VERSION, elements: elements.value }))
const currentItem = computed(() => elements.value.find((item) => elementKey(item) === selectedId.value) || null)
const selectedIndex = computed(() => elements.value.findIndex(item => elementKey(item) === selectedId.value))
const canForward = computed(() => selectedIndex.value >= 0 && selectedIndex.value < elements.value.length - 1)
const canBackward = computed(() => selectedIndex.value > 0)
const contextItem = computed(() => elements.value.find(item => elementKey(item) === contextTarget.value))
const contextGarment = computed(() => garments.value.find(item => item.id === contextTarget.value))
const hasChanges = computed(() => props.board ? JSON.stringify({ name: props.board.name, scene: props.board.scene }) !== props.board.savedSignature : JSON.stringify({ name: name.value, elements: elements.value }) !== baselineSignature)
const saveState = computed(() => localDraftNotice.value ? '草稿已保存在此设备' : !isNew.value && !hasChanges.value ? '已保存至账号' : '修改会自动保留在此设备')
const dirty = computed(() => elements.value.length > 0)
const roleNames = Object.fromEntries(outfitRoleOptions.map((option) => [option.value, option.label])) as Record<OutfitRole, string>
const sceneLabel = computed(() => `${elements.value.length} 张贴纸`)
function draftKeyFor(id: string) { return `yixu.outfit-draft.v1:${draftOwner.value || closet.user?.username || 'anonymous'}:${id}` }
const draftKey = computed(() => `${draftKeyFor(String(route.params.id || 'new'))}${isNew.value && typeof route.query.draft === 'string' ? ':' + route.query.draft : ''}`)

function getDraft() {
  try { return JSON.parse(localStorage.getItem(draftKey.value) || 'null') as OutfitDraft | null }
  catch { return null }
}
function persistDraft() {
  if (!loaded || !editing.value) return
  if (props.board) {
    if (synchronizingBoard || props.board.locked) return
    const board = props.board
    board.undo = undoStack.value; board.redo = redoStack.value; board.selectedIds = [...selectedIds.value]; board.zoom = zoom.value
    if (JSON.stringify(board.scene.elements) !== JSON.stringify(elements.value) || board.name !== name.value) {
      const before = board.scene, beforeVersion = board.contentVersion
      board.scene = normalizeScene(scene.value); board.name = name.value; board.contentVersion++
      if (board.traceSessionId && board.traceOwner) recordBoardTrace(board.traceOwner, board.traceSessionId, board.id, traceSource, before, board.scene, { beforeVersion, afterVersion: board.contentVersion })
    }
    return
  }
  if (JSON.stringify({ name: name.value, elements: elements.value }) === baselineSignature) {
    localStorage.removeItem(draftKey.value)
    localDraftNotice.value = false
    return
  }
  try {
    localStorage.setItem(draftKey.value, JSON.stringify({ name: name.value, revision: draftRevision, scene: scene.value, savedAt: Date.now() }))
    localDraftNotice.value = true
  } catch { /* The canvas remains usable if local storage is full or unavailable. */ }
}
function scheduleDraft() {
  if (props.board?.traceSessionId) { persistDraft(); return }
  window.clearTimeout(draftTimer)
  draftTimer = window.setTimeout(persistDraft, 240)
}

async function loadGarments() {
  loadingGarments.value = true
  garmentError.value = ''
  try {
    const first = await closetApi.list({ status: 'ACTIVE', q: '', category: '', color: '', season: '', page: 1, size: 50 })
    const items = [...first.items]
    const pages = Math.min(40, Math.ceil(first.total / 50))
    for (let page = 2; page <= pages; page++) {
      const result = await closetApi.list({ status: 'ACTIVE', q: '', category: '', color: '', season: '', page, size: 50 })
      items.push(...result.items)
    }
    garments.value = items
  } catch (cause) {
    garmentError.value = cause instanceof Error ? cause.message : '衣柜暂时无法加载。'
  } finally { loadingGarments.value = false }
}

async function loadPage() {
  draftOwner.value = closet.user?.username || draftOwner.value
  const request = ++loadRevision
  loaded = false
  pageLoading.value = true
  error.value = ''
  remoteConflict.value = false
  selectedId.value = ''
  replacementTarget.value = null
  pickerOpen.value = false
  inspectorOpen.value = false
  contextTarget.value = ''
  if (!editing.value) {
    saved.value = []
    pageLoading.value = false
    return
  }
  if (props.board) {
    const board = props.board
    name.value = board.name; elements.value = board.scene.elements.map(e => ({ ...e })); outfitId.value = board.outfitId || ''; revision.value = board.revision
    undoStack.value = board.undo; redoStack.value = board.redo; selectedIds.value = [...board.selectedIds]; selectedId.value = selectedIds.value.at(-1) || ''; zoom.value = board.zoom
    baselineSignature = board.savedSignature; localDraftNotice.value = !board.savedSignature
    await nextTick(); loaded = true; pageLoading.value = false; return
  }
  if (isNew.value) {
    const draft = getDraft()
    outfitId.value = ''
    revision.value = null
    draftRevision = null
    name.value = draft?.name || '未命名搭配'
    elements.value = draft?.scene && [1, OUTFIT_VERSION].includes(draft.scene.version) ? normalizeScene(draft.scene).elements : []
    undoStack.value = []; redoStack.value = []
    baselineSignature = JSON.stringify({ name: '未命名搭配', elements: [] })
    localDraftNotice.value = Boolean(draft)
    await nextTick()
    if (request === loadRevision) { loaded = true; pageLoading.value = false }
    return
  }
  try {
    const outfit = await closetApi.outfit(String(route.params.id))
    if (request !== loadRevision) return
    outfitId.value = outfit.id
    revision.value = outfit.revision
    draftRevision = outfit.revision
    baselineSignature = JSON.stringify({ name: outfit.name, elements: normalizeScene(outfit.scene).elements })
    undoStack.value = []; redoStack.value = []
    const draft = getDraft()
    const restored = restoreOutfitDraft(outfit, draft)
    name.value = restored.name
    elements.value = restored.scene.elements
    localDraftNotice.value = restored.restored
    remoteConflict.value = restored.conflict
    if (restored.restored) draftRevision = draft?.revision ?? null
    else if (draft) localStorage.removeItem(draftKey.value)
    await nextTick()
    if (request === loadRevision) { loaded = true; pageLoading.value = false }
  } catch (cause) {
    if (request !== loadRevision) return
    error.value = cause instanceof Error ? cause.message : '搭配暂时无法加载。'
    pageLoading.value = false
  }
}

const wornDates = ref<Record<string, string>>({})
const wearing = ref(false)
/** "今天穿了这套" (D6): records the saved outfit's garments for freshness, idle activation and the wear history. */
async function wearOutfit(id: string) {
  wearing.value = true
  try {
    const r = await recommendApi.wear({ outfitId: id }); wornDates.value = { ...wornDates.value, [id]: r.wornOn }
    playSound('success'); message.success('已记下今天穿了这套。')
  } catch (cause) { playSound('error'); message.error(cause instanceof Error ? cause.message : '没有记录成功。') }
  finally { wearing.value = false }
}
function wornLabel(id: string) { return formatWorn(wornDates.value[id]) }
async function loadLibrary() {
  // Shares loadRevision with loadPage so only the newest list/page load may write results or clear pageLoading.
  const request = ++loadRevision
  pageLoading.value = true
  error.value = ''
  recommendApi.outfitWear().then(v => { if (request === loadRevision) wornDates.value = v }).catch(() => {})
  try { const outfits = await closetApi.outfits(); if (request === loadRevision) saved.value = outfits }
  catch (cause) { if (request === loadRevision) error.value = cause instanceof Error ? cause.message : '搭配列表暂时无法加载。' }
  finally { if (request === loadRevision) pageLoading.value = false }
}

function sceneSnapshot() { return elements.value.map((item) => ({ ...item })) }
function recordChange(next: OutfitElement[], cue: CueName = 'tap', source?: string) {
  if (props.board?.locked) return
  if (JSON.stringify(next) === JSON.stringify(elements.value)) return
  traceSource = source || changeSource(scene.value, { ...scene.value, elements: next })
  undoStack.value = [...undoStack.value.slice(-79), sceneSnapshot()]
  redoStack.value = []
  elements.value = next.map((item, index) => ({ ...item, zIndex: index }))
  playSound(cue)
  scheduleDraft()
}
function undo() {
  const previous = undoStack.value.at(-1)
  if (!previous) return
  redoStack.value = [...redoStack.value, sceneSnapshot()]
  undoStack.value = undoStack.value.slice(0, -1)
  traceSource = 'undo'
  elements.value = previous
  playSound('tap')
  scheduleDraft()
}
function redo() {
  const next = redoStack.value.at(-1)
  if (!next) return
  undoStack.value = [...undoStack.value, sceneSnapshot()]
  redoStack.value = redoStack.value.slice(0, -1)
  traceSource = 'redo'
  elements.value = next
  playSound('tap')
  scheduleDraft()
}

async function loadPeople() {
  loadingPeople.value = true; peopleError.value = ''
  try { personCatalog.value = await closetApi.personStickers() }
  catch (cause) { peopleError.value = cause instanceof Error ? cause.message : '人物贴纸暂时无法加载。' }
  finally { loadingPeople.value = false }
}
async function selectPerson(part: PersonPart, position?: { x: number; y: number }) {
  const request = loadRevision
  const limit = stickerLimit(elements.value, 'PERSON_PART')
  if (limit) { playSound('denied'); message.warning(limit); return }
  try {
    await loadOutfitImage(part.url)
    if (request !== loadRevision) return
    const laterLimit = stickerLimit(elements.value, 'PERSON_PART')
    if (laterLimit) { playSound('denied'); message.warning(laterLimit); return }
    const candidate = createPersonElement(part, elements.value.length, position)
    recordChange([...elements.value, candidate], 'pop'); selectElement(elementKey(candidate))
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '人物贴纸无法加载。') }
}
async function selectGarment(garment: Garment, position?: { x: number; y: number }) {
  if (addingGarments.has(garment.id)) return
  const existing = elements.value.find(item => item.kind !== 'PERSON_PART' && item.garmentId === garment.id)
  if (existing && !replacementTarget.value) {
    if (position) recordChange(elements.value.map(item => elementKey(item) === elementKey(existing) ? { ...item, ...position } : item))
    selectElement(elementKey(existing)); return
  }
  const target = replacementTarget.value
  const old = target ? elements.value.find(item => elementKey(item) === target) : null
  if (!old) { const limit = stickerLimit(elements.value, 'GARMENT'); if (limit) { playSound('denied'); message.warning(limit); return } }
  const request = loadRevision
  addingGarments.add(garment.id)
  try {
    const candidate = await createOutfitElement(garment, old ? elements.value.filter(item => elementKey(item) !== target) : elements.value)
    // The user may have switched outfit, left the page or changed the replace target while the image loaded.
    if (request !== loadRevision || !loaded || replacementTarget.value !== target) return
    if (!old) { const limit = stickerLimit(elements.value, 'GARMENT'); if (limit) { playSound('denied'); message.warning(limit); return } }
    const next = [...elements.value]
    if (old) {
      const index = next.findIndex(item => elementKey(item) === target)
      if (index < 0) return
      next[index] = { ...candidate, elementId: old.elementId, role: old.role, x: old.x, y: old.y, width: old.width, height: old.height, rotation: old.rotation, zIndex: old.zIndex, flipX: old.flipX, freeStretch: old.freeStretch }
    } else next.push({ ...candidate, ...position })
    recordChange((!old && !position && !outfitId.value ? arrangeOutfit({ version: OUTFIT_VERSION, elements: next }).elements : next.sort((a, b) => a.zIndex - b.zIndex)), 'pop')
    selectedId.value = old ? elementKey(old) : elementKey(candidate)
    replacementTarget.value = null
    if (old) pickerOpen.value = false
    await refreshImages(); await attachTransformer()
    message.success(old ? '已替换衣物，保留原来的布局。' : `${candidate.garmentLabel}已加入画板。`, 1.4)
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '衣物图片暂时无法加载。') }
  finally { addingGarments.delete(garment.id) }
}
function patchSelected(patch: Partial<OutfitElement>) {
  recordChange(elements.value.map(item => elementKey(item) === selectedId.value ? { ...item, ...patch } : item))
}
function duplicateSelected() {
  if (!selectedItems.value.length) return
  const next = [...elements.value], copies: OutfitElement[] = []
  for (const item of selectedItems.value) {
    const limit = stickerLimit(next, item.kind || 'GARMENT')
    if (limit) { playSound('denied'); message.warning(limit); return }
    const copy = copySticker(item, next.length)
    copies.push(copy); next.push(copy)
  }
  recordChange(next)
  selectedIds.value = copies.map(elementKey); selectedId.value = selectedIds.value.at(-1) || ''
  void attachTransformer()
}
function flipSelected() { batchFlip() }
function stretchSelected(value: boolean) { batchUpdate(item => ({ ...item, freeStretch: value })) }
function heightSelected(value: number) { if (currentItem.value?.freeStretch) patchSelected({ height: Math.max(24, Math.min(2700, value)) }) }
function cropSelected(crop: { x: number; y: number; width: number; height: number }) { patchSelected({ cropX: crop.x, cropY: crop.y, cropWidth: crop.width, cropHeight: crop.height }) }

function removeSelected() {
  if (!selectedId.value) return
  recordChange(elements.value.filter((item) => !selectedIds.value.includes(elementKey(item))))
  selectedId.value = ''
  replacementTarget.value = null
  inspectorOpen.value = false
  detachTransformer()
}
function moveLayer(direction: OutfitLayerMove) {
  const next = reorderOutfitElements(elements.value, selectedId.value, direction)
  if (next !== elements.value) recordChange(next, 'drop')
}
function changeRole(value: OutfitRole) {
  if (!currentItem.value) return
  recordChange(elements.value.map((item) => elementKey(item) === selectedId.value ? { ...item, role: value } : item))
}
function scaleSelected(factor: number) {
  if (!currentItem.value) return
  resizeSelected(currentItem.value.width * factor)
}
function resizeSelected(width: number) {
  if (!currentItem.value) return
  const item = currentItem.value
  if (item.freeStretch) { patchSelected({ width: Math.max(24, Math.min(2160, width)) }); return }
  const factor = Math.max(24 / Math.min(item.width, item.height), Math.min(width / item.width, 2160 / item.width, 2700 / item.height))
  recordChange(elements.value.map(value => elementKey(value) === selectedId.value ? { ...value, width: value.width * factor, height: value.height * factor } : value))
}
function rotateSelected(degrees: number) {
  if (!currentItem.value) return
  recordChange(elements.value.map((item) => elementKey(item) === selectedId.value
    ? { ...item, rotation: ((degrees % 360) + 360) % 360 } : item))
}
function positionSelected(axis: 'x' | 'y', value: number) {
  recordChange(elements.value.map(item => elementKey(item) === selectedId.value ? { ...item, [axis]: Math.max(0, Math.min(axis === 'x' ? OUTFIT_WIDTH : OUTFIT_HEIGHT, value)) } : item))
}
function startReplacement() {
  if (currentItem.value?.kind === 'PERSON_PART') return
  materialTab.value = 'garments'
  pickerVisible.value = true
  replacementTarget.value = selectedId.value
  inspectorOpen.value = false
  pickerOpen.value = true
  search.value = ''
  roleFilter.value = 'ALL'
}

function startGarmentDrag(event: DragEvent, garment: Garment) {
  if (compact.value || replacementTarget.value) { event.preventDefault(); return }
  dragGarmentId.value = garment.id
  event.dataTransfer?.setData('application/x-closet-garment', garment.id)
  event.dataTransfer?.setData('text/plain', garment.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = pickedIds.value.has(garment.id) ? 'move' : 'copy'
  closeContextMenu()
}
function startPersonDrag(event: DragEvent, part: PersonPart) {
  dragPart.value = part; dragGarmentId.value = ''
  event.dataTransfer?.setData('application/x-person-sticker', part.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
function endGarmentDrag() { dragPart.value = null; dragGarmentId.value = ''; dragOver.value = false }
function dragOverCanvas(event: DragEvent) {
  if (!dragGarmentId.value && !dragPart.value) return
  event.preventDefault()
  dragOver.value = true
  if (event.dataTransfer) event.dataTransfer.dropEffect = !dragPart.value && pickedIds.value.has(dragGarmentId.value) ? 'move' : 'copy'
}
function dropGarment(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  const garment = garments.value.find(item => item.id === dragGarmentId.value)
  const part = dragPart.value
  const bounds = stageFrame.value?.getBoundingClientRect()
  const position = bounds && outfitDropPosition(event.clientX, event.clientY, bounds)
  endGarmentDrag()
  if (part && position) void selectPerson(part, position)
  else if (part) message.info('请将贴纸放到白色画板内。')
  else if (garment && position) void selectGarment(garment, position)
  else if (garment) message.info('请将衣物放到白色画板内。')
  else if (event.dataTransfer?.files.length) message.info('先将照片录入衣柜，再加入搭配。')
}

function dropLayer(source: string, target: string, above: boolean) {
  const next = dropOutfitLayer(elements.value, source, target, above)
  if (next !== elements.value) recordChange(next, 'drop')
}
const shiftHeld = ref(false)
function transformKeys(event: KeyboardEvent) { shiftHeld.value = event.shiftKey }

function closeContextMenu() { contextTarget.value = '' }
function openContextMenu(event: MouseEvent, id: string) {
  playSound('switch')
  event.preventDefault()
  if (compact.value) { selectElement(id); inspectorOpen.value = true; return }
  const instance = elements.value.find(item => elementKey(item) === id || (item.kind !== 'PERSON_PART' && item.garmentId === id))
  if (instance) {
    if (!selectedIds.value.includes(elementKey(instance))) selectElement(elementKey(instance))
    else selectedId.value = elementKey(instance)
  }
  contextTarget.value = instance ? elementKey(instance) : id
  contextPosition.value = { x: Math.max(8, Math.min(event.clientX, window.innerWidth - 192)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 340)) }
  void nextTick(() => {
    const menu = contextMenu.value
    if (!menu) return
    const bounds = menu.getBoundingClientRect()
    contextPosition.value = { x: Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8)) }
    menu.querySelector<HTMLElement>('.ant-menu-item')?.focus()
  })
}
function canvasContextMenu(event: Konva.KonvaEventObject<MouseEvent>, item: OutfitElement) {
  event.cancelBubble = true
  openContextMenu(event.evt, elementKey(item))
}
function contextMenuClick(event: { key: string | number }) { contextAction(event.key) }
function contextAction(key: string | number) {
  const id = contextTarget.value
  const garment = contextGarment.value
  closeContextMenu()
  if (key === 'info') { void showInfo(id); return }
  if (key === 'add' && garment) { void selectGarment(garment); return }
  if (!selectedIds.value.includes(id)) selectElement(id)
  if (key === 'remove') removeSelected()
  else if (key === 'replace') startReplacement()
  else if (key === 'duplicate') duplicateSelected()
  else if (key === 'flip') flipSelected()
  else moveLayer(key as OutfitLayerMove)
}
async function showInfo(id = selectedId.value) {
  const item = elements.value.find(item => elementKey(item) === id)
  if (item?.kind === 'PERSON_PART') return
  id = item?.garmentId || id
  infoOpen.value = true
  infoLoading.value = true
  infoError.value = ''
  infoGarment.value = null
  try { infoGarment.value = garments.value.find(item => item.id === id) || await closetApi.detail(id) }
  catch (cause) { infoError.value = cause instanceof Error ? cause.message : '衣物信息暂时无法加载。' }
  finally { infoLoading.value = false }
}
function outsideMenu(event: Event) {
  if (!contextMenu.value?.contains(event.target as Node)) closeContextMenu()
}
function cancelLongPress() { window.clearTimeout(touchTimer) }
function beginTouch(event: Konva.KonvaEventObject<TouchEvent>, item: OutfitElement) {
  cancelLongPress()
  if (event.evt.touches.length !== 1) return
  if (!selectedIds.value.includes(elementKey(item))) selectElement(elementKey(item))
  touchTimer = window.setTimeout(() => { inspectorOpen.value = true; event.target.stopDrag() }, 500)
}
function touchStart(event: TouchEvent) {
  if (event.touches.length !== 2) return
  event.preventDefault()
  event.stopPropagation()
  cancelLongPress()
  transformer.value?.getNode().stopTransform()
  pinching.value = true
  for (const node of Object.values(nodeRefs)) node?.getNode().stopDrag()
  const [a, b] = Array.from(event.touches)
  pinchDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  pinchZoom = zoom.value
  const bounds = stageFrame.value?.getBoundingClientRect()
  if (bounds) pinchPoint = { x: ((a.clientX + b.clientX) / 2 - bounds.left) / bounds.width, y: ((a.clientY + b.clientY) / 2 - bounds.top) / bounds.height }
}
function touchMove(event: TouchEvent) {
  cancelLongPress()
  if (!pinching.value || event.touches.length !== 2 || !pinchDistance) return
  event.preventDefault()
  event.stopPropagation()
  const [a, b] = Array.from(event.touches)
  zoom.value = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, pinchZoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinchDistance))
  const midpoint = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
  const request = ++pinchMoveRevision
  void nextTick(() => {
    const bounds = stageFrame.value?.getBoundingClientRect()
    if (!bounds || !canvasArea.value || request !== pinchMoveRevision) return
    canvasArea.value.scrollLeft += bounds.left + bounds.width * pinchPoint.x - midpoint.x
    canvasArea.value.scrollTop += bounds.top + bounds.height * pinchPoint.y - midpoint.y
  })
}
function touchEnd(event: TouchEvent) {
  cancelLongPress()
  if (pinching.value) { event.preventDefault(); event.stopPropagation() }
  pinching.value = false
}
function showHelp() {
  modal.info({ title: '画板操作', content: compact.value ? '点选贴纸后拖动，拖动四角等比缩放。双指缩放或移动查看画板，双击或长按贴纸打开调整抽屉。点击适应屏幕可恢复完整画板。' : '拖动四角等比缩放，拖动边缘调整宽高；Shift 临时切换等比与自由拉伸，Alt 从中心缩放。拖动顶部圆点旋转，Shift 按 15° 吸附。Shift / Ctrl / ⌘ 点击贴纸可多选，图层勾选可多选，Ctrl/⌘ + A 全选。图层拖动把手可排序，把手聚焦后用上下键排序。普通滚轮移动视图，Shift + 滚轮横向移动，Ctrl/⌘ + 滚轮以鼠标位置缩放。按住空格或鼠标中键拖动视图，也可切换手形工具。衣柜与属性面板可分别收起，专注画板可同时收起两栏。右键管理贴纸，方向键微调；Ctrl/⌘ + Z 撤销，Ctrl/⌘ + S 保存，Delete 移除。', okText: '知道了' })
}

function toggleFocus() {
  const show = focusedView.value
  pickerVisible.value = show
  inspectorVisible.value = show
}
function viewAnchor(x?: number, y?: number) {
  const area = canvasArea.value, frame = stageFrame.value
  if (!area || !frame) return null
  const viewport = area.getBoundingClientRect(), board = frame.getBoundingClientRect()
  const clientX = x ?? viewport.left + area.clientWidth / 2
  const clientY = y ?? viewport.top + area.clientHeight / 2
  return { clientX, clientY, x: (clientX - board.left) / board.width, y: (clientY - board.top) / board.height }
}
async function restoreViewAnchor(anchor: ReturnType<typeof viewAnchor>) {
  const request = ++viewRevision
  await nextTick()
  if (!anchor || request !== viewRevision || !canvasArea.value || !stageFrame.value) return
  const bounds = stageFrame.value.getBoundingClientRect()
  canvasArea.value.scrollLeft += bounds.left + bounds.width * anchor.x - anchor.clientX
  canvasArea.value.scrollTop += bounds.top + bounds.height * anchor.y - anchor.clientY
}
function zoomView(value: number, x?: number, y?: number) {
  const anchor = viewAnchor(x, y)
  zoom.value = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, value))
  void restoreViewAnchor(anchor)
}
async function fitView() {
  ++viewRevision
  zoom.value = 1
  await nextTick()
  if (canvasArea.value) {
    canvasArea.value.scrollLeft = (viewGeometry.value.spaceWidth - canvasArea.value.clientWidth) / 2
    canvasArea.value.scrollTop = (viewGeometry.value.spaceHeight - canvasArea.value.clientHeight) / 2
  }
}
function canvasWheel(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    zoomView(outfitWheelZoom(zoom.value, event.deltaY, event.deltaMode, availableHeight.value), event.clientX, event.clientY)
  } else if (event.shiftKey && canvasArea.value) {
    event.preventDefault()
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? availableWidth.value : 1
    canvasArea.value.scrollLeft += (event.deltaX || event.deltaY) * unit
  }
}
function beginViewDrag(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !(event.button === 1 || (event.button === 0 && (panTool.value || spacePressed.value))) || !canvasArea.value) return
  event.preventDefault()
  event.stopPropagation()
  closeContextMenu()
  panOrigin = { id: event.pointerId, x: event.clientX, y: event.clientY, left: canvasArea.value.scrollLeft, top: canvasArea.value.scrollTop }
  draggingView.value = true
  canvasArea.value.setPointerCapture(event.pointerId)
}
function moveViewDrag(event: PointerEvent) {
  if (!panOrigin || event.pointerId !== panOrigin.id || !canvasArea.value) return
  event.preventDefault()
  event.stopPropagation()
  canvasArea.value.scrollLeft = panOrigin.left - event.clientX + panOrigin.x
  canvasArea.value.scrollTop = panOrigin.top - event.clientY + panOrigin.y
}
function endViewDrag(event: PointerEvent) {
  if (!panOrigin || event.pointerId !== panOrigin.id) return
  event.preventDefault()
  event.stopPropagation()
  panOrigin = null
  draggingView.value = false
  if (canvasArea.value?.hasPointerCapture(event.pointerId)) canvasArea.value.releasePointerCapture(event.pointerId)
}
function resetViewDrag() { shiftHeld.value = false; panOrigin = null; draggingView.value = false; spacePressed.value = false }
function keyUp(event: KeyboardEvent) { transformKeys(event); if (event.code === 'Space') spacePressed.value = false }

function bindNode(id: string, node: unknown) {
  nodeRefs[id] = node as { getNode: () => Konva.Group } | null
}
async function attachTransformer() {
  await nextTick()
  const tool = transformer.value?.getNode()
  if (tool) { tool.nodes(selectedIds.value.map(id => nodeRefs[id]?.getNode()).filter((value): value is Konva.Group => !!value)); tool.getLayer()?.batchDraw() }
}
function detachTransformer() {
  const tool = transformer.value?.getNode()
  if (tool) { tool.nodes([]); tool.getLayer()?.batchDraw() }
}
function selectElement(id: string, additive = false, range = false) {
  if (range && selectedId.value) {
    const keys = elements.value.map(elementKey), a = keys.indexOf(selectedId.value), b = keys.indexOf(id)
    selectedIds.value = [...new Set([...selectedIds.value, ...keys.slice(Math.min(a, b), Math.max(a, b) + 1)])]
  } else if (additive) selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(key => key !== id) : [...selectedIds.value, id]
  else selectedIds.value = [id]
  selectedId.value = selectedIds.value.includes(id) ? id : selectedIds.value.at(-1) || ''
  void attachTransformer()
}
function clearSelection() { selectedIds.value = []; selectedId.value = ''; detachTransformer() }
function selectAll() { selectedIds.value = elements.value.map(elementKey); selectedId.value = selectedIds.value.at(-1) || ''; void attachTransformer() }
function selectLayer(id: string, additive = false, range = false) { selectElement(id, additive, range) }
function batchUpdate(update: (item: OutfitElement) => OutfitElement) {
  recordChange(elements.value.map(item => selectedIds.value.includes(elementKey(item)) ? update(item) : item))
}
function batchRotate(angle: number, relative = false) { batchUpdate(item => ({ ...item, rotation: (((relative ? item.rotation + angle : angle) % 360) + 360) % 360 })) }
function batchScale(factor: number) {
  const safe = Math.max(...selectedItems.value.map(item => 24 / Math.min(item.width, item.height)), Math.min(factor, ...selectedItems.value.flatMap(item => [2160 / item.width, 2700 / item.height])))
  batchUpdate(item => ({ ...item, width: item.width * safe, height: item.height * safe }))
}
function batchOffset(x: number, y: number) {
  const items = selectedItems.value
  if (!items.length) return
  x = Math.max(-Math.min(...items.map(item => item.x)), Math.min(x, OUTFIT_WIDTH - Math.max(...items.map(item => item.x))))
  y = Math.max(-Math.min(...items.map(item => item.y)), Math.min(y, OUTFIT_HEIGHT - Math.max(...items.map(item => item.y))))
  batchUpdate(item => ({ ...item, x: item.x + x, y: item.y + y }))
}
function batchFlip() { batchUpdate(item => ({ ...item, flipX: !item.flipX })) }

function stageClick(event: { target: Konva.Node; targetNode?: Konva.Node; evt?: MouseEvent | TouchEvent }) {
  // Konva also emits click for the right button, after opening the context menu.
  if (event.evt && 'button' in event.evt && event.evt.button !== 0) return
  closeContextMenu()
  const target = event.targetNode || event.target
  if (target === target.getStage()) { if (selectedId.value) playSound('tick'); selectedId.value = ''; detachTransformer() }
}
function clampPosition(position: { x: number; y: number }) {
  return { x: Math.max(0, Math.min(stageWidth.value, position.x)), y: Math.max(0, Math.min(stageHeight.value, position.y)) }
}
let dragOrigins: { id: string; x: number; y: number }[] = []
function startSelectionDrag(event: { target: Konva.Group }, item: OutfitElement) {
  cancelLongPress()
  if (!selectedIds.value.includes(elementKey(item))) selectElement(elementKey(item))
  dragOrigins = selectedItems.value.map(value => ({ id: elementKey(value), x: value.x * canvasScale.value, y: value.y * canvasScale.value }))
}
function moveSelectionDrag(event: { target: Konva.Group }, item: OutfitElement) {
  const origin = dragOrigins.find(value => value.id === elementKey(item))
  if (!origin) return
  const dx = Math.max(-Math.min(...dragOrigins.map(value => value.x)), Math.min(event.target.x() - origin.x, stageWidth.value - Math.max(...dragOrigins.map(value => value.x))))
  const dy = Math.max(-Math.min(...dragOrigins.map(value => value.y)), Math.min(event.target.y() - origin.y, stageHeight.value - Math.max(...dragOrigins.map(value => value.y))))
  for (const value of dragOrigins) nodeRefs[value.id]?.getNode().position({ x: value.x + dx, y: value.y + dy })
}
function dragEnd(event: { target: Konva.Group }, item: OutfitElement) {
  cancelLongPress()
  moveSelectionDrag(event, item)
  const ids = dragOrigins.map(value => value.id)
  recordChange(elements.value.map(value => {
    const node = nodeRefs[elementKey(value)]?.getNode()
    return ids.includes(elementKey(value)) && node ? { ...value, x: node.x() / canvasScale.value, y: node.y() / canvasScale.value } : value
  }), 'drop')
  dragOrigins = []
}
function previewRotation(angle: number) {
  const node = nodeRefs[selectedId.value]?.getNode()
  if (node) { node.rotation(angle); node.getLayer()?.batchDraw() }
}
let committingTransform = false
function transformEnd(_event: { target: Konva.Group }, _item: OutfitElement) {
  // Konva emits one event per selected node; capture all nodes before resetting any scale.
  if (committingTransform) return
  committingTransform = true
  const next = elements.value.map(value => {
    const node = nodeRefs[elementKey(value)]?.getNode()
    if (!node || !selectedIds.value.includes(elementKey(value))) return value
    return { ...value, x: Math.min(OUTFIT_WIDTH, Math.max(0, node.x() / canvasScale.value)), y: Math.min(OUTFIT_HEIGHT, Math.max(0, node.y() / canvasScale.value)),
      width: Math.min(2160, Math.max(24, value.width * node.scaleX())), height: Math.min(2700, Math.max(24, value.height * node.scaleY())),
      rotation: ((node.rotation() % 360) + 360) % 360 }
  })
  for (const id of selectedIds.value) nodeRefs[id]?.getNode().scale({ x: 1, y: 1 })
  recordChange(next)
  void nextTick(() => { committingTransform = false; void attachTransformer() })
}
function styleTransformAnchor(anchor: Konva.Rect) {
  anchor.hitStrokeWidth(compact.value ? 24 : 8)
  if (anchor.hasName('rotater')) { anchor.cornerRadius(12); anchor.fill(accentColor.value) }
}

async function refreshImages() {
  const request = ++imageLoadRevision
  const next: Record<string, HTMLImageElement> = {}
  const failures: string[] = []
  await Promise.all(elements.value.map(async (item) => {
    try { next[item.assetUrl] = await loadOutfitImage(item.assetUrl) }
    catch { failures.push(item.assetUrl) }
  }))
  if (request === imageLoadRevision) { imageMap.value = next; failedImage.value = failures[0] || '' }
}
function retryImage(url: string) {
  failedImage.value = ''
  void loadOutfitImage(url).then(() => refreshImages()).catch(() => { failedImage.value = url })
}

async function saveOutfit() {
  if (props.board) { persistDraft(); await props.saveBoard?.(); return }
  if (saving.value) return
  if (!name.value.trim() || name.value.trim().length > 100) { message.warning('搭配名称需为 1 到 100 个字符。'); return }
  if (!elements.value.length) { message.warning('先加入一张衣物或人物贴纸。'); return }
  if (failedImage.value) { message.error('请先重新加载无法打开的贴纸图片，再保存。'); return }
  persistDraft()
  const request = loadRevision
  const submitted = JSON.stringify({ name: name.value, elements: elements.value })
  saving.value = true
  try {
    const result = await closetApi.saveOutfit(isNew.value ? null : outfitId.value, isNew.value ? null : revision.value,
      name.value.trim(), scene.value)
    if (request !== loadRevision) { window.dispatchEvent(new Event('closet-outfit-saved')); return }
    // Edits made while the request was in flight stay on the canvas and in the draft, against the new revision.
    const editedMeanwhile = JSON.stringify({ name: name.value, elements: elements.value }) !== submitted
    loaded = false
    localStorage.removeItem(draftKey.value)
    outfitId.value = result.id
    revision.value = result.revision
    draftRevision = result.revision
    baselineSignature = JSON.stringify({ name: result.name, elements: result.scene.elements })
    if (editedMeanwhile) {
      try { localStorage.setItem(draftKeyFor(result.id), JSON.stringify({ name: name.value, revision: result.revision, scene: scene.value, savedAt: Date.now() })) }
      catch { /* The newer edits remain on the canvas even without local storage. */ }
      localDraftNotice.value = true
    } else {
      elements.value = result.scene.elements
      name.value = result.name
      localDraftNotice.value = false
    }
    remoteConflict.value = false
    if (isNew.value) await router.replace(`/outfits/${result.id}`)
    else loaded = true
    playSound('success')
    window.dispatchEvent(new Event('closet-outfit-saved'))
    message.success(editedMeanwhile ? '已保存提交时的版本，之后的修改仍保留在此设备，记得再次保存。' : '搭配已保存，可在手机和电脑继续编辑。')
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : '搭配暂时无法保存。'
    if (request !== loadRevision) { message.error(text); return }
    if (/已在另一处更新|版本|conflict/i.test(text)) remoteConflict.value = true
    error.value = text
    playSound('denied')
    message.error(text)
  } finally { saving.value = false }
}

function loadLatest() {
  localStorage.removeItem(draftKey.value)
  void loadPage()
}
function saveConflictAsCopy() {
  const copy = sceneSnapshot()
  const sourceName = name.value
  router.replace('/outfits/new').then(() => {
    name.value = `${sourceName} 副本`.slice(0, 100)
    elements.value = copy
    revision.value = null
    draftRevision = null
    remoteConflict.value = false
    undoStack.value = []; redoStack.value = []
    loaded = true
    scheduleDraft()
  })
}
function startCopy(outfit: Outfit) {
  const draftKeyValue = `yixu.outfit-draft.v1:${closet.user?.username || 'anonymous'}:new`
  localStorage.setItem(draftKeyValue, JSON.stringify({ name: `${outfit.name} 副本`.slice(0, 100), revision: null, scene: outfit.scene, savedAt: Date.now() }))
  void router.push('/outfits/new')
}
function confirmDelete(outfit: Outfit) {
  modal.confirm({
    title: '删除这套搭配？',
    content: '搭配会从列表中移除，衣柜中的衣物和图片不会受影响。',
    okText: '删除搭配', cancelText: '保留搭配', okButtonProps: { danger: true },
    onOk: async () => {
      try { await closetApi.deleteOutfit(outfit.id, outfit.revision); saved.value = saved.value.filter((item) => item.id !== outfit.id); playSound('tap'); message.success('搭配已删除。') }
      catch (cause) { message.error(cause instanceof Error ? cause.message : '搭配暂时无法删除。') }
    },
  })
}
async function exportPng() {
  if (!elements.value.length || failedImage.value) { message.warning('先加载全部贴纸图片，再导出穿搭图。'); return }
  exporting.value = true
  try { await downloadOutfitPng({ elements: sceneSnapshot() }, name.value); playSound('complete'); message.success('穿搭图片已导出。') }
  catch (cause) { playSound('denied'); message.error(cause instanceof Error ? cause.message : '穿搭图片导出失败。') }
  finally { exporting.value = false }
}
async function resetLayout() {
  if (!elements.value.length || props.board?.locked) return
  recordChange(arrangeOutfit(scene.value).elements, 'tap', 'default-layout')
  clearSelection()
}

function handleKeyboard(event: KeyboardEvent) {
  transformKeys(event)
  if (!editing.value || props.board?.locked) return
  if (event.key === 'Escape') {
    if (contextTarget.value) { closeContextMenu(); return }
    if (infoOpen.value) { infoOpen.value = false; return }
    if (pickerOpen.value) { pickerOpen.value = false; replacementTarget.value = null; return }
    if (inspectorOpen.value) { inspectorOpen.value = false; return }
    if (layersOpen.value) { layersOpen.value = false; return }
    selectedId.value = ''; detachTransformer()
    return
  }
  const modifier = event.metaKey || event.ctrlKey
  if (modifier && event.key.toLowerCase() === 'a' && !(event.target as HTMLElement)?.closest('input,textarea,[contenteditable="true"]')) { event.preventDefault(); selectAll(); playSound('tick'); return }
  if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); if (!saving.value && !remoteConflict.value) void saveOutfit(); return }
  if (event.code === 'Space' && hoveringView.value && !(event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"],[role="combobox"]') && !pickerOpen.value && !inspectorOpen.value && !layersOpen.value && !infoOpen.value) {
    event.preventDefault(); spacePressed.value = true; return
  }
  if ((event.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable="true"],[role="combobox"],[role="slider"],[role="menu"]')) return
  if (pickerOpen.value || inspectorOpen.value || layersOpen.value || infoOpen.value) return
  if (event.code === 'Space') { event.preventDefault(); spacePressed.value = true; return }
  if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
  else if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected() }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); batchOffset(-(event.shiftKey ? 10 : 2), 0) }
  else if (event.key === 'ArrowRight') { event.preventDefault(); batchOffset((event.shiftKey ? 10 : 2), 0) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); batchOffset(0, -(event.shiftKey ? 10 : 2)) }
  else if (event.key === 'ArrowDown') { event.preventDefault(); batchOffset(0, (event.shiftKey ? 10 : 2)) }
}

function measureCanvas() {
  if (!canvasArea.value) return
  const area = canvasArea.value
  if (!area.clientWidth || !area.clientHeight) return
  const first = measuredViewport !== area
  const anchor = viewAnchor()
  availableWidth.value = area.clientWidth
  availableHeight.value = area.clientHeight
  measuredViewport = area
  if (first || zoom.value === 1) void fitView()
  else void restoreViewAnchor(anchor)
}
function screenChanged() { compact.value = window.matchMedia('(max-width: 1023px)').matches; closeContextMenu(); measureCanvas() }
onBeforeRouteLeave(() => { persistDraft(); loaded = false })
onBeforeRouteUpdate(() => { persistDraft() })
watch(() => [route.params.id, route.query.draft], async () => {
  if (props.board) return
  if (route.params.id) await loadPage()
  else await loadLibrary()
})
watch(() => JSON.stringify({ name: name.value, elements: elements.value }), (signature) => {
  if (!loaded) return
  if (props.board) { persistDraft(); return }
  if (signature === baselineSignature) {
    window.clearTimeout(draftTimer)
    localStorage.removeItem(draftKey.value)
    localDraftNotice.value = false
    return
  }
  scheduleDraft()
})
watch(() => elements.value.map((item) => item.assetUrl).join('|'), () => { void refreshImages() }, { immediate: true })
watch(selectedId, id => { if (!id) selectedIds.value = []; else if (!selectedIds.value.includes(id)) selectedIds.value = [id]; void attachTransformer() })
watch(selectedIds, () => { void attachTransformer() })
watch(elements, () => {
  selectedIds.value = selectedIds.value.filter(id => elements.value.some(item => elementKey(item) === id))
  if (!selectedIds.value.includes(selectedId.value)) selectedId.value = selectedIds.value.at(-1) || ''
  if (selectedId.value && !currentItem.value) { selectedId.value = ''; inspectorOpen.value = false }
  void attachTransformer()
}, { deep: true })
watch(canvasArea, (area, previous) => {
  if (previous) resizeObserver?.unobserve(previous)
  if (area) {
    resizeObserver ||= new ResizeObserver(measureCanvas)
    resizeObserver.observe(area)
    void nextTick(measureCanvas)
  }
})
onMounted(() => {
  if (route.params.id) void loadPage()
  else void loadLibrary()
  if (closet.isSignedIn) { void loadGarments(); void loadPeople() }
  if (!props.board) canvasBridge.value = {
    context: () => ({ route: route.path, outfitId: String(route.params.id || ''), name: name.value, revision: revision.value, selectedIds: [...selectedIds.value], ...(currentItem.value?.kind !== 'PERSON_PART' && currentItem.value?.garmentId ? { garmentId: currentItem.value.garmentId } : {}), ...(editing.value && !pageLoading.value ? { scene: scene.value } : {}) }),
    apply: (next, title) => { if (!loaded || !editing.value) throw new Error('画布尚未就绪。'); recordChange(next.elements.map(item => ({ ...item }))); if (title) name.value = title; persistDraft() },
    save: async () => { error.value = ''; await saveOutfit(); if (error.value || remoteConflict.value) throw new Error(error.value || '搭配版本冲突。') },
  }
  window.addEventListener('keydown', handleKeyboard)
  window.addEventListener('keyup', keyUp)
  window.addEventListener('blur', resetViewDrag)
  window.addEventListener('pagehide', persistDraft)
  window.addEventListener('resize', screenChanged)
  window.addEventListener('pointerdown', outsideMenu)
  window.addEventListener('scroll', closeContextMenu, true)
  measureCanvas()
})
onUnmounted(() => {
  if (!props.board) canvasBridge.value = null
  window.clearTimeout(draftTimer)
  cancelLongPress()
  if (loaded) persistDraft()
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleKeyboard)
  window.removeEventListener('keyup', keyUp)
  window.removeEventListener('blur', resetViewDrag)
  window.removeEventListener('pagehide', persistDraft)
  window.removeEventListener('resize', screenChanged)
  window.removeEventListener('pointerdown', outsideMenu)
  window.removeEventListener('scroll', closeContextMenu, true)
})
watch(() => [props.board?.contentVersion, props.board?.locked, props.board?.savedSignature], () => {
  if (!props.board || !loaded) return
  const board = props.board
  synchronizingBoard = true
  if (JSON.stringify(board.scene.elements) !== JSON.stringify(elements.value)) {
    elements.value = board.scene.elements.map(e => ({ ...e })); undoStack.value = board.undo; redoStack.value = board.redo
  }
  name.value = board.name; outfitId.value = board.outfitId || ''; revision.value = board.revision
  undoStack.value = board.undo; redoStack.value = board.redo
  localDraftNotice.value = !board.savedSignature || JSON.stringify({ name: board.name, scene: board.scene }) !== board.savedSignature
  void nextTick(() => { synchronizingBoard = false })
}, { flush: 'sync' })
watch([selectedIds, zoom], () => { if (props.board && loaded) persistDraft() }, { deep: true })
defineExpose({ flush: persistDraft, exportPng })
</script>

<template>
  <div v-if="!editing" class="outfit-library-page">
    <div class="page-heading outfit-library-heading"><div><h1>穿搭组合台</h1><p class="page-subtitle">从自己的衣柜选单品，保存一套随时可以穿的搭配。</p></div><div><a-button @click="router.push('/outfits/workspace')">打开多画板工作区</a-button><a-button type="primary" @click="router.push('/outfits/new')"><PlusOutlined /> 新建搭配</a-button></div></div>
    <RecommendationStrip />
    <a-alert v-if="error" type="error" show-icon :message="error" class="outfit-alert"><template #action><a-button @click="loadLibrary">重新加载</a-button></template></a-alert>
    <a-skeleton v-if="pageLoading" active :paragraph="{ rows: 7 }" />
    <template v-else-if="saved.length">
      <div class="outfit-library-toolbar"><a-input v-model:value="librarySearch" allow-clear placeholder="搜索搭配名称" aria-label="搜索搭配"><template #prefix><SearchOutlined /></template></a-input><span class="muted">{{ displayedOutfits.length }} 套搭配 · 最近更新</span></div>
      <section v-if="displayedOutfits.length" class="outfit-library-grid" aria-label="已保存的穿搭">
        <article v-for="outfit in displayedOutfits" :key="outfit.id" class="outfit-card">
          <RouterLink :to="`/outfits/${outfit.id}`" class="outfit-card-preview" @click="playSound('tap')"><OutfitThumbnail :scene="outfit.scene" :title="outfit.name" /><a-tag class="outfit-card-count">{{ outfit.scene.elements.length }} 张贴纸</a-tag><a-tag v-if="outfit.scene.elements.some(item => item.garmentChanged || item.garmentStatus === 'TRASHED')" color="warning" class="outfit-card-status">衣物有更新</a-tag></RouterLink>
          <div class="outfit-card-details"><div><RouterLink :to="`/outfits/${outfit.id}`" class="outfit-card-name">{{ outfit.name }}</RouterLink><span>{{ new Date(outfit.updatedAtMs).toLocaleDateString() }} 更新<template v-if="wornLabel(outfit.id)"> · {{ wornLabel(outfit.id) }}</template></span></div><a-dropdown :trigger="['click']"><a-button type="text" aria-label="搭配更多操作"><MoreOutlined /></a-button><template #overlay><a-menu><a-menu-item @click="router.push(`/outfits/${outfit.id}`)">编辑搭配</a-menu-item><a-menu-item @click="startCopy(outfit)"><CopyOutlined /> 复制搭配</a-menu-item><a-menu-item :disabled="wearing" @click="wearOutfit(outfit.id)"><CheckOutlined /> 今天穿了这套</a-menu-item><a-menu-divider /><a-menu-item danger @click="confirmDelete(outfit)"><DeleteOutlined /> 删除搭配</a-menu-item></a-menu></template></a-dropdown></div>
        </article>
      </section>
      <a-empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" description="没有找到这套搭配"><a-button @click="librarySearch = ''">清除搜索</a-button></a-empty>
    </template>
    <section v-else-if="!error" class="outfit-empty"><a-empty description="把第一套穿搭放上画板"><template #image><PictureOutlined /></template><p>选一件上衣、一条裤子，再加上喜欢的配饰。</p><a-button type="primary" @click="router.push('/outfits/new')"><PlusOutlined /> 开始搭配</a-button></a-empty></section>
  </div>

  <a-skeleton v-else-if="pageLoading" active :paragraph="{ rows: 10 }" />
  <div v-else-if="error && !loaded" class="outfit-editor-error"><a-alert type="error" show-icon :message="error" /><a-button @click="loadPage"><ReloadOutlined /> 重新加载画板</a-button><RouterLink to="/outfits"><a-button type="link">返回搭配列表</a-button></RouterLink></div>
  <div v-else class="outfit-editor-page" :inert="props.board?.locked ? true : undefined">
    <header v-if="!props.board" class="outfit-editor-header">
      <div class="outfit-editor-title"><a-tooltip v-if="!props.board" title="返回搭配列表，草稿会自动保留"><a-button aria-label="返回搭配列表" @click="router.push('/outfits')"><ArrowLeftOutlined /></a-button></a-tooltip><div class="outfit-title-field"><a-input v-model:value="name" maxlength="100" aria-label="搭配名称" placeholder="给搭配起个名字" /></div><a-tooltip :title="saveState"><span class="outfit-save-state" role="status"><CheckOutlined v-if="localDraftNotice || (!isNew && !hasChanges)" />{{ localDraftNotice ? '本机草稿' : !isNew && !hasChanges ? '已保存' : '未保存' }}</span></a-tooltip></div>
      <div class="outfit-header-actions"><SoundToggle /><a-button v-if="!isNew && !hasChanges && !remoteConflict" :loading="wearing" @click="wearOutfit(outfitId)"><CheckOutlined /> 今天穿了</a-button><a-button @click="reviewOpen=true">穿搭检查</a-button><a-button :disabled="isNew || hasChanges || !!remoteConflict" title="请先保存当前修改，再生成 OOTD" @click="router.push({ path: '/ootd', query: { outfit: outfitId } })">OOTD</a-button><a-button class="outfit-desktop-export" :loading="exporting" :disabled="!dirty || !!failedImage" @click="exportPng"><DownloadOutlined /> 导出图片</a-button><a-button type="primary" aria-label="保存搭配" :loading="saving" :disabled="!dirty || remoteConflict" @click="saveOutfit"><SaveOutlined /><span>{{ compact ? '保存' : '保存搭配' }}</span></a-button></div>
    </header>
    <a-alert v-if="!props.board && actualRoute.query.from === 'recommend'" type="info" show-icon closable class="outfit-alert" message="来自推荐 · 这是一份草稿，保存前可以随意调整"><template v-if="typeof actualRoute.query.run === 'string' && typeof actualRoute.query.key === 'string'" #action><ExplainButton :run-id="actualRoute.query.run" :outfit-key="actualRoute.query.key" label="查看依据" /></template></a-alert>
    <a-alert v-if="remoteConflict" type="warning" show-icon message="另一处已更新这套搭配，你的草稿仍保留。" class="outfit-alert"><template #action><div class="outfit-conflict-actions"><a-button @click="loadLatest">重新加载</a-button><a-button type="primary" @click="saveConflictAsCopy">另存副本</a-button></div></template></a-alert>
    <a-alert v-else-if="error" type="error" show-icon closable :message="error" class="outfit-alert" @close="error = ''" />
    <div class="outfit-editor-layout">
      <aside v-show="pickerVisible" class="outfit-picker-panel" aria-label="选择贴纸"><div class="outfit-panel-heading"><h2>贴纸素材</h2><a-tag>{{ materialTab === 'people' ? (personCatalog?.sets.reduce((count, set) => count + set.parts.length, 0) || 0) : activeGarments.length }} 张</a-tag></div><a-segmented v-model:value="materialTab" block :disabled="!!replacementTarget" :options="[{ value: 'garments', label: '我的衣物' }, { value: 'people', label: '人物贴纸' }]" class="outfit-material-tabs" /><OutfitPersonPicker v-if="materialTab === 'people'" :catalog="personCatalog" :loading="loadingPeople" :error="peopleError" :mobile="compact" @select="selectPerson" @dragstart="startPersonDrag" @dragend="endGarmentDrag" @retry="loadPeople" /><OutfitGarmentPicker v-else v-model:search="search" v-model:role="roleFilter" :garments="filteredGarments" :loading="loadingGarments" :error="garmentError" :picked-ids="pickedIds" :selected-id="currentItem?.garmentId || ''" :replacing="!!replacementTarget" @select="selectGarment" @context="(event, garment) => openContextMenu(event, garment.id)" @dragstart="startGarmentDrag" @dragend="endGarmentDrag" @cancel="replacementTarget = null" @retry="loadGarments" /></aside>

      <section class="outfit-canvas-area" aria-label="搭配画板" @contextmenu.prevent @dragover.prevent="dragOverCanvas" @drop="dropGarment">
        <div class="outfit-editor-toolbar">
          <div class="outfit-history-actions">
            <a-tooltip title="撤销 · Ctrl/⌘ + Z"><a-button type="text" :disabled="!undoStack.length" aria-label="撤销" @click="undo"><UndoOutlined /></a-button></a-tooltip>
            <a-tooltip title="重做 · Ctrl/⌘ + Shift + Z"><a-button type="text" :disabled="!redoStack.length" aria-label="重做" @click="redo"><RedoOutlined /></a-button></a-tooltip>
            <div class="outfit-desktop-view-tools">
              <a-tooltip :title="pickerVisible ? '收起衣柜' : '展开衣柜'"><a-button type="text" :class="{ 'is-active': pickerVisible }" aria-label="切换衣柜面板" :aria-pressed="pickerVisible" @click="pickerVisible = !pickerVisible"><PictureOutlined /></a-button></a-tooltip>
              <a-tooltip :title="inspectorVisible ? '收起属性' : '展开属性'"><a-button type="text" :class="{ 'is-active': inspectorVisible }" aria-label="切换属性面板" :aria-pressed="inspectorVisible" @click="inspectorVisible = !inspectorVisible"><ControlOutlined /></a-button></a-tooltip>
              <a-tooltip title="专注画板"><a-button type="text" :class="{ 'is-active': focusedView }" aria-label="专注画板" :aria-pressed="focusedView" @click="toggleFocus"><FullscreenOutlined /></a-button></a-tooltip>
              <a-tooltip title="移动视图 · 空格 / 鼠标中键"><a-button type="text" :class="{ 'is-active': panTool }" aria-label="移动视图工具" :aria-pressed="panTool" @click="panTool = !panTool"><DragOutlined /></a-button></a-tooltip>
            </div>
          </div>
          <div class="outfit-zoom-controls">
            <a-button type="text" :disabled="zoom <= MIN_VIEW_ZOOM" aria-label="缩小画板" @click="zoomView(zoom / 1.2)"><MinusOutlined /></a-button>
            <a-tooltip title="相对适应屏幕的缩放比例"><span>{{ Math.round(zoom * 100) }}%</span></a-tooltip>
            <a-button type="text" :disabled="zoom >= MAX_VIEW_ZOOM" aria-label="放大画板" @click="zoomView(zoom * 1.2)"><PlusOutlined /></a-button>
            <a-tooltip title="适应屏幕并居中"><a-button type="text" aria-label="适应屏幕" @click="fitView"><ExpandOutlined /></a-button></a-tooltip>
            <a-tooltip title="操作帮助"><a-button class="outfit-desktop-help" type="text" aria-label="画板操作帮助" @click="showHelp"><QuestionCircleOutlined /></a-button></a-tooltip>
          </div>
        </div>
        <div ref="canvasArea" class="outfit-canvas-scroll" :class="{ 'pan-ready': panTool || spacePressed, 'is-panning': draggingView }" tabindex="0" aria-label="画板视图，可滚动或使用 Ctrl/⌘ 加滚轮缩放" @pointerenter="hoveringView = true" @pointerleave="hoveringView = false" @wheel="canvasWheel" @touchstart.capture="touchStart" @touchmove.capture="touchMove" @touchend.capture="touchEnd" @touchcancel.capture="touchEnd" @pointerdown.capture="beginViewDrag" @pointermove.capture="moveViewDrag" @pointerup.capture="endViewDrag" @pointercancel.capture="endViewDrag" @lostpointercapture="panOrigin = null; draggingView = false"><div class="outfit-canvas-space" :style="{ width: `${viewGeometry.spaceWidth}px`, height: `${viewGeometry.spaceHeight}px` }"><div ref="stageFrame" class="outfit-stage-frame" :class="{ 'is-drop-target': dragOver }" :style="{ width: `${stageWidth}px`, height: `${stageHeight}px` }" @dragover="dragOverCanvas" @dragleave="dragOver = false" @drop="dropGarment">
          <v-stage :config="{ width: stageWidth, height: stageHeight }" @click="stageClick" @tap="stageClick">
            <v-layer>
              <v-rect :config="{ x: 0, y: 0, width: stageWidth, height: stageHeight, fill: '#ffffff', listening: false }" />
              <v-group v-for="item in elements" :key="elementKey(item)" :ref="(node: unknown) => bindNode(elementKey(item), node)" :config="{ x: item.x * canvasScale, y: item.y * canvasScale, rotation: item.rotation, draggable: !pinching, name: `outfit-${elementKey(item)}`, dragBoundFunc: clampPosition }"
                @click="playSound('tick'); selectElement(elementKey(item), $event.evt.shiftKey || $event.evt.ctrlKey || $event.evt.metaKey, $event.evt.shiftKey)" @tap="playSound('tick'); selectElement(elementKey(item))" @dbltap="selectElement(elementKey(item)); inspectorOpen = true" @contextmenu="canvasContextMenu($event, item)" @touchstart="beginTouch($event, item)" @touchmove="cancelLongPress" @touchend="cancelLongPress" @dragstart="startSelectionDrag($event, item)" @dragmove="moveSelectionDrag($event, item)" @dragend="dragEnd($event, item)" @transformend="transformEnd($event, item)">
                <v-image :config="{ image: imageMap[item.assetUrl], scaleX: item.flipX ? -1 : 1, x: (item.flipX ? 1 : -1) * item.width * canvasScale / 2, y: -item.height * canvasScale / 2, width: item.width * canvasScale, height: item.height * canvasScale, crop: { x: item.cropX * item.imageWidth, y: item.cropY * item.imageHeight, width: item.cropWidth * item.imageWidth, height: item.cropHeight * item.imageHeight }, visible: Boolean(imageMap[item.assetUrl]) }" />
              </v-group>
              <v-transformer ref="transformer" :config="{ keepRatio: !currentItem?.freeStretch, shiftBehavior: currentItem?.freeStretch ? 'default' : 'inverted', rotationSnaps: shiftHeld ? Array.from({ length: 24 }, (_, i) => i * 15) : [], rotationSnapTolerance: 8, rotateEnabled: true, flipEnabled: false, enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'], anchorSize: compact ? 22 : 12, anchorCornerRadius: 3, anchorStyleFunc: styleTransformAnchor, borderStroke: accentColor, anchorStroke: accentColor, anchorFill: '#ffffff', rotateAnchorOffset: compact ? 32 : 24, padding: 6 }" />
            </v-layer>
          </v-stage>
          <div v-if="!elements.length && !dragOver" class="outfit-board-empty"><PictureOutlined /><strong>选一张贴纸，开始搭配</strong><span>{{ compact ? '从底部打开素材栏，点选加入' : '从左侧点击加入，或直接拖到这里' }}</span><a-button v-if="compact" @click="pickerOpen = true"><PlusOutlined /> 选择贴纸</a-button></div>
          <div v-if="dragOver" class="outfit-drop-feedback">松手放到这里</div>
        </div></div></div>
        <div class="outfit-canvas-status" aria-live="polite"><template v-if="currentItem"><span class="outfit-selection-name"><span class="outfit-selection-dot"></span>{{ selectedIds.length > 1 ? `已选 ${selectedIds.length} 张贴纸` : currentItem.garmentLabel }}</span><a-button v-if="compact" type="link" @click="inspectorOpen = true">调整贴纸</a-button><span v-else class="muted">Shift 切换比例 / 15°旋转 · Alt 中心缩放</span></template><span v-else class="muted">{{ compact ? '双指缩放 / 平移 · 长按贴纸调整' : '四角缩放 · 边缘拉伸 · 顶部旋转 · Shift 切换比例 / 15°旋转 · Alt 中心缩放' }}</span></div>
        <a-alert v-if="failedImage" type="warning" show-icon message="有贴纸图片未能加载，草稿仍会保留。" class="outfit-image-warning"><template #action><a-button @click="retryImage(failedImage)"><ReloadOutlined /> 重试</a-button></template></a-alert>
      </section>

      <aside v-show="inspectorVisible" class="outfit-inspector" aria-label="所选贴纸操作"><div class="outfit-panel-heading"><h2>贴纸调整</h2><span class="muted">{{ sceneLabel }}</span></div><a-segmented v-model:value="inspectorTab" block :options="[{ value: 'properties', label: '属性' }, { value: 'layers', label: '图层' }]" class="outfit-inspector-tabs" /><div class="outfit-inspector-body"><OutfitLayers v-if="inspectorTab === 'layers'" :elements="elements" :selected-id="selectedId" :selected-ids="selectedIds" @all="selectAll" @clear="clearSelection" @select="selectLayer" @reorder="dropLayer" @context="openContextMenu" /><OutfitMultiInspector v-else-if="selectedIds.length > 1" :count="selectedIds.length" @rotate="batchRotate" @scale="batchScale" @offset="batchOffset" @flip="batchFlip" @stretch="stretchSelected" @remove="removeSelected" /><OutfitInspector v-else-if="currentItem" :item="currentItem" :can-forward="canForward" :can-backward="canBackward" @flip="flipSelected" @duplicate="duplicateSelected" @stretch="stretchSelected" @height="heightSelected" @crop="cropSelected" @role="changeRole" @resize="resizeSelected" @rotate="rotateSelected" @rotate-preview="previewRotation" @scale="scaleSelected" @position="positionSelected" @layer="moveLayer" @replace="startReplacement" @remove="removeSelected" @info="showInfo()" /><div v-else class="outfit-inspector-empty"><a-empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="点选画板上的贴纸"><p>调整大小、角度和位置，或切换到图层。</p></a-empty></div></div><div class="outfit-inspector-footer"><a-button block :disabled="!elements.length" @click="resetLayout"><ReloadOutlined /> 整理穿搭</a-button></div></aside>
    </div>
    <nav class="outfit-mobile-controls" aria-label="画板编辑操作"><a-button type="text" @click="replacementTarget = null; pickerOpen = true"><PlusOutlined /><span>选贴纸</span></a-button><a-button type="text" :disabled="!currentItem" @click="inspectorOpen = true"><ControlOutlined /><span>调整</span></a-button><a-button type="text" :disabled="!elements.length" @click="layersOpen = true"><MenuOutlined /><span>图层</span></a-button><a-dropdown :trigger="['click']" placement="topRight"><a-button type="text"><MoreOutlined /><span>更多</span></a-button><template #overlay><a-menu><a-menu-item @click="reviewOpen=true">穿搭检查</a-menu-item><a-menu-item :disabled="!dirty || !!failedImage || exporting" @click="exportPng"><DownloadOutlined /> 导出 PNG 图片</a-menu-item><a-menu-item :disabled="!elements.length" @click="resetLayout"><ReloadOutlined /> 整理穿搭</a-menu-item><a-menu-divider /><a-menu-item @click="showHelp"><QuestionCircleOutlined /> 操作帮助</a-menu-item></a-menu></template></a-dropdown></nav>
  </div>

  <OutfitReview v-model:open="reviewOpen" :scene="scene" />
  <a-drawer v-if="compact" v-model:open="pickerOpen" :title="replacementTarget ? '替换衣物' : '选择贴纸素材'" placement="bottom" height="min(80dvh, 740px)" root-class-name="outfit-mobile-drawer outfit-material-drawer" :body-style="{ padding: 0, overflow: 'hidden' }"><a-segmented v-model:value="materialTab" block :disabled="!!replacementTarget" :options="[{ value: 'garments', label: '我的衣物' }, { value: 'people', label: '人物贴纸' }]" class="outfit-material-tabs" /><OutfitPersonPicker v-if="materialTab === 'people'" :catalog="personCatalog" :loading="loadingPeople" :error="peopleError" :mobile="compact" @select="selectPerson" @dragstart="startPersonDrag" @dragend="endGarmentDrag" @retry="loadPeople" /><OutfitGarmentPicker v-else v-model:search="search" v-model:role="roleFilter" :garments="filteredGarments" :loading="loadingGarments" :error="garmentError" :picked-ids="pickedIds" :selected-id="currentItem?.garmentId || ''" :replacing="!!replacementTarget" mobile @select="selectGarment" @context="(_event, garment) => showInfo(garment.id)" @cancel="replacementTarget = null" @retry="loadGarments" /><template #footer><a-button type="primary" block @click="pickerOpen = false; replacementTarget = null">完成选择 · {{ sceneLabel }}</a-button></template></a-drawer>
  <a-drawer v-if="compact" v-model:open="inspectorOpen" :title="selectedIds.length > 1 ? `批量调整 ${selectedIds.length} 张贴纸` : currentItem ? `调整：${currentItem.garmentLabel}` : '调整贴纸'" placement="bottom" height="min(84dvh, 800px)" root-class-name="outfit-mobile-drawer"><OutfitMultiInspector v-if="selectedIds.length > 1" :count="selectedIds.length" @rotate="batchRotate" @scale="batchScale" @offset="batchOffset" @flip="batchFlip" @stretch="stretchSelected" @remove="removeSelected" /><OutfitInspector v-else-if="currentItem" :item="currentItem" :can-forward="canForward" :can-backward="canBackward" @flip="flipSelected" @duplicate="duplicateSelected" @stretch="stretchSelected" @height="heightSelected" @crop="cropSelected" @role="changeRole" @resize="resizeSelected" @rotate="rotateSelected" @rotate-preview="previewRotation" @scale="scaleSelected" @position="positionSelected" @layer="moveLayer" @replace="startReplacement" @remove="removeSelected" @info="showInfo()" /><template #footer><a-button type="primary" block @click="inspectorOpen = false">完成调整</a-button></template></a-drawer>
  <a-drawer v-if="compact" v-model:open="layersOpen" title="图层" placement="bottom" height="min(70dvh, 620px)" root-class-name="outfit-mobile-drawer"><OutfitLayers :elements="elements" :selected-id="selectedId" :selected-ids="selectedIds" @all="selectAll" @clear="clearSelection" @reorder="dropLayer" @select="selectLayer" @context="(_event, id) => { selectElement(id); layersOpen = false; inspectorOpen = true }" /></a-drawer>
  <a-drawer v-model:open="infoOpen" title="衣物信息" :placement="compact ? 'bottom' : 'right'" :width="420" :height="compact ? 'min(80dvh, 720px)' : undefined" :root-class-name="compact ? 'outfit-mobile-drawer' : undefined"><a-skeleton v-if="infoLoading" active /><a-alert v-else-if="infoError" type="error" show-icon :message="infoError" /><template v-else-if="infoGarment"><div class="outfit-information-image"><img :src="mediaUrl(artworkForGarment(infoGarment).url)" :alt="infoGarment.category.join(' ')" /></div><a-descriptions :column="1" bordered size="small"><a-descriptions-item label="品类">{{ infoGarment.category.join('、') || '待确认' }}</a-descriptions-item><a-descriptions-item label="颜色">{{ infoGarment.primaryColor.join('、') || '待确认' }}</a-descriptions-item><a-descriptions-item label="品牌">{{ infoGarment.brand.join('、') || '未填写' }}</a-descriptions-item><a-descriptions-item label="季节">{{ infoGarment.seasons.join('、') || '未填写' }}</a-descriptions-item><a-descriptions-item label="风格">{{ infoGarment.styles.join('、') || '未填写' }}</a-descriptions-item><a-descriptions-item label="衣柜状态">{{ infoGarment.status === 'ACTIVE' ? '已入柜' : infoGarment.status === 'TRASHED' ? '回收站' : '未入柜' }}</a-descriptions-item></a-descriptions><p class="outfit-information-note">这里展示衣柜的最新信息。搭配中的图片仅在主动替换时更新。</p><RouterLink :to="`/garment/${infoGarment.id}`" @click="infoOpen = false"><a-button block>在衣柜中打开</a-button></RouterLink></template></a-drawer>
  <Teleport to="body"><div v-if="contextTarget" ref="contextMenu" class="outfit-context-menu" :style="{ left: `${contextPosition.x}px`, top: `${contextPosition.y}px` }" @contextmenu.prevent><a-menu :selectable="false" aria-label="贴纸操作" @click="contextMenuClick"><a-menu-item v-if="!contextItem" key="add"><PlusOutlined /> 加入画板</a-menu-item><template v-else><a-menu-item key="forward" :disabled="contextItem.zIndex === elements.length - 1"><ArrowUpOutlined /> 前移一层</a-menu-item><a-menu-item key="backward" :disabled="contextItem.zIndex === 0"><ArrowDownOutlined /> 后移一层</a-menu-item><a-menu-item key="front" :disabled="contextItem.zIndex === elements.length - 1"><VerticalAlignTopOutlined /> 置于顶层</a-menu-item><a-menu-item key="back" :disabled="contextItem.zIndex === 0"><VerticalAlignBottomOutlined /> 置于底层</a-menu-item><a-menu-item key="duplicate">复制贴纸</a-menu-item><a-menu-item key="flip">水平翻转</a-menu-item><a-menu-divider /><a-menu-item v-if="contextItem.kind !== 'PERSON_PART'" key="replace" :disabled="contextItem.garmentStatus === 'TRASHED'"><SwapOutlined /> 替换衣物</a-menu-item></template><a-menu-item v-if="contextItem?.kind !== 'PERSON_PART'" key="info"><InfoCircleOutlined /> 查看衣物信息</a-menu-item><a-menu-divider v-if="contextItem" /><a-menu-item v-if="contextItem" key="remove" danger><DeleteOutlined /> 从搭配移除</a-menu-item></a-menu></div></Teleport>
</template>
