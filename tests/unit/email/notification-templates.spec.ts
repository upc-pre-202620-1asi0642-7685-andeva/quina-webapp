import { describe, expect, it } from 'vitest';
import { renderNotificationEmail } from '@/infrastructure/email/templates';

describe('renderNotificationEmail', () => {
  it('da la bienvenida al vecino con la tienda y el enlace a la política (US04 crit. 6)', () => {
    const email = renderNotificationEmail('customer-welcome', 'es', {
      url: 'https://quina.andeva.tech/app/privacy/customers/s-1',
      name: 'Rosa',
      storeName: 'Bodega Don Lucho',
    });
    expect(email.subject).toBe('Bodega Don Lucho te registró en Quina');
    expect(email.text).toContain('Hola, Rosa:');
    expect(email.text).toContain('Ley N.° 29733');
    expect(email.html).toContain('href="https://quina.andeva.tech/app/privacy/customers/s-1"');
  });

  it('invita al empleado con un enlace que vence en 72 horas', () => {
    const email = renderNotificationEmail('account-setup', 'en', {
      url: 'https://quina.andeva.tech/app/auth/accept-invite?token=t',
      name: 'Brayan',
      storeName: 'Bodega Don Lucho',
      audience: 'employee',
    });
    expect(email.subject).toBe('Bodega Don Lucho invited you to Quina');
    expect(email.text).toContain('72 hours');
  });

  it('escapa el nombre de la tienda en el HTML', () => {
    const email = renderNotificationEmail('account-setup', 'es', {
      url: 'https://x.test',
      name: 'Lucho',
      storeName: '<b>Bodega</b>',
      audience: 'owner',
    });
    expect(email.html).not.toContain('<b>Bodega</b>');
  });
});
