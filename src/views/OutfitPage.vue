<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
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
import { closetApi, type Garment } from '../services/api'
import { OUTFIT_HEIGHT, OUTFIT_VERSION, OUTFIT_WIDTH, outfitDropPosition, outfitRoleOptions, reorderOutfitElements, restoreOutfitDraft, roleFromGarment, type Outfit, type OutfitDraft, type OutfitElement, type OutfitLayerMove, type OutfitRole, type OutfitScene } from '../domain/outfit'
import { artworkForGarment, createOutfitElement, downloadOutfitPng, loadOutfitImage } from '../domain/outfit-images'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import OutfitGarmentPicker from '../components/OutfitGarmentPicker.vue'
import OutfitInspector from '../components/OutfitInspector.vue'
import OutfitLayers from '../components/OutfitLayers.vue'
import { MIN_VIEW_ZOOM, MAX_VIEW_ZOOM, outfitViewGeometry, outfitWheelZoom } from '../domain/outfit-view'

const route = useRoute()
const router = useRouter()
const closet = useClosetStore()
const { message, modal } = App.useApp()
const editing = computed(() => Boolean(route.params.id))
const isNew = computed(() => route.params.id === 'new')
const pageLoading = ref(false)
const saving = ref(false)
const exporting = ref(false)
const error = ref('')
const saved = ref<Outfit[]>([])
const librarySearch = ref('')
const displayedOutfits = computed(() => saved.value.filter(item => item.name.toLocaleLowerCase().includes(librarySearch.value.trim().toLocaleLowerCase())))
const inspectorTab = ref('properties')
const garments = ref<Garment[]>([])
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

const activeGarments = computed(() => garments.value.filter((item) => item.status === 'ACTIVE'))
const filteredGarments = computed(() => activeGarments.value.filter((item) => {
  const category = [item.category, item.primaryColor, item.brand, item.styles, item.seasons].flat().join(' ').toLocaleLowerCase()
  return (!search.value || category.includes(search.value.trim().toLocaleLowerCase()))
    && (roleFilter.value === 'ALL' || roleFromGarment(item) === roleFilter.value)
}))
const pickedIds = computed(() => new Set(elements.value.map((item) => item.garmentId)))
const viewGeometry = computed(() => outfitViewGeometry(availableWidth.value, availableHeight.value, zoom.value, compact.value ? 24 : 48))
const canvasScale = computed(() => viewGeometry.value.scale)
const stageWidth = computed(() => viewGeometry.value.stageWidth)
const stageHeight = computed(() => viewGeometry.value.stageHeight)
const focusedView = computed(() => !pickerVisible.value && !inspectorVisible.value)
const scene = computed<OutfitScene>(() => ({ version: OUTFIT_VERSION, elements: elements.value }))
const currentItem = computed(() => elements.value.find((item) => item.garmentId === selectedId.value) || null)
const selectedIndex = computed(() => elements.value.findIndex(item => item.garmentId === selectedId.value))
const canForward = computed(() => selectedIndex.value >= 0 && selectedIndex.value < elements.value.length - 1)
const canBackward = computed(() => selectedIndex.value > 0)
const contextItem = computed(() => elements.value.find(item => item.garmentId === contextTarget.value))
const contextGarment = computed(() => garments.value.find(item => item.id === contextTarget.value))
const hasChanges = computed(() => JSON.stringify({ name: name.value, elements: elements.value }) !== baselineSignature)
const saveState = computed(() => localDraftNotice.value ? '草稿已保存在此设备' : !isNew.value && !hasChanges.value ? '已保存至账号' : '修改会自动保留在此设备')
const dirty = computed(() => elements.value.length > 0)
const roleNames = Object.fromEntries(outfitRoleOptions.map((option) => [option.value, option.label])) as Record<OutfitRole, string>
const sceneLabel = computed(() => elements.value.length === 1 ? '1 件衣物' : `${elements.value.length} 件衣物`)
const draftKey = computed(() => `yixu.outfit-draft.v1:${draftOwner.value || closet.user?.username || 'anonymous'}:${route.params.id || 'new'}`)

