import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMissingOutfit } from '../src/domain/outfitErrors.ts'

test('recognises the messages that mean the saved outfit is gone', () => {
  for (const text of ['没有找到这套搭配。', '找不到这套搭配。', '这套搭配已被删除，请返回列表查看。']) assert.equal(isMissingOutfit(new Error(text)), true, text)
})

test('conflicts and other failures are not treated as missing', () => {
  for (const text of ['这套搭配已在另一处更新；你的修改尚未提交。', '搭配名称需为 1 到 100 个字符。', '请求失败 (500)']) assert.equal(isMissingOutfit(new Error(text)), false, text)
  assert.equal(isMissingOutfit('没有找到这套搭配。'), false)
  assert.equal(isMissingOutfit(undefined), false)
})
