/** Keep numerically in sync with the :root / :root[data-theme='dark'] blocks in src/style.css. */
export const tokens = {
  light: {
    ink: '#25262b', muted: '#666b76', mutedSubtle: '#858a97', line: '#e8e9ee', surface: '#fff', surfaceAlt: '#f5f6f8', paper: '#f7f8fa',
    action: '#25262b', actionHover: '#414247', actionFg: '#fff',
    accent: '#1f5c45', accentStrong: '#16432f', accentSoft: '#eef6f1', selectionBg: '#eceef1',
    success: '#1f8a6e', warning: '#956516', danger: '#bd4b4b', info: '#385eac', focusRing: '#9fd8bd',
  },
  dark: {
    ink: '#edf0f6', muted: '#aab2c0', mutedSubtle: '#929bab', line: '#3b404b', surface: '#242832', surfaceAlt: '#2d323d', paper: '#191c23',
    action: '#edf0f6', actionHover: '#cfd3db', actionFg: '#191c23',
    accent: '#5fcb9d', accentStrong: '#79d6ac', accentSoft: '#1d2e26', selectionBg: '#333841',
    success: '#5fd0a8', warning: '#e7bf72', danger: '#f19a9b', info: '#a9c1ff', focusRing: '#5fcb9d',
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
    borderRadius: 10,
    controlHeight: 44,
    fontSize: 14,
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  }
}

export function antComponentTokens(mode: ThemeMode) {
  const t = tokens[mode]
  return {
    Button: { fontWeight: 500, primaryShadow: 'none' },
    Input: { activeShadow: `0 0 0 3px ${t.accent}30` },
  }
}
