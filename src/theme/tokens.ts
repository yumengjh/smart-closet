/** Keep numerically in sync with the :root / :root[data-theme='dark'] blocks in src/style.css. */
export const tokens = {
  light: {
    ink: '#111111', muted: '#6b6b6b', mutedSubtle: '#9b9b9b', line: '#e7e7e4', surface: '#ffffff', surfaceAlt: '#f3f3f1', paper: '#fafaf9',
    action: '#111111', actionHover: '#2b2b2b', actionFg: '#ffffff',
    accent: '#2f5fe0', accentStrong: '#2450c8', accentSoft: '#edf2fe', selectionBg: '#ececea',
    success: '#2f7d5b', warning: '#8a6418', danger: '#b2433f', info: '#3c5a8a', focusRing: '#9db5f7',
    board: '#ffffff',
  },
  dark: {
    ink: '#f2f2f0', muted: '#a3a3a0', mutedSubtle: '#767673', line: '#2a2a28', surface: '#161616', surfaceAlt: '#1e1e1d', paper: '#0d0d0d',
    action: '#f2f2f0', actionHover: '#d6d6d3', actionFg: '#0d0d0d',
    accent: '#8fb0ff', accentStrong: '#b3c9ff', accentSoft: '#1b2340', selectionBg: '#262625',
    success: '#7cc4a1', warning: '#d9b46a', danger: '#e8938f', info: '#a9bde0', focusRing: '#4a68b8',
    /** Outfit board shown on screen; exports stay white. */
    board: '#1e1e1d',
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
    colorTextSecondary: t.muted,
    colorTextLightSolid: t.actionFg,
    colorBgBase: mode === 'dark' ? t.paper : '#ffffff',
    colorBgLayout: t.paper,
    colorBgContainer: t.surface,
    colorBorder: t.line,
    colorTextDisabled: t.mutedSubtle,
    colorBgContainerDisabled: t.surfaceAlt,
    borderRadius: 10,
    controlHeight: 38,
    controlHeightLG: 48,
    controlHeightSM: 28,
    fontSize: 14,
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  }
}

export function antComponentTokens(mode: ThemeMode) {
  const t = tokens[mode]
  return {
    // ToC 改版（二）T15：按钮是小圆角矩形（不再是胶囊），无阴影；主按钮纯黑（深色主题纯白），次按钮细线框。
    Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none', borderRadius: 10, borderRadiusLG: 12, borderRadiusSM: 8, defaultBorderColor: t.line, defaultBg: 'transparent' },
    Modal: { borderRadiusLG: 20 },
    Input: { activeShadow: `0 0 0 2px ${t.ink}14` },
    Segmented: { borderRadius: 10, borderRadiusSM: 8, itemSelectedColor: t.ink },
    Tag: { borderRadiusSM: 6 },
  }
}
