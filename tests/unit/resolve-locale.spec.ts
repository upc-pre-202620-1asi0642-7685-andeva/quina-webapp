import { describe, expect, it } from 'vitest';
import { resolveLocale } from '@/presentation/i18n/resolve-locale';

describe('resolveLocale', () => {
  it('prioriza la preferencia del usuario sobre la cookie y el navegador', () => {
    expect(resolveLocale({ userPreference: 'qu', cookie: 'en', acceptLanguage: 'es-PE' })).toBe(
      'qu',
    );
  });

  it('usa la cookie quina-lang del sitio si no hay preferencia', () => {
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'es-PE,es;q=0.9' })).toBe('en');
  });

  it('usa Accept-Language respetando la calidad de cada idioma', () => {
    expect(resolveLocale({ acceptLanguage: 'fr-FR,en;q=0.5,qu;q=0.8' })).toBe('qu');
  });

  it('ignora valores desconocidos y vuelve al castellano', () => {
    expect(resolveLocale({ userPreference: 'pt', cookie: 'xx', acceptLanguage: 'de-DE' })).toBe(
      'es',
    );
  });

  it('usa castellano cuando no hay ninguna señal', () => {
    expect(resolveLocale({})).toBe('es');
  });
});
