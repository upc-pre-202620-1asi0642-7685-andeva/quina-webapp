export const themeChoices = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof themeChoices)[number];
export const defaultTheme: ThemeChoice = 'system';