function getDraft() {
  try { return JSON.parse(localStorage.getItem(draftKey.value) || 'null') as OutfitDraft | null }
  catch { return null }
}
function persistDraft() {
  if (!loaded || !editing.value) return
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
  if (isNew.value) {
    const draft = getDraft()
    outfitId.value = ''
    revision.value = null
    draftRevision = null
    name.value = draft?.name || '未命名搭配'
    elements.value = draft?.scene?.version === OUTFIT_VERSION ? draft.scene.elements : []
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
    baselineSignature = JSON.stringify({ name: outfit.name, elements: outfit.scene.elements })
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

async function loadLibrary() {
  pageLoading.value = true
  error.value = ''
  try { saved.value = await closetApi.outfits() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '搭配列表暂时无法加载。' }
  finally { pageLoading.value = false }
}

function sceneSnapshot() { return elements.value.map((item) => ({ ...item })) }
function recordChange(next: OutfitElement[]) {
  if (JSON.stringify(next) === JSON.stringify(elements.value)) return
  undoStack.value = [...undoStack.value.slice(-79), sceneSnapshot()]
  redoStack.value = []
  elements.value = next.map((item, index) => ({ ...item, zIndex: index }))
  scheduleDraft()
}
function undo() {
  const previous = undoStack.value.at(-1)
  if (!previous) return
  redoStack.value = [...redoStack.value, sceneSnapshot()]
  undoStack.value = undoStack.value.slice(0, -1)
  elements.value = previous
  scheduleDraft()
}
function redo() {
  const next = redoStack.value.at(-1)
  if (!next) return
  undoStack.value = [...undoStack.value, sceneSnapshot()]
  redoStack.value = redoStack.value.slice(0, -1)
  elements.value = next
  scheduleDraft()
}

async function selectGarment(garment: Garment, position?: { x: number; y: number }) {
  if (addingGarments.has(garment.id)) return
  if (pickedIds.value.has(garment.id) && !replacementTarget.value) {
    if (position) recordChange(elements.value.map(item => item.garmentId === garment.id ? { ...item, ...position } : item))
    selectedId.value = garment.id
    await attachTransformer()
    return
  }
  if (replacementTarget.value && pickedIds.value.has(garment.id) && replacementTarget.value !== garment.id) {
    message.info('这件衣物已经在画板上，请选择其他单品。')
    return
  }
  addingGarments.add(garment.id)
  const target = replacementTarget.value
  const old = target ? elements.value.find((item) => item.garmentId === target) : null
  try {
    const candidate = await createOutfitElement(garment, target ? elements.value.filter((item) => item.garmentId !== target) : elements.value)
    const next = [...elements.value]
    if (old) {
      const index = next.findIndex((item) => item.garmentId === target)
      next[index] = { ...candidate, role: old.role, x: old.x, y: old.y, width: old.width, height: old.height, rotation: old.rotation, zIndex: old.zIndex }
    } else next.push({ ...candidate, ...position })
    recordChange(next.sort((a, b) => a.zIndex - b.zIndex))
    selectedId.value = garment.id
    replacementTarget.value = null
    if (old) pickerOpen.value = false
    await refreshImages()
    await attachTransformer()
    message.success(old ? '已替换衣物，保留原来的布局。' : `${candidate.garmentLabel}已加入画板。`, 1.4)
  } catch (cause) {
    message.error(cause instanceof Error ? cause.message : '衣物图片暂时无法加载。')
  } finally { addingGarments.delete(garment.id) }
}

function removeSelected() {
  if (!selectedId.value) return
  recordChange(elements.value.filter((item) => item.garmentId !== selectedId.value))
  selectedId.value = ''
  replacementTarget.value = null
  inspectorOpen.value = false
  detachTransformer()
}
function moveLayer(direction: OutfitLayerMove) {
  const next = reorderOutfitElements(elements.value, selectedId.value, direction)
  if (next !== elements.value) recordChange(next)
}
function changeRole(value: OutfitRole) {
  if (!currentItem.value) return
  recordChange(elements.value.map((item) => item.garmentId === selectedId.value ? { ...item, role: value } : item))
}
function scaleSelected(factor: number) {
  if (!currentItem.value) return
  resizeSelected(currentItem.value.width * factor)
}
function resizeSelected(width: number) {
  if (!currentItem.value) return
  const item = currentItem.value
  const factor = Math.max(24 / Math.min(item.width, item.height), Math.min(width / item.width, 2160 / item.width, 2700 / item.height))
  recordChange(elements.value.map(value => value.garmentId === selectedId.value ? { ...value, width: value.width * factor, height: value.height * factor } : value))
}
function rotateSelected(degrees: number) {
  if (!currentItem.value) return
  recordChange(elements.value.map((item) => item.garmentId === selectedId.value
    ? { ...item, rotation: ((degrees % 360) + 360) % 360 } : item))
}
function positionSelected(axis: 'x' | 'y', value: number) {
  recordChange(elements.value.map(item => item.garmentId === selectedId.value ? { ...item, [axis]: Math.max(0, Math.min(axis === 'x' ? OUTFIT_WIDTH : OUTFIT_HEIGHT, value)) } : item))
}
function startReplacement() {
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
function endGarmentDrag() { dragGarmentId.value = ''; dragOver.value = false }
function dragOverCanvas(event: DragEvent) {
  if (!dragGarmentId.value) return
  event.preventDefault()
  dragOver.value = true
  if (event.dataTransfer) event.dataTransfer.dropEffect = pickedIds.value.has(dragGarmentId.value) ? 'move' : 'copy'
}
function dropGarment(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  const garment = garments.value.find(item => item.id === dragGarmentId.value)
  const bounds = stageFrame.value?.getBoundingClientRect()
  const position = bounds && outfitDropPosition(event.clientX, event.clientY, bounds)
  endGarmentDrag()
  if (garment && position) void selectGarment(garment, position)
  else if (garment) message.info('请将衣物放到白色画板内。')
  else if (event.dataTransfer?.files.length) message.info('先将照片录入衣柜，再加入搭配。')
}

function closeContextMenu() { contextTarget.value = '' }
function openContextMenu(event: MouseEvent, id: string) {
  event.preventDefault()
  if (compact.value) { selectElement(id); inspectorOpen.value = true; return }
  if (pickedIds.value.has(id)) selectElement(id)
  contextTarget.value = id
  contextPosition.value = { x: Math.max(8, Math.min(event.clientX, window.innerWidth - 248)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 400)) }
  void nextTick(() => contextMenu.value?.querySelector<HTMLElement>('.ant-menu-item')?.focus())
}
function canvasContextMenu(event: Konva.KonvaEventObject<MouseEvent>, item: OutfitElement) {
  event.cancelBubble = true
  openContextMenu(event.evt, item.garmentId)
}
function contextMenuClick(event: { key: string | number }) { contextAction(event.key) }
function contextAction(key: string | number) {
  const id = contextTarget.value
  const garment = contextGarment.value
  closeContextMenu()
  if (key === 'info') { void showInfo(id); return }
  if (key === 'add' && garment) { void selectGarment(garment); return }
  selectElement(id)
  if (key === 'remove') removeSelected()
  else if (key === 'replace') startReplacement()
  else moveLayer(key as OutfitLayerMove)
}
async function showInfo(id = selectedId.value) {
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
  selectElement(item.garmentId)
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
  modal.info({ title: '画板操作', content: compact.value ? '点选衣物后拖动，拖动四角等比缩放。双指缩放或移动查看画板，双击或长按衣物打开调整抽屉。点击适应屏幕可恢复完整画板。' : '普通滚轮移动视图，Shift + 滚轮横向移动，Ctrl/⌘ + 滚轮以鼠标位置缩放。按住空格或鼠标中键拖动视图，也可切换手形工具。衣柜与属性面板可分别收起，专注画板可同时收起两栏。右键管理衣物，方向键微调；Ctrl/⌘ + Z 撤销，Ctrl/⌘ + S 保存，Delete 移除。', okText: '知道了' })
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
function resetViewDrag() { panOrigin = null; draggingView.value = false; spacePressed.value = false }
function keyUp(event: KeyboardEvent) { if (event.code === 'Space') spacePressed.value = false }

function bindNode(id: string, node: unknown) {
  nodeRefs[id] = node as { getNode: () => Konva.Group } | null
}
async function attachTransformer() {
  await nextTick()
  const node = selectedId.value ? nodeRefs[selectedId.value]?.getNode() : null
  const tool = transformer.value?.getNode()
  if (tool) { tool.nodes(node ? [node] : []); tool.getLayer()?.batchDraw() }
}
function detachTransformer() {
  const tool = transformer.value?.getNode()
  if (tool) { tool.nodes([]); tool.getLayer()?.batchDraw() }
}
function selectElement(id: string) { selectedId.value = id; void attachTransformer() }
function stageClick(event: { target: Konva.Node; targetNode?: Konva.Node; evt?: MouseEvent | TouchEvent }) {
  // Konva also emits click for the right button, after opening the context menu.
  if (event.evt && 'button' in event.evt && event.evt.button !== 0) return
  closeContextMenu()
  const target = event.targetNode || event.target
  if (target === target.getStage()) { selectedId.value = ''; detachTransformer() }
}
function clampPosition(position: { x: number; y: number }) {
  return { x: Math.max(0, Math.min(stageWidth.value, position.x)), y: Math.max(0, Math.min(stageHeight.value, position.y)) }
}
function dragEnd(event: { target: Konva.Group }, item: OutfitElement) {
  cancelLongPress()
  const node = event.target
  const unit = canvasScale.value
  recordChange(elements.value.map((value) => value.garmentId === item.garmentId
    ? { ...value, x: Math.min(OUTFIT_WIDTH, Math.max(0, node.x() / unit)), y: Math.min(OUTFIT_HEIGHT, Math.max(0, node.y() / unit)) } : value))
}
function transformEnd(event: { target: Konva.Group }, item: OutfitElement) {
  const node = event.target
  const unit = canvasScale.value
  const scaleX = Math.max(0.15, node.scaleX()), scaleY = Math.max(0.15, node.scaleY())
  node.scaleX(1); node.scaleY(1)
  recordChange(elements.value.map((value) => value.garmentId === item.garmentId
    ? { ...value, x: Math.min(OUTFIT_WIDTH, Math.max(0, node.x() / unit)), y: Math.min(OUTFIT_HEIGHT, Math.max(0, node.y() / unit)),
        width: Math.min(2160, Math.max(24, value.width * scaleX)), height: Math.min(2700, Math.max(24, value.height * scaleY)),
        rotation: ((node.rotation() % 360) + 360) % 360 } : value))
  void attachTransformer()
}
function styleTransformAnchor(anchor: Konva.Rect) { anchor.hitStrokeWidth(compact.value ? 24 : 8) }

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
  if (!name.value.trim() || name.value.trim().length > 100) { message.warning('搭配名称需为 1 到 100 个字符。'); return }
  if (!elements.value.length) { message.warning('先从衣柜加入一件衣物。'); return }
  if (failedImage.value) { message.error('请先重新加载无法打开的衣物图片，再保存。'); return }
  persistDraft()
  saving.value = true
  try {
    const result = await closetApi.saveOutfit(isNew.value ? null : outfitId.value, isNew.value ? null : revision.value,
      name.value.trim(), scene.value)
    loaded = false
    localStorage.removeItem(draftKey.value)
    outfitId.value = result.id
    revision.value = result.revision
    draftRevision = result.revision
    elements.value = result.scene.elements
    name.value = result.name
    baselineSignature = JSON.stringify({ name: name.value, elements: elements.value })
    localDraftNotice.value = false
    remoteConflict.value = false
    if (isNew.value) await router.replace(`/outfits/${result.id}`)
    else loaded = true
    message.success('搭配已保存，可在手机和电脑继续编辑。')
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : '搭配暂时无法保存。'
    if (/已在另一处更新|版本|conflict/i.test(text)) remoteConflict.value = true
    error.value = text
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
      try { await closetApi.deleteOutfit(outfit.id, outfit.revision); saved.value = saved.value.filter((item) => item.id !== outfit.id); message.success('搭配已删除。') }
      catch (cause) { message.error(cause instanceof Error ? cause.message : '搭配暂时无法删除。') }
    },
  })
}
async function exportPng() {
  if (!elements.value.length || failedImage.value) { message.warning('先加载全部衣物图片，再导出穿搭图。'); return }
  exporting.value = true
  try { await downloadOutfitPng(scene.value, name.value); message.success('穿搭图片已导出。') }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '穿搭图片导出失败。') }
  finally { exporting.value = false }
}
async function resetLayout() {
  if (!elements.value.length) return
  const next: OutfitElement[] = []
  for (const element of elements.value) {
    const garment = activeGarments.value.find((item) => item.id === element.garmentId)
    if (!garment) { next.push(element); continue }
    try {
      const layout = await createOutfitElement(garment, next.filter((item) => item.role === element.role))
      next.push({ ...element, x: layout.x, y: layout.y, rotation: 0, zIndex: next.length })
    } catch { next.push(element) }
  }
  recordChange(next)
  selectedId.value = ''
  detachTransformer()
}

