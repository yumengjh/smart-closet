// 从 public/yuda-logo.png 生成 PWA 图标（仅 macOS）：swift scripts/generate-pwa-icons.swift
import AppKit

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().path
let logo = NSImage(contentsOfFile: root + "/public/yuda-logo.png")!
let output = root + "/public/icons/"
let aspect = logo.size.height / logo.size.width
// (文件名, 边长, Logo 宽度占比, 是否铺浅色底)
let specs: [(String, Int, Double, Bool)] = [
  ("icon-192.png", 192, 0.86, false), ("icon-512.png", 512, 0.86, false),
  // maskable 需保证主体落在直径 80% 的安全圆内；iOS 不支持透明，需要实底。
  ("maskable-512.png", 512, 0.62, true), ("apple-touch-icon.png", 180, 0.72, true),
]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
for (name, size, fraction, opaque) in specs {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current!.imageInterpolation = .high
  if opaque {
    NSColor(srgbRed: 0xf7 / 255, green: 0xf8 / 255, blue: 0xfa / 255, alpha: 1).setFill()
    NSRect(x: 0, y: 0, width: size, height: size).fill()
  }
  let width = Double(size) * fraction, height = width * aspect
  logo.draw(in: NSRect(x: (Double(size) - width) / 2, y: (Double(size) - height) / 2, width: width, height: height))
  NSGraphicsContext.restoreGraphicsState()
  try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output + name))
}
print("Generated \(specs.count) icons in \(output)")
