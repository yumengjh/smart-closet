/** Keep numerically in sync with the :root / :root[data-theme='dark'] blocks in src/style.css. */
export const tokens = {
  light: {
    ink: '#16201e', muted: '#5f6b68', mutedSubtle: '#86908d', line: '#e6edeb', surface: '#fff', surfaceAlt: '#f1f6f4', paper: '#f7faf9',
    action: '#16201e', actionHover: '#2f3c39', actionFg: '#fff',
    accent: '#0e8a76', accentStrong: '#0b6f5f', accentSoft: '#e6f6f2', selectionBg: '#e6f1ed',
    success: '#1f8a6e', warning: '#956516', danger: '#bd4b4b', info: '#385eac', focusRing: '#8fdccb',
    board: '#ffffff',
  },
  dark: {
    ink: '#ecf2f0', muted: '#a5b1ae', mutedSubtle: '#8b9895', line: '#2a3633', surface: '#18201e', surfaceAlt: '#1f2927', paper: '#0f1413',
    action: '#ecf2f0', actionHover: '#cbd6d3', actionFg: '#0f1413',
    accent: '#42d3b8', accentStrong: '#6fe0ca', accentSoft: '#15302a', selectionBg: '#24322f',
    success: '#5fd0a8', warning: '#e7bf72', danger: '#f19a9b', info: '#a9c1ff', focusRing: '#42d3b8',
    /** Outfit board shown on screen; exports stay white. */
    board: '#1f2927',
  },
} as const

export type ThemeMode = 'light' | 'dark'

export function antTokens(mode: ThemeMode) {
  const t = tokens[mode]
  return {
    colorPrimary: t.action,
    colorInfo: t.info,
    colorLink: t.accentStrong,
    colorSuccess: t.success,
    colorWarning: t.warning,
    colorError: t.danger,
    colorText: t.ink,
    colorTextSecondary: mode === 'dark' ? '#aeb5c2' : '#737680',
    colorTextLightSolid: t.actionFg,
    colorBgBase: mode === 'dark' ? t.paper : '#ffffff',
    colorBgLayout: t.paper,
    colorBgContainer: t.surface,
    colorBorder: t.line,
    colorTextDisabled: t.mutedSubtle,
    colorBgContainerDisabled: t.surfaceAlt,
    borderRadius: 12,
    controlHeight: 36,
    controlHeightLG: 40,
    controlHeightSM: 28,
    fontSize: 14,
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  }
}

export function antComponentTokens(mode: ThemeMode) {
  const t = tokens[mode]
  return {
    // 清新改版：按钮统一胶囊形；自定义外观的按钮（如卡片式选项）在各自样式里写死圆角。
    Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', borderRadius: 999, borderRadiusLG: 999, borderRadiusSM: 999 },
    Modal: { borderRadiusLG: 24 },
    Input: { activeShadow: `0 0 0 3px ${t.accent}30` },
  }
}
