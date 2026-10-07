export type InstallOs = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'chromeos'
export type InstallBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'in-app' | 'other'
export type InstallPlatform = { os: InstallOs; browser: InstallBrowser }
export type InstallGuide = { os: InstallOs; label: string; browsers: string; steps: string[]; note?: string }

/** 根据 UA 推断系统与浏览器；iPadOS 13+ 伪装成 macOS，需要借助触控点数区分。 */
export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent
  const os: InstallOs = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1) ? 'ios'
    : /Android/.test(ua) ? 'android'
      : /CrOS/.test(ua) ? 'chromeos'
        : /Windows/.test(ua) ? 'windows'
          : /Macintosh|Mac OS X/.test(ua) ? 'macos'
            : 'linux'
  const browser: InstallBrowser = /MicroMessenger|QQ\/|Weibo|DingTalk|Lark|AlipayClient|FBAN|FBAV|Instagram|Line\//.test(ua) ? 'in-app'
    : /SamsungBrowser/.test(ua) ? 'samsung'
      : /EdgA?\/|EdgiOS\//.test(ua) ? 'edge'
        : /Firefox\/|FxiOS\//.test(ua) ? 'firefox'
          : /CriOS\/|Chrome\//.test(ua) ? 'chrome'
            : /Safari\//.test(ua) ? 'safari'
              : 'other'
  return { os, browser }
}

export const installGuides: InstallGuide[] = [
  {
    os: 'ios',
    label: 'iPhone / iPad',
    browsers: 'Safari（iOS 16.4 起 Chrome、Edge 也可）',
    steps: ['用 Safari 打开鱼搭', '点底部或地址栏旁的「分享」按钮', '在菜单中选择「添加到主屏幕」', '确认名称后点「添加」'],
    note: '若菜单里没有该选项，请上滑分享面板或点「编辑操作」把它加进来。',
  },
  {
    os: 'android',
    label: 'Android',
    browsers: 'Chrome、Edge、三星浏览器',
    steps: ['用 Chrome 打开鱼搭', '点右上角「⋮」菜单', '选择「安装应用」或「添加到主屏幕」', '在弹窗中确认安装'],
    note: '三星浏览器在底部菜单中选「添加页面至」→「主屏幕」。',
  },
  {
    os: 'windows',
    label: 'Windows',
    browsers: 'Edge、Chrome',
    steps: ['点地址栏右侧的「安装」图标', '或打开浏览器菜单 →「应用」/「投射、保存和分享」→「安装鱼搭」', '确认后可固定到任务栏或开始菜单'],
  },
  {
    os: 'macos',
    label: 'macOS',
    browsers: 'Safari 17+、Chrome、Edge',
    steps: ['Safari：菜单栏「文件」→「添加到程序坞」', 'Chrome / Edge：点地址栏右侧的「安装」图标', '安装后可在程序坞和启动台中打开'],
  },
  {
    os: 'linux',
    label: 'Linux',
    browsers: 'Chrome、Edge、Chromium',
    steps: ['点地址栏右侧的「安装」图标', '或打开浏览器菜单 →「投射、保存和分享」→「安装鱼搭」', '安装后可在应用列表中找到'],
  },
  {
    os: 'chromeos',
    label: 'ChromeOS',
    browsers: 'Chrome',
    steps: ['点地址栏右侧的「安装」图标', '或打开菜单 →「投射、保存和分享」→「安装鱼搭」', '安装后在启动器中打开'],
  },
]

/** 当前环境无法直接安装时给出的提示；undefined 表示可按指引正常安装。 */
export function installBlocker({ os, browser }: InstallPlatform): string | undefined {
  if (browser === 'in-app') return '当前在应用内置浏览器中，无法安装。请点右上角菜单，选择「在浏览器中打开」后再试。'
  if (browser === 'firefox' && os !== 'android' && os !== 'ios') return 'Firefox 桌面版暂不支持安装网页应用，请改用 Chrome、Edge 或 Safari 打开。'
  return undefined
}
