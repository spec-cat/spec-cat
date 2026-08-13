type RainglowColors = Record<string, string | undefined>

export function getThemeVars(colors: RainglowColors) {
  return {
    '--rg-title': colors['titleBar.activeBackground'] || '#20201d',
    '--rg-activity': colors['activityBar.background'] || '#302f2c',
    '--rg-sidebar': colors['sideBar.background'] || '#383733',
    '--rg-sidebar-header': colors['sideBarSectionHeader.background'] || '#403f3a',
    '--rg-editor': colors['editor.background'] || '#2b2a27',
    '--rg-editor-group': colors['editorGroupHeader.tabsBackground'] || '#33322e',
    '--rg-terminal': colors['terminal.background'] || '#1e1d1b',
    '--rg-panel': colors['panel.background'] || '#46443f',
    '--rg-input': colors['input.background'] || '#1e1d1b',
    '--rg-border': colors['panel.border'] || '#605e57',
    '--rg-foreground': colors.foreground || colors['editor.foreground'] || '#ede0ce',
    '--rg-muted': colors['panelTitle.inactiveForeground'] || '#88857c',
    '--rg-accent': colors['activityBarBadge.background'] || '#26a6a6',
    '--rg-button': colors['button.background'] || '#ff5d38',
    '--rg-status': colors['statusBar.background'] || '#26a6a6',
    '--rg-selection': colors['list.activeSelectionBackground'] || '#ff5d38'
  }
}

export function getXtermTheme(colors: RainglowColors) {
  return {
    background: colors['terminal.background'] || colors['editor.background'] || '#1e1d1b',
    foreground: colors['terminal.foreground'] || colors.foreground || '#ede0ce',
    cursor: colors['editorCursor.foreground'] || colors.foreground || '#f8f8f0',
    selectionBackground: colors['editor.selectionBackground'] || '#ff5d3855',
    black: colors['terminal.ansiBlack'] || '#383733',
    red: colors['terminal.ansiRed'] || '#ba0e2e',
    green: colors['terminal.ansiGreen'] || '#26a6a6',
    yellow: colors['terminal.ansiYellow'] || '#ff5d38',
    blue: colors['terminal.ansiBlue'] || '#bcd42a',
    magenta: colors['terminal.ansiMagenta'] || '#26a6a6',
    cyan: colors['terminal.ansiCyan'] || '#ff5d38',
    white: colors['terminal.ansiWhite'] || '#f4ece1',
    brightBlack: colors['terminal.ansiBrightBlack'] || '#605e57',
    brightRed: colors['terminal.ansiBrightRed'] || '#f03e5f',
    brightGreen: colors['terminal.ansiBrightGreen'] || '#59d9d9',
    brightYellow: colors['terminal.ansiBrightYellow'] || '#ffb09e',
    brightBlue: colors['terminal.ansiBrightBlue'] || '#d7e67e',
    brightMagenta: colors['terminal.ansiBrightMagenta'] || '#59d9d9',
    brightCyan: colors['terminal.ansiBrightCyan'] || '#ffb09e',
    brightWhite: colors['terminal.ansiBrightWhite'] || '#ffffff'
  }
}
