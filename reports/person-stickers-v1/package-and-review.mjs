import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage, GlobalFonts } from '/Users/yaopinxin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js'

const root = dirname(fileURLToPath(import.meta.url))
GlobalFonts.registerFromPath('/System/Library/Fonts/STHeiti Medium.ttc', 'ReviewChinese')
const names = ['head', 'neck', 'torso', 'pelvis', 'left-arm', 'right-arm', 'left-leg', 'right-leg', 'left-bent-arm', 'right-bent-arm', 'left-hand', 'right-hand', 'left-foot', 'right-foot']
const labels = ['头部含头发', '颈肩', '躯干', '基础短裤', '左侧完整手臂', '右侧完整手臂', '左侧完整腿', '右侧完整腿', '左侧弯臂', '右侧弯臂', '左手', '右手', '左脚', '右脚']
const metadata = JSON.parse(readFileSync(resolve(root, 'generation.json'), 'utf8'))
const overview = createCanvas(1440, 1080)
const overviewContext = overview.getContext('2d')
overviewContext.fillStyle = '#f6f4ef'; overviewContext.fillRect(0, 0, 1440, 1080)
overviewContext.font = '28px ReviewChinese'; overviewContext.fillStyle = '#262a2b'
overviewContext.fillText('实际贴纸组合样图 · 每个部位均可独立添加', 32, 48)
const result = []

for (const [setIndex, spec] of metadata.items.entries()) {
  const directory = resolve(root, spec.id)
  mkdirSync(resolve(directory, 'parts'), { recursive: true })
  copyFileSync(spec.source, resolve(directory, 'source-atlas.png'))
  const atlas = await loadImage(spec.source)
  const rows = spec.rows
  const parts = {}
  const contact = createCanvas(1000, 1060)
  const ctx = contact.getContext('2d')
  ctx.fillStyle = '#f7f5f0'; ctx.fillRect(0, 0, 1000, 1060)
  ctx.fillStyle = '#252a2d'; ctx.font = '28px ReviewChinese'; ctx.fillText(spec.label + ' · 独立部件', 24, 40)
  for (const [index, name] of names.entries()) {
    const row = Math.floor(index / 4), column = index % 4
    const x = spec.id === 'sketch' && index === 10 ? 700 : Math.round(column * atlas.width / 4)
    const x2 = spec.id === 'sketch' && index === 9 ? 700 : Math.round((column + 1) * atlas.width / 4)
    const cell = createCanvas(x2 - x, rows[row + 1] - rows[row])
    const cellCtx = cell.getContext('2d')
    cellCtx.drawImage(atlas, x, rows[row], cell.width, cell.height, 0, 0, cell.width, cell.height)
    const data = cellCtx.getImageData(0, 0, cell.width, cell.height).data
    // Locate the main sticker component to crop atlas-cell margins without changing its pixels.
    const seen = new Uint8Array(cell.width * cell.height)
    let largest = null
    for (let start = 0; start < seen.length; start++) {
      if (seen[start] || data[start * 4 + 3] < 180) continue
      const queue = [start]; seen[start] = 1
      let minX = cell.width, minY = cell.height, maxX = -1, maxY = -1
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const n = queue[cursor], px = n % cell.width, py = Math.floor(n / cell.width)
        minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py)
        for (const next of [px > 0 ? n - 1 : -1, px + 1 < cell.width ? n + 1 : -1, py > 0 ? n - cell.width : -1, py + 1 < cell.height ? n + cell.width : -1]) {
          if (next >= 0 && !seen[next] && data[next * 4 + 3] >= 180) { seen[next] = 1; queue.push(next) }
        }
      }
      if (!largest || queue.length > largest.size) largest = { size: queue.length, minX, minY, maxX, maxY }
    }
    let left = largest?.minX ?? cell.width, top = largest?.minY ?? cell.height, right = largest?.maxX ?? -1, bottom = largest?.maxY ?? -1
    if (right < left) throw new Error(`Missing ${spec.id}/${name}`)
    left = Math.max(0, left - 3); top = Math.max(0, top - 3)
    right = Math.min(cell.width - 1, right + 3); bottom = Math.min(cell.height - 1, bottom + 3)
    const piece = createCanvas(right - left + 1, bottom - top + 1)
    piece.getContext('2d').drawImage(cell, left, top, piece.width, piece.height, 0, 0, piece.width, piece.height)
    writeFileSync(resolve(directory, 'parts', name + '.png'), piece.toBuffer('image/png'))
    parts[name] = piece
    const cx = column * 250 + 10, cy = row * 245 + 62
    ctx.fillStyle = '#fff'; ctx.fillRect(cx, cy, 230, 230)
    const scale = Math.min(200 / piece.width, 190 / piece.height)
    ctx.drawImage(piece, cx + (230 - piece.width * scale) / 2, cy + (200 - piece.height * scale) / 2, piece.width * scale, piece.height * scale)
    ctx.font = '17px ReviewChinese'; ctx.fillStyle = '#535758'; ctx.textAlign = 'center'; ctx.fillText(labels[index], cx + 115, cy + 218); ctx.textAlign = 'left'
  }
  writeFileSync(resolve(directory, 'parts-overview.png'), contact.toBuffer('image/png'))

  const combined = createCanvas(480, 980)
  const c = combined.getContext('2d')
  c.fillStyle = '#fff'; c.fillRect(0, 0, 480, 980)
  c.font = '26px ReviewChinese'; c.fillStyle = '#252a2d'; c.textAlign = 'center'; c.fillText(spec.label, 240, 45)
  const chibi = spec.id === 'chibi'
  const headHeight = chibi ? 205 : 155
  const neckY = 105 + headHeight - 35
  const torsoY = neckY + 27
  const torsoHeight = chibi ? 185 : 235
  const pelvisY = torsoY + torsoHeight - 14
  const legY = pelvisY + 80
  const legHeight = chibi ? 255 : 340
  const draw = (name, center, top, width, height) => c.drawImage(parts[name], center - width / 2, top, width, height)
  draw('left-leg', 194, legY, 91, legHeight)
  draw('right-leg', 286, legY, 91, legHeight)
  draw('left-arm', 124, torsoY + 3, 77, chibi ? 218 : 267)
  draw('right-arm', 356, torsoY + 3, 77, chibi ? 218 : 267)
  draw('neck', 240, neckY, 154, 66)
  draw('torso', 240, torsoY, 190, torsoHeight)
  draw('pelvis', 240, pelvisY, 185, 105)
  const head = parts.head
  draw('head', 240, 105, head.width / head.height * headHeight, headHeight)
  c.font = '18px ReviewChinese'; c.fillStyle = '#69716e'; c.fillText('由本套实际部件手动缩放、叠放', 240, 935)
  writeFileSync(resolve(directory, 'composite.png'), combined.toBuffer('image/png'))
  overviewContext.drawImage(combined, setIndex * 480, 80)
  result.push({ id: spec.id, count: names.length, parts: names.map(name => ({ id: name, width: parts[name].width, height: parts[name].height })) })
}
writeFileSync(resolve(root, 'composites-overview.png'), overview.toBuffer('image/png'))
writeFileSync(resolve(root, 'parts-manifest.json'), JSON.stringify(result, null, 2))
console.log(result.map(x => ({ id: x.id, count: x.count })))
