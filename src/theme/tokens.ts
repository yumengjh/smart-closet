/** Keep numerically in sync with the :root / :root[data-theme='dark'] blocks in src/style.css. */
export const tokens = {
  light: {
    ink: '#1f1b16', muted: '#6b6157', mutedSubtle: '#94897c', line: '#e8dfd2', surface: '#fffdf9', surfaceAlt: '#f3ece2', paper: '#f7f2eb',
    action: '#1f1b16', actionHover: '#3a332b', actionFg: '#fffdf9',
    accent: '#b9432c', accentStrong: '#a83a26', accentSoft: '#fbe6de', selectionBg: '#f7e4dc',
    success: '#1f8a6e', warning: '#956516', danger: '#bd4b4b', info: '#385eac', focusRing: '#f0a08f',
    board: '#ffffff',
  },
  dark: {
    ink: '#f5eee5', muted: '#b5a99a', mutedSubtle: '#8d8274', line: '#352d26', surface: '#1f1a16', surfaceAlt: '#29231e', paper: '#15110e',
    action: '#f5eee5', actionHover: '#ddd2c4', actionFg: '#15110e',
    accent: '#f08a73', accentStrong: '#f6a693', accentSoft: '#3b231a', selectionBg: '#3a2a22',
    success: '#5fd0a8', warning: '#e7bf72', danger: '#f19a9b', info: '#a9c1ff', focusRing: '#f08a73',
    /** Outfit board shown on screen; exports stay white. */
    board: '#29231e',
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
