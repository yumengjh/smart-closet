import test from 'node:test'
import assert from 'node:assert/strict'
import { layerVariantPath, variantPath, variantSrcset } from '../src/domain/image-variants.ts'

test('garment images ask for a snapped copy; other images are left alone', () => {
  assert.equal(variantPath('/api/workflows/a/files/step-2.png', 300), '/api/workflows/a/files/step-2.png?w=320')
  assert.equal(variantPath('/api/batches/b/files/source-1.jpg', 1), '/api/batches/b/files/source-1.jpg?w=160')
  assert.equal(variantPath('/api/segmentations/c/sticker/image', 5000), '/api/segmentations/c/sticker/image?w=960')
  for (const other of ['/api/me/private-media/x', 'blob:local', 'data:image/png;base64,a', '/illustrations/a.png', '/api/workflows/a/files/step-2.png?w=320'])
    assert.equal(variantPath(other, 320), other)
  assert.equal(variantPath(undefined, 320), undefined)
})

test('srcset lists each copy with its width', () => {
  assert.equal(variantSrcset('/api/workflows/a/files/step-2.png', [320, 480], p => `https://api.example.com${p}`),
    'https://api.example.com/api/workflows/a/files/step-2.png?w=320 320w, https://api.example.com/api/workflows/a/files/step-2.png?w=480 480w')
  assert.equal(variantSrcset('blob:local', [320]), undefined)
})

test('outfit preview layers ask for a copy wide enough for their drawn size and crop', () => {
  const path = '/api/workflows/a/files/step-2.png'
  // A 300 px layer showing its whole picture needs 320; showing half of it needs the picture at 600, so 720.
  assert.equal(layerVariantPath(path, 300), `${path}?w=320`)
  assert.equal(layerVariantPath(path, 300, 0.5), `${path}?w=720`)
  assert.equal(layerVariantPath(path, 900, 0.5), `${path}?w=960`, 'never more than the largest copy')
  assert.equal(layerVariantPath(path, 300, 0), `${path}?w=320`, 'a missing crop counts as the whole picture')
  assert.equal(layerVariantPath('/person-stickers/v1/a/head.png', 300), '/person-stickers/v1/a/head.png', 'static stickers have no copies')
})
