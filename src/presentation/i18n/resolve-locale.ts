export const locales = ['es', 'en', 'qu'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

/** Cookie de idioma compartida con el sitio público (mismo origen). */
export const LOCALE_COOKIE = 'quina-lang';

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale);
}

/**
 * Idioma de la interfaz, en el orden de AGENTS.md (sección 6): preferencia del
 * usuario con sesión, luego la cookie `quina-lang`, luego `Accept-Language` y,
 * por último, castellano. El idioma nunca va en la URL.
 */
export function resolveLocale(input: {
  userPreference?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.userPreference)) return input.userPreference;
  if (isLocale(input.cookie)) return input.cookie;
  return fromAcceptLanguage(input.acceptLanguage) ?? defaultLocale;
}

function fromAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;

  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((param) => param.trim().startsWith('q='));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      return { tag: tag.toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return undefined;
}
