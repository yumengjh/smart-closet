import test from 'node:test'
import assert from 'node:assert/strict'
import { addSelection, droppedHint, hasLook, initialPickerTab, liveSource, neighborLook, pickerTabs, toggleSelection } from '../src/tryon/selection.ts'
import type { Look, Selection } from '../src/tryon/api.ts'

const shirt: Selection = { type: 'GARMENT', id: 'g1', revision: 1 }
const skirt: Selection = { type: 'GARMENT', id: 'g2', revision: 1 }
const upload: Selection = { type: 'TEMPORARY', id: 't1' }
const look: Selection = { type: 'LOOK', id: 'l1' }
const other: Selection = { type: 'LOOK', id: 'l2' }

test('精选整套与衣服互斥：选精选换下衣服，选衣服换下精选，并说明换下了什么', () => {
  assert.deepEqual(toggleSelection([shirt, skirt], look), { selected: [look], dropped: 'others' })
  assert.deepEqual(toggleSelection([look], shirt), { selected: [shirt], dropped: 'look' })
  assert.deepEqual(addSelection([look], upload), { selected: [upload], dropped: 'look' })
  assert.equal(droppedHint('others'), '精选整套要单独试，已换下其他衣服')
  assert.equal(droppedHint('look'), '已换下精选整套')
  assert.equal(droppedHint(null), '')
})

test('精选之间直接替换、不算换下；衣服之间照旧叠加；再点一次取消', () => {
  assert.deepEqual(toggleSelection([look], other), { selected: [other], dropped: null })
  assert.deepEqual(toggleSelection([], look), { selected: [look], dropped: null })
  assert.deepEqual(toggleSelection([shirt], skirt), { selected: [shirt, skirt], dropped: null })
  assert.deepEqual(toggleSelection([look], look), { selected: [], dropped: null })
  assert.deepEqual(toggleSelection([shirt, skirt], shirt), { selected: [skirt], dropped: null })
  // 任何结果里精选都不会和别的选择同时出现。
  for (const start of [[], [shirt], [shirt, upload], [look]] as Selection[][]) for (const item of [shirt, upload, look, other]) {
    const next = toggleSelection(start, item).selected
    assert.ok(!hasLook(next) || next.length === 1, JSON.stringify({ start, item }))
  }
})

test('埋点来源：精选、搭配、临时上传、衣柜', () => {
  assert.equal(liveSource([look], false), 'look')
  assert.equal(liveSource([shirt, skirt], true), 'outfit')
  assert.equal(liveSource([shirt, upload], false), 'upload')
  assert.equal(liveSource([shirt], false), 'wardrobe')
})

test('选衣标签：有精选时多一个“精选”并默认停在那里；从衣柜卡片进来仍停“衣柜”', () => {
  assert.deepEqual(pickerTabs(true), ['精选', '衣柜', '已存搭配', '临时上传'])
  assert.deepEqual(pickerTabs(false), ['衣柜', '已存搭配', '临时上传'])
  assert.equal(initialPickerTab({ looks: 3 }), '精选')
  assert.equal(initialPickerTab({ looks: 0 }), '衣柜')
  assert.equal(initialPickerTab({ looks: 3, garment: true }), '衣柜')
  assert.equal(initialPickerTab({ looks: 3, look: true }), '精选')
  assert.equal(initialPickerTab({ looks: 0, look: true }), '衣柜')
  assert.equal(initialPickerTab({ looks: 3, outfit: true }), '已存搭配')
})

const item = (id: string, category: string): Look => ({ id, name: id, category, tags: [], coverage: 'FULL', imageUrl: `/api/tryon/looks/${id}/image?v=1`, thumbUrl: `/api/tryon/looks/${id}/image?size=thumb&v=1` })
test('左右滑动只在同一分类里换上一套 / 下一套，首尾相接', () => {
  const looks = [item('a', 'spring'), item('x', 'summer'), item('b', 'spring'), item('c', 'spring'), item('y', 'summer')]
  assert.equal(neighborLook(looks, 'a', 'next')?.id, 'b')
  assert.equal(neighborLook(looks, 'c', 'next')?.id, 'a')
  assert.equal(neighborLook(looks, 'a', 'prev')?.id, 'c')
  assert.equal(neighborLook(looks, 'x', 'next')?.id, 'y')
  assert.equal(neighborLook([item('solo', 'party'), ...looks], 'solo', 'next'), null)
  assert.equal(neighborLook(looks, 'missing', 'next'), null)
})