function handleKeyboard(event: KeyboardEvent) {
  if (!editing.value) return
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
  else if (event.key === 'ArrowLeft') { event.preventDefault(); if (currentItem.value) recordChange(elements.value.map((item) => item.garmentId === selectedId.value ? { ...item, x: Math.max(0, item.x - (event.shiftKey ? 10 : 2)) } : item)) }
  else if (event.key === 'ArrowRight') { event.preventDefault(); if (currentItem.value) recordChange(elements.value.map((item) => item.garmentId === selectedId.value ? { ...item, x: Math.min(OUTFIT_WIDTH, item.x + (event.shiftKey ? 10 : 2)) } : item)) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); if (currentItem.value) recordChange(elements.value.map((item) => item.garmentId === selectedId.value ? { ...item, y: Math.max(0, item.y - (event.shiftKey ? 10 : 2)) } : item)) }
  else if (event.key === 'ArrowDown') { event.preventDefault(); if (currentItem.value) recordChange(elements.value.map((item) => item.garmentId === selectedId.value ? { ...item, y: Math.min(OUTFIT_HEIGHT, item.y + (event.shiftKey ? 10 : 2)) } : item)) }
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
watch(() => route.params.id, async () => {
  if (route.params.id) await loadPage()
  else await loadLibrary()
})
watch(() => JSON.stringify({ name: name.value, elements: elements.value }), (signature) => {
  if (!loaded) return
  if (signature === baselineSignature) {
    window.clearTimeout(draftTimer)
    localStorage.removeItem(draftKey.value)
    localDraftNotice.value = false
    return
  }
  scheduleDraft()
})
watch(() => elements.value.map((item) => item.assetUrl).join('|'), () => { void refreshImages() }, { immediate: true })
watch(selectedId, () => { void attachTransformer() })
watch(elements, () => {
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
  if (closet.isSignedIn) void loadGarments()
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
</script>

<template>
  <div v-if="!editing" class="outfit-library-page">
    <div class="page-heading outfit-library-heading"><div><h1>穿搭组合台</h1><p class="page-subtitle">从自己的衣柜选单品，保存一套随时可以穿的搭配。</p></div><a-button type="primary" @click="router.push('/outfits/new')"><PlusOutlined /> 新建搭配</a-button></div>
    <a-alert v-if="error" type="error" show-icon :message="error" class="outfit-alert"><template #action><a-button @click="loadLibrary">重新加载</a-button></template></a-alert>
    <a-skeleton v-if="pageLoading" active :paragraph="{ rows: 7 }" />
    <template v-else-if="saved.length">
      <div class="outfit-library-toolbar"><a-input v-model:value="librarySearch" allow-clear placeholder="搜索搭配名称" aria-label="搜索搭配"><template #prefix><SearchOutlined /></template></a-input><span class="muted">{{ displayedOutfits.length }} 套搭配 · 最近更新</span></div>
      <section v-if="displayedOutfits.length" class="outfit-library-grid" aria-label="已保存的穿搭">
        <article v-for="outfit in displayedOutfits" :key="outfit.id" class="outfit-card">
          <RouterLink :to="`/outfits/${outfit.id}`" class="outfit-card-preview"><OutfitThumbnail :scene="outfit.scene" :title="outfit.name" /><a-tag class="outfit-card-count">{{ outfit.scene.elements.length }} 件单品</a-tag><a-tag v-if="outfit.scene.elements.some(item => item.garmentChanged || item.garmentStatus === 'TRASHED')" color="orange" class="outfit-card-status">衣物有更新</a-tag></RouterLink>
          <div class="outfit-card-details"><div><RouterLink :to="`/outfits/${outfit.id}`" class="outfit-card-name">{{ outfit.name }}</RouterLink><span>{{ new Date(outfit.updatedAtMs).toLocaleDateString() }} 更新</span></div><a-dropdown :trigger="['click']"><a-button type="text" aria-label="搭配更多操作"><MoreOutlined /></a-button><template #overlay><a-menu><a-menu-item @click="router.push(`/outfits/${outfit.id}`)">编辑搭配</a-menu-item><a-menu-item @click="startCopy(outfit)"><CopyOutlined /> 复制搭配</a-menu-item><a-menu-divider /><a-menu-item danger @click="confirmDelete(outfit)"><DeleteOutlined /> 删除搭配</a-menu-item></a-menu></template></a-dropdown></div>
        </article>
      </section>
      <a-empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" description="没有找到这套搭配"><a-button @click="librarySearch = ''">清除搜索</a-button></a-empty>
    </template>
    <section v-else-if="!error" class="outfit-empty"><a-empty description="把第一套穿搭放上画板"><template #image><PictureOutlined /></template><p>选一件上衣、一条裤子，再加上喜欢的配饰。</p><a-button type="primary" @click="router.push('/outfits/new')"><PlusOutlined /> 开始搭配</a-button></a-empty></section>
  </div>

  <a-skeleton v-else-if="pageLoading" active :paragraph="{ rows: 10 }" />
  <div v-else-if="error && !loaded" class="outfit-editor-error"><a-alert type="error" show-icon :message="error" /><a-button @click="loadPage"><ReloadOutlined /> 重新加载画板</a-button><RouterLink to="/outfits"><a-button type="link">返回搭配列表</a-button></RouterLink></div>
  <div v-else class="outfit-editor-page">
    <header class="outfit-editor-header">
      <div class="outfit-editor-title"><a-tooltip title="返回搭配列表，草稿会自动保留"><a-button aria-label="返回搭配列表" @click="router.push('/outfits')"><ArrowLeftOutlined /></a-button></a-tooltip><div class="outfit-title-field"><a-input v-model:value="name" maxlength="100" aria-label="搭配名称" placeholder="给搭配起个名字" /></div><a-tooltip :title="saveState"><span class="outfit-save-state" role="status"><CheckOutlined v-if="localDraftNotice || (!isNew && !hasChanges)" />{{ localDraftNotice ? '本机草稿' : !isNew && !hasChanges ? '已保存' : '未保存' }}</span></a-tooltip></div>
      <div class="outfit-header-actions"><a-button class="outfit-desktop-export" :loading="exporting" :disabled="!dirty || !!failedImage" @click="exportPng"><DownloadOutlined /> 导出图片</a-button><a-button type="primary" aria-label="保存搭配" :loading="saving" :disabled="!dirty || remoteConflict" @click="saveOutfit"><SaveOutlined /><span>{{ compact ? '保存' : '保存搭配' }}</span></a-button></div>
    </header>
    <a-alert v-if="remoteConflict" type="warning" show-icon message="另一处已更新这套搭配，你的草稿仍保留。" class="outfit-alert"><template #action><div class="outfit-conflict-actions"><a-button @click="loadLatest">重新加载</a-button><a-button type="primary" @click="saveConflictAsCopy">另存副本</a-button></div></template></a-alert>
    <a-alert v-else-if="error" type="error" show-icon closable :message="error" class="outfit-alert" @close="error = ''" />
    <div class="outfit-editor-layout">
      <aside v-show="pickerVisible" class="outfit-picker-panel" aria-label="选择衣物"><div class="outfit-panel-heading"><h2>我的衣柜</h2><a-tag>{{ activeGarments.length }} 件</a-tag></div><OutfitGarmentPicker v-model:search="search" v-model:role="roleFilter" :garments="filteredGarments" :loading="loadingGarments" :error="garmentError" :picked-ids="pickedIds" :selected-id="selectedId" :replacing="!!replacementTarget" @select="selectGarment" @context="(event, garment) => openContextMenu(event, garment.id)" @dragstart="startGarmentDrag" @dragend="endGarmentDrag" @cancel="replacementTarget = null" @retry="loadGarments" /></aside>

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
              <v-group v-for="item in elements" :key="item.garmentId" :ref="(node: unknown) => bindNode(item.garmentId, node)" :config="{ x: item.x * canvasScale, y: item.y * canvasScale, rotation: item.rotation, draggable: !pinching, name: `outfit-${item.garmentId}`, dragBoundFunc: clampPosition }"
                @click="selectElement(item.garmentId)" @tap="selectElement(item.garmentId)" @dbltap="selectElement(item.garmentId); inspectorOpen = true" @contextmenu="canvasContextMenu($event, item)" @touchstart="beginTouch($event, item)" @touchmove="cancelLongPress" @touchend="cancelLongPress" @dragstart="cancelLongPress(); selectElement(item.garmentId)" @dragend="dragEnd($event, item)" @transformend="transformEnd($event, item)">
                <v-image :config="{ image: imageMap[item.assetUrl], x: -item.width * canvasScale / 2, y: -item.height * canvasScale / 2, width: item.width * canvasScale, height: item.height * canvasScale, crop: { x: item.cropX * item.imageWidth, y: item.cropY * item.imageHeight, width: item.cropWidth * item.imageWidth, height: item.cropHeight * item.imageHeight }, visible: Boolean(imageMap[item.assetUrl]) }" />
              </v-group>
              <v-transformer ref="transformer" :config="{ keepRatio: true, rotateEnabled: true, flipEnabled: false, enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], anchorSize: compact ? 22 : 12, anchorCornerRadius: 3, anchorStyleFunc: styleTransformAnchor, borderStroke: '#3f6ff5', anchorStroke: '#3f6ff5', anchorFill: '#ffffff', rotateAnchorOffset: compact ? 32 : 24, padding: 6 }" />
            </v-layer>
          </v-stage>
          <div v-if="!elements.length && !dragOver" class="outfit-board-empty"><PictureOutlined /><strong>选一件单品，开始搭配</strong><span>{{ compact ? '从底部打开衣柜，点选加入' : '从左侧点击加入，或直接拖到这里' }}</span><a-button v-if="compact" @click="pickerOpen = true"><PlusOutlined /> 选择衣物</a-button></div>
          <div v-if="dragOver" class="outfit-drop-feedback">松手放到这里</div>
        </div></div></div>
        <div class="outfit-canvas-status" aria-live="polite"><template v-if="currentItem"><span class="outfit-selection-name"><span class="outfit-selection-dot"></span>{{ currentItem.garmentLabel }}</span><a-button v-if="compact" type="link" @click="inspectorOpen = true">调整衣物</a-button><span v-else class="muted">滚轮移动 · Ctrl/⌘ + 滚轮缩放 · 空格拖动</span></template><span v-else class="muted">{{ compact ? '双指缩放 / 平移 · 长按衣物调整' : '滚轮移动 · Ctrl/⌘ + 滚轮缩放 · 空格 / 中键拖动' }}</span></div>
        <a-alert v-if="failedImage" type="warning" show-icon message="有衣物图片未能加载，草稿仍会保留。" class="outfit-image-warning"><template #action><a-button @click="retryImage(failedImage)"><ReloadOutlined /> 重试</a-button></template></a-alert>
      </section>

      <aside v-show="inspectorVisible" class="outfit-inspector" aria-label="所选衣物操作"><div class="outfit-panel-heading"><h2>衣物调整</h2><span class="muted">{{ sceneLabel }}</span></div><a-segmented v-model:value="inspectorTab" block :options="[{ value: 'properties', label: '属性' }, { value: 'layers', label: '单品层级' }]" class="outfit-inspector-tabs" /><div class="outfit-inspector-body"><OutfitLayers v-if="inspectorTab === 'layers'" :elements="elements" :selected-id="selectedId" @select="selectElement" @context="openContextMenu" /><OutfitInspector v-else-if="currentItem" :item="currentItem" :can-forward="canForward" :can-backward="canBackward" @role="changeRole" @resize="resizeSelected" @rotate="rotateSelected" @scale="scaleSelected" @position="positionSelected" @layer="moveLayer" @replace="startReplacement" @remove="removeSelected" @info="showInfo()" /><div v-else class="outfit-inspector-empty"><a-empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="点选画板上的衣物"><p>调整大小、角度和位置，或切换到单品层级。</p></a-empty></div></div><div class="outfit-inspector-footer"><a-button block :disabled="!elements.length" @click="resetLayout"><ReloadOutlined /> 重新排版</a-button></div></aside>
    </div>
    <nav class="outfit-mobile-controls" aria-label="画板编辑操作"><a-button type="text" @click="replacementTarget = null; pickerOpen = true"><PlusOutlined /><span>选衣物</span></a-button><a-button type="text" :disabled="!currentItem" @click="inspectorOpen = true"><ControlOutlined /><span>调整</span></a-button><a-button type="text" :disabled="!elements.length" @click="layersOpen = true"><MenuOutlined /><span>单品层级</span></a-button><a-dropdown :trigger="['click']" placement="topRight"><a-button type="text"><MoreOutlined /><span>更多</span></a-button><template #overlay><a-menu><a-menu-item :disabled="!dirty || !!failedImage || exporting" @click="exportPng"><DownloadOutlined /> 导出 PNG 图片</a-menu-item><a-menu-item :disabled="!elements.length" @click="resetLayout"><ReloadOutlined /> 重新排版</a-menu-item><a-menu-divider /><a-menu-item @click="showHelp"><QuestionCircleOutlined /> 操作帮助</a-menu-item></a-menu></template></a-dropdown></nav>
  </div>

  <a-drawer v-if="compact" v-model:open="pickerOpen" :title="replacementTarget ? '替换衣物' : '从衣柜选择'" placement="bottom" height="min(80dvh, 740px)" root-class-name="outfit-mobile-drawer" :body-style="{ padding: 0, overflow: 'hidden' }"><OutfitGarmentPicker v-model:search="search" v-model:role="roleFilter" :garments="filteredGarments" :loading="loadingGarments" :error="garmentError" :picked-ids="pickedIds" :selected-id="selectedId" :replacing="!!replacementTarget" mobile @select="selectGarment" @context="(_event, garment) => showInfo(garment.id)" @cancel="replacementTarget = null" @retry="loadGarments" /><template #footer><a-button type="primary" block @click="pickerOpen = false; replacementTarget = null">完成选择 · {{ sceneLabel }}</a-button></template></a-drawer>
  <a-drawer v-if="compact" v-model:open="inspectorOpen" :title="currentItem ? `调整：${currentItem.garmentLabel}` : '调整衣物'" placement="bottom" height="min(84dvh, 800px)" root-class-name="outfit-mobile-drawer"><OutfitInspector v-if="currentItem" :item="currentItem" :can-forward="canForward" :can-backward="canBackward" @role="changeRole" @resize="resizeSelected" @rotate="rotateSelected" @scale="scaleSelected" @position="positionSelected" @layer="moveLayer" @replace="startReplacement" @remove="removeSelected" @info="showInfo()" /><template #footer><a-button type="primary" block @click="inspectorOpen = false">完成调整</a-button></template></a-drawer>
  <a-drawer v-if="compact" v-model:open="layersOpen" title="单品层级" placement="bottom" height="min(70dvh, 620px)" root-class-name="outfit-mobile-drawer"><OutfitLayers :elements="elements" :selected-id="selectedId" @select="id => { selectElement(id); layersOpen = false; inspectorOpen = true }" @context="(_event, id) => { selectElement(id); layersOpen = false; inspectorOpen = true }" /></a-drawer>
  <a-drawer v-model:open="infoOpen" title="衣物信息" :placement="compact ? 'bottom' : 'right'" :width="420" :height="compact ? 'min(80dvh, 720px)' : undefined" :root-class-name="compact ? 'outfit-mobile-drawer' : undefined"><a-skeleton v-if="infoLoading" active /><a-alert v-else-if="infoError" type="error" show-icon :message="infoError" /><template v-else-if="infoGarment"><div class="outfit-information-image"><img :src="artworkForGarment(infoGarment).url" :alt="infoGarment.category.join(' ')" /></div><a-descriptions :column="1" bordered size="small"><a-descriptions-item label="品类">{{ infoGarment.category.join('、') || '待确认' }}</a-descriptions-item><a-descriptions-item label="颜色">{{ infoGarment.primaryColor.join('、') || '待确认' }}</a-descriptions-item><a-descriptions-item label="品牌">{{ infoGarment.brand.join('、') || '未填写' }}</a-descriptions-item><a-descriptions-item label="季节">{{ infoGarment.seasons.join('、') || '未填写' }}</a-descriptions-item><a-descriptions-item label="风格">{{ infoGarment.styles.join('、') || '未填写' }}</a-descriptions-item><a-descriptions-item label="衣柜状态">{{ infoGarment.status === 'ACTIVE' ? '已入柜' : infoGarment.status === 'TRASHED' ? '回收站' : '未入柜' }}</a-descriptions-item></a-descriptions><p class="outfit-information-note">这里展示衣柜的最新信息。搭配中的图片仅在主动替换时更新。</p><RouterLink :to="`/garment/${infoGarment.id}`" @click="infoOpen = false"><a-button block>在衣柜中打开</a-button></RouterLink></template></a-drawer>
  <Teleport to="body"><div v-if="contextTarget" ref="contextMenu" class="outfit-context-menu" :style="{ left: `${contextPosition.x}px`, top: `${contextPosition.y}px` }" @contextmenu.prevent><a-menu :selectable="false" aria-label="衣物操作" @click="contextMenuClick"><a-menu-item v-if="!contextItem" key="add"><PlusOutlined /> 加入画板</a-menu-item><template v-else><a-menu-item key="forward" :disabled="contextItem.zIndex === elements.length - 1"><ArrowUpOutlined /> 前移一层</a-menu-item><a-menu-item key="backward" :disabled="contextItem.zIndex === 0"><ArrowDownOutlined /> 后移一层</a-menu-item><a-menu-item key="front" :disabled="contextItem.zIndex === elements.length - 1"><VerticalAlignTopOutlined /> 置于顶层</a-menu-item><a-menu-item key="back" :disabled="contextItem.zIndex === 0"><VerticalAlignBottomOutlined /> 置于底层</a-menu-item><a-menu-divider /><a-menu-item key="replace" :disabled="contextItem.garmentStatus === 'TRASHED'"><SwapOutlined /> 替换衣物</a-menu-item></template><a-menu-item key="info"><InfoCircleOutlined /> 查看衣物信息</a-menu-item><a-menu-divider v-if="contextItem" /><a-menu-item v-if="contextItem" key="remove" danger><DeleteOutlined /> 从搭配移除</a-menu-item></a-menu></div></Teleport>
</template>
