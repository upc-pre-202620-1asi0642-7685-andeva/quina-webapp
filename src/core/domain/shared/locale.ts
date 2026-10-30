export const locales = ['es', 'en', 'qu'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';
