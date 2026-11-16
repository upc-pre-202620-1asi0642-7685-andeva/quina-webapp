import { describe, expect, it } from 'vitest';
import { parseUserAgent } from '@/presentation/lib/user-agent';
import { changePasswordSchema, updateProfileSchema } from '@/presentation/validation/auth-schemas';

describe('parseUserAgent', () => {
  it('identifica dispositivos móviles iOS y Android correctamente', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', os: 'iOS', deviceType: 'mobile' });

    expect(
      parseUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      ),
    ).toEqual({ browser: 'Chrome', os: 'Android', deviceType: 'mobile' });
  });

  it('identifica navegadores de escritorio y valores vacíos', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
      ),
    ).toEqual({ browser: 'Edge', os: 'Windows', deviceType: 'desktop' });

    expect(parseUserAgent(null)).toEqual({
      browser: null,
      os: null,
      deviceType: 'desktop',
    });
  });
});

describe('updateProfileSchema', () => {
  it('normaliza el nombre y acepta celular peruano válido o vacío', () => {
    const valid = updateProfileSchema.safeParse({
      name: '  Carmen   Rojas  ',
      phone: '+51 987 654 321',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toEqual({ name: 'Carmen Rojas', phone: '987654321' });
    }

    const cleared = updateProfileSchema.safeParse({ name: 'Carmen Rojas', phone: '   ' });
    expect(cleared.success).toBe(true);
    if (cleared.success) {
      expect(cleared.data.phone).toBeNull();
    }
  });

  it('rechaza nombres inválidos y celulares fuera de formato', () => {
    const bad = updateProfileSchema.safeParse({ name: '123', phone: '812345678' });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const paths = bad.error.issues.map((i) => `${String(i.path[0])}:${i.message}`);
      expect(paths).toContain('name:nameInvalid');
      expect(paths).toContain('phone:phoneInvalid');
    }
  });
});

describe('changePasswordSchema', () => {
  it('exige contraseña actual, política fuerte y confirmación idéntica', () => {
    const ok = changePasswordSchema.safeParse({
      currentPassword: 'Old#Password1',
      newPassword: 'New#Password2',
      confirmPassword: 'New#Password2',
      revokeOtherSessions: true,
    });
    expect(ok.success).toBe(true);

    const mismatch = changePasswordSchema.safeParse({
      currentPassword: 'Old#Password1',
      newPassword: 'New#Password2',
      confirmPassword: 'Other#Password2',
      revokeOtherSessions: false,
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.issues[0]?.message).toBe('passwordMismatch');
    }
  });
});
