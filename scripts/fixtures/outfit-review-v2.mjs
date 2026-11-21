// 本地界面假数据：/api/outfit-reviews 的 composition-v2 返回（server 设计 2026-11-21-做张图：穿前检查与姿势预览重设计 3.1）。
// 只用于本地截图与 fixture，规则是简化版，以服务端 RenderFit 为准。
// info(garmentId) → { label, role }，role 取 TOP / BOTTOM / OUTER / ONE_PIECE / SHOES / ACCESSORY / HEADWEAR / BAG / HANDHELD / OTHER。
const EXTRA = new Set(['ACCESSORY', 'HEADWEAR', 'HAT', 'BAG', 'HANDHELD', 'GLASSES', 'SCARF', 'BELT', 'SOCKS', 'GLOVES'])
const NAMES = { TOP: '上衣', BOTTOM: '下装', OUTER: '外套', SHOES: '鞋', ONE_PIECE: '连衣裙' }

export function mockOutfitReview(body, info) {
  const roles = body?.wearRoles || {}
  const ids = body?.selectedGarmentIds || (body?.scene?.elements || []).filter(e => e.kind !== 'PERSON_PART').map(e => e.garmentId)
  const worn = [...new Set(ids)].map(id => {
    const known = info(id) || { label: '单品', role: 'OTHER' }
    let role = known.role
    if (role === 'OTHER' && roles[id]?.startsWith('PART:')) role = roles[id].slice(5)
    const position = role === 'ACCESSORY' ? (roles[id]?.startsWith('ACCESSORY:') ? roles[id].slice(10) : 'UNKNOWN') : role
    return { garmentId: id, revision: 1, label: known.label, role, referenceAssetId: 'asset-' + id, position, layer: role === 'OUTER' ? 'OUTER' : roles[id] === 'INNER' ? 'INNER' : 'MAIN' }
  })
  const of = role => worn.filter(w => w.role === role)
  const asks = [], blockers = []
  const tops = of('TOP'), outers = of('OUTER'), bottoms = of('BOTTOM'), pieces = of('ONE_PIECE')
  if (tops.length === 2 && !tops.some(w => roles[w.garmentId] === 'INNER')) asks.push({ code: 'CHOOSE_INNER', garmentIds: tops.map(w => w.garmentId), message: '两件上衣，哪件穿里面？' })
  for (const role of ['OUTER', 'SHOES', 'BOTTOM']) if (of(role).length > 1) asks.push({ code: 'CHOOSE_ONE', garmentIds: of(role).map(w => w.garmentId), message: `两件${NAMES[role]}，这次穿哪件？` })
  for (const w of of('OTHER')) asks.push({ code: 'CHOOSE_PART', garmentIds: [w.garmentId], message: '这件穿在哪？' })
  const item = (w, note = null) => ({ garmentId: w.garmentId, label: w.label, layer: w.layer, position: w.role === 'ACCESSORY' && w.position !== 'UNKNOWN' ? w.position : null, note })
  const parts = []
  const upper = tops.length ? tops : outers
  if (pieces.length) parts.push({ part: 'FULL', label: '全身', state: 'OK', items: [...pieces.map(w => item(w)), ...tops.map(w => item(w, '穿在裙子里面')), ...bottoms.map(w => item(w, '穿在裙子下面'))] })
  else {
    parts.push({ part: 'UPPER', label: '上身', state: upper.length ? 'OK' : 'MISSING', items: tops.length ? tops.map(w => item(w, roles[w.garmentId] === 'INNER' ? '穿在里面' : null)) : outers.map(w => item(w, '直接上身穿')) })
    parts.push({ part: 'LOWER', label: '下身', state: bottoms.length ? 'OK' : 'MISSING', items: bottoms.map(w => item(w)) })
    if (!upper.length && !bottoms.length) blockers.push({ code: 'STRUCTURE_INVALID', message: '还差上衣和下装，或一件连衣裙', action: '去搭配里加一件', fix: 'ADD_MAIN' })
    else if (!upper.length) blockers.push({ code: 'STRUCTURE_INVALID', message: '还差上衣', action: '去搭配里加一件', fix: 'ADD_TOP' })
    else if (!bottoms.length) blockers.push({ code: 'STRUCTURE_INVALID', message: '还差下装', action: '去搭配里加一件', fix: 'ADD_BOTTOM' })
  }
  if (outers.length && (tops.length || pieces.length)) parts.push({ part: 'OUTER', label: '外套', state: 'OK', items: outers.map(w => item(w, '穿在最外面')) })
  parts.push({ part: 'SHOES', label: '鞋', state: of('SHOES').length ? 'OK' : 'NONE', items: of('SHOES').map(w => item(w)) })
  const extra = worn.filter(w => EXTRA.has(w.role))
  if (extra.length) parts.push({ part: 'EXTRA', label: '配饰', state: 'OK', items: extra.map(w => item(w, w.role === 'ACCESSORY' && w.position === 'UNKNOWN' ? '自然佩戴' : w.role === 'HANDHELD' ? '拿在手里' : null)) })
  return { outfitId: body?.outfitId || null, revision: body?.revision ?? null, items: worn, slots: [], blockers, warnings: [], parts, asks, fingerprint: 'fixture-' + worn.map(w => w.garmentId + (roles[w.garmentId] || '')).join(','), ruleVersion: 'composition-v2' }
}
