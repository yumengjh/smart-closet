import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBuildTime, formatVersion, versionFromTag } from '../src/domain/app-version.ts'

test('formats tag and branch builds', () => {
  assert.equal(formatVersion({ version: '1.2.0', commit: 'abcdef1234567' }), 'v1.2.0 · abcdef1')
  assert.equal(formatVersion({ version: 'main', commit: 'abcdef1' }), 'main · abcdef1')
  assert.equal(formatVersion({ version: 'dev', commit: '' }), 'dev')
  assert.equal(formatVersion(null), '未知')
})

test('reads the version from a v* tag, else falls back', () => {
  assert.equal(versionFromTag('v1.4.0', '0.1.0'), '1.4.0')
  assert.equal(versionFromTag('', '0.1.0'), '0.1.0')
  assert.equal(versionFromTag(undefined, '0.1.0'), '0.1.0')
})

test('build time is empty when unknown', () => {
  assert.equal(formatBuildTime(''), '')
  assert.equal(formatBuildTime('nope'), '')
  assert.match(formatBuildTime('2026-10-11T00:30:00Z'), /^2026-10-1\d \d\d:\d\d$/)
})
