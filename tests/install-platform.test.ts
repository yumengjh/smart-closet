import test from 'node:test'
import assert from 'node:assert/strict'
import { detectInstallPlatform, installBlocker, installGuides } from '../src/domain/install-platform.ts'

const ua = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  wechat: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49',
}

test('detects common install platforms', () => {
  assert.deepEqual(detectInstallPlatform(ua.iphoneSafari, 5), { os: 'ios', browser: 'safari' })
  assert.deepEqual(detectInstallPlatform(ua.ipadDesktop, 5), { os: 'ios', browser: 'safari' })
  assert.deepEqual(detectInstallPlatform(ua.ipadDesktop, 0), { os: 'macos', browser: 'safari' })
  assert.deepEqual(detectInstallPlatform(ua.androidChrome), { os: 'android', browser: 'chrome' })
  assert.deepEqual(detectInstallPlatform(ua.samsung), { os: 'android', browser: 'samsung' })
  assert.deepEqual(detectInstallPlatform(ua.windowsEdge), { os: 'windows', browser: 'edge' })
  assert.deepEqual(detectInstallPlatform(ua.chromebook), { os: 'chromeos', browser: 'chrome' })
  assert.deepEqual(detectInstallPlatform(ua.wechat), { os: 'android', browser: 'in-app' })
})

test('explains environments that cannot install', () => {
  assert.match(installBlocker(detectInstallPlatform(ua.wechat)) ?? '', /浏览器中打开/)
  assert.match(installBlocker(detectInstallPlatform(ua.macFirefox)) ?? '', /Firefox/)
  assert.equal(installBlocker(detectInstallPlatform(ua.windowsEdge)), undefined)
})

test('every detected system has a guide', () => {
  for (const os of ['ios', 'android', 'windows', 'macos', 'linux', 'chromeos']) assert.ok(installGuides.some(guide => guide.os === os && guide.steps.length > 0))
})
