import test from 'node:test'
import assert from 'node:assert/strict'
import { variantPath, variantSrcset } from '../src/domain/image-variants.ts'

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
