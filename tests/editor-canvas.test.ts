import assert from 'node:assert/strict'
import test from 'node:test'
import { applyEditorOperation } from '../src/agent/editor-canvas.ts'
import type { AgentContext } from '../src/agent/api'
import type { OutfitElement } from '../src/domain/outfit'

const item = (id: string, role: OutfitElement['role']): OutfitElement => ({ elementId: id, garmentId: id, assetId: id, role, kind: 'GARMENT', x: 540, y: 600, width: 200, height: 240, rotation: 0, zIndex: 0, garmentLabel: id, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, assetUrl: '/fixture', imageWidth: 200, imageHeight: 240, assetKind: 'INPUT' })
function draft() {
  let context: AgentContext = { route: '/outfits/new', workspaceId: 'editor:draft-one', boardId: 'draft-one', contentVersion: 7, scene: { version: 2, elements: [item('top', 'TOP'), item('pants', 'BOTTOM'), item('old-shoe', 'SHOES')] } }
  let saves = 0
  const bridge = { context: () => context, apply: (scene: NonNullable<AgentContext['scene']>) => { context = { ...context, scene, contentVersion: context.contentVersion! + 1 } }, save: () => { saves++ } }
  return { bridge, source: structuredClone(context), saves: () => saves, change: (patch: Partial<AgentContext>) => { context = { ...context, ...patch } } }
}
test('open draft shoe replacement is visible on the same canvas, retains its element id, and never saves', async () => {
  const d = draft()
  const result = await applyEditorOperation(d.bridge, d.source, 7, 'replace', { elementId: 'old-shoe', garmentId: 'pink-shoe' }, async id => item(id, 'SHOES'))
  assert.equal(result.route, '/outfits/new'); assert.equal(result.boardId, 'draft-one'); assert.equal(result.contentVersion, 8)
  assert.deepEqual(result.scene!.elements.map(e => e.garmentId).sort(), ['pants', 'pink-shoe', 'top'])
  assert.equal(result.scene!.elements.find(e => e.garmentId === 'pink-shoe')!.elementId, 'old-shoe')
  await applyEditorOperation(d.bridge, d.source, 8, 'layout', {}, async id => item(id, 'SHOES'))
  assert.equal(d.saves(), 0); assert.equal(d.bridge.context().contentVersion, 9)
})
test('user changes and switching drafts during image loading stop the edit', async () => {
  for (const patch of [{ contentVersion: 8 }, { workspaceId: 'editor:other-draft' }]) {
    const d = draft()
    await assert.rejects(applyEditorOperation(d.bridge, d.source, 7, 'replace', { elementId: 'old-shoe', garmentId: 'pink-shoe' }, async id => { d.change(patch); return item(id, 'SHOES') }), /当前画布已变化/)
    assert.equal(d.bridge.context().scene!.elements.at(-1)!.garmentId, 'old-shoe')
  }
})
test('missing elements and stale begin versions fail before changes', async () => {
  const d = draft()
  await assert.rejects(applyEditorOperation(d.bridge, d.source, 7, 'replace', { elementId: 'missing', garmentId: 'pink' }, async id => item(id, 'SHOES')), /待替换/)
  await assert.rejects(applyEditorOperation(d.bridge, d.source, 6, 'begin', {}, async id => item(id, 'SHOES')), /当前画布已变化/)
  assert.equal(d.bridge.context().contentVersion, 7)
})
