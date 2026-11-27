// Start TRYON_FIXTURE_TIERS=1 npm run dev:tryon-fixture, then run ego-browser nodejs < scripts/check-tryon-cover.mjs.
const task = await taskSpace('鱼搭镜头封面命中测试')
const page = task.page('p1')
const failures = []
try {
  await page.goto('http://127.0.0.1:5187/try-on?garment=g-1')
  await page.waitForSelector('.tryon-tier-picker label')
  for (const [width, height] of [[667, 375], [320, 568], [360, 640]]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await page.waitForFunction(w => innerWidth === w, width)
    const hits = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const controls = document.querySelectorAll('.tryon-tier-picker label, .tryon-cover-actions button')
      return Array.from(controls, control => {
        const { x, y, width, height } = control.getBoundingClientRect()
        const target = document.elementFromPoint(x + width / 2, y + height / 2)
        return { label: control.textContent.trim(), hit: control.contains(target), center: [Math.round(x + width / 2), Math.round(y + height / 2)] }
      })
    })
    console.log(`${width}×${height}`, hits)
    if (hits.length !== 4 || hits.some(control => !control.hit)) failures.push(`${width}×${height}`)
  }
} finally {
  await task.finish({ keep: [] })
}
if (failures.length) throw new Error(`遮挡或缺失的封面操作：${failures.join('、')}`)
