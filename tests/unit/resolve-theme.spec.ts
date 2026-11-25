import { describe, expect, it } from 'vitest';
import { resolveTheme } from '@/presentation/lib/resolve-theme';

describe('resolveTheme', () => {
  it('prioriza la preferencia del usuario sobre la cookie del sitio', () => {
    expect(resolveTheme({ userPreference: 'light', cookie: 'dark' })).toBe('light');
    expect(resolveTheme({ userPreference: 'system', cookie: 'dark' })).toBe('system');
  });

  it('usa la cookie quina-theme del sitio cuando no hay preferencia de usuario', () => {
    expect(resolveTheme({ cookie: 'dark' })).toBe('dark');
    expect(resolveTheme({ cookie: 'light' })).toBe('light');
  });

  it('ignora valores desconocidos y vuelve a system', () => {
    expect(resolveTheme({ userPreference: 'sepia', cookie: 'midnight' })).toBe('system');
    expect(resolveTheme({})).toBe('system');
  });
});
