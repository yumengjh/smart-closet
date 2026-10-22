import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error plain ESM script without type declarations
import { hashedCanonicalRequest, purgePaths, signedHeaders } from '../scripts/purge-cdn.mjs'

test('TC3 canonical request matches the worked example in Tencent Cloud documentation', () => {
  // https://cloud.tencent.com/document/api/228/30978 (keys are masked there, so the signature itself is not checked)
  const payload = '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], "Name": "instance-name"}]}'
  assert.equal(hashedCanonicalRequest('cvm.tencentcloudapi.com', 'DescribeInstances', payload),
    '7019a55be8395899b900fb5564e4200d984910f34794a27cb3fb7d10ff6a1e84')
})

test('signed headers carry the scope for the UTC date and the signed header list', () => {
  const headers = signedHeaders({ secretId: 'AKIDexample', secretKey: 'secret', action: 'PurgePathCache', payload: '{}', timestamp: 1551113065 })
  assert.match(headers.Authorization, /^TC3-HMAC-SHA256 Credential=AKIDexample\/2019-02-25\/cdn\/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=[0-9a-f]{64}$/)
  assert.equal(headers['X-TC-Action'], 'PurgePathCache')
  assert.equal(headers['X-TC-Timestamp'], '1551113065')
  assert.notEqual(signedHeaders({ secretId: 'AKIDexample', secretKey: 'other', action: 'PurgePathCache', payload: '{}', timestamp: 1551113065 }).Authorization, headers.Authorization)
})

test('purge paths default to the site origin and must be directories', () => {
  assert.deepEqual(purgePaths({ SITE_URL: 'https://yuda.yumg.cn/wardrobe?x=1' }), ['https://yuda.yumg.cn/'])
  assert.deepEqual(purgePaths({ CDN_PURGE_PATHS: 'https://a.example/, https://a.example/icons/', SITE_URL: 'https://b.example/' }),
    ['https://a.example/', 'https://a.example/icons/'])
  assert.deepEqual(purgePaths({}), [])
  assert.throws(() => purgePaths({ CDN_PURGE_PATHS: 'https://a.example/index.html' }))
})
