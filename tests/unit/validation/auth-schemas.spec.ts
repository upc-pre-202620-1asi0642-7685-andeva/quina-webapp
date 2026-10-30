import { describe, expect, it } from 'vitest';
import { accountSchema, loginSchema, storeSchema } from '@/presentation/validation/auth-schemas';

describe('authSchemas', () => {
  describe('accountSchema', () => {
    it('acepta datos válidos y normaliza el correo a minúsculas', () => {
      const parsed = accountSchema.safeParse({
        name: '  Lucho Quispe  ',
        email: '  LUCHO@Bodega.pe ',
        password: 'Bodega#2026',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toEqual({
          name: 'Lucho Quispe',
          email: 'lucho@bodega.pe',
          password: 'Bodega#2026',
        });
      }
    });

    it('rechaza contraseñas débiles con las mismas reglas que PasswordPolicy', () => {
      for (const weak of ['bodega', 'bodega2026', 'Bodega2026', 'Bodega!a']) {
        const parsed = accountSchema.safeParse({
          name: 'Lucho Quispe',
          email: 'lucho@bodega.pe',
          password: weak,
        });
        expect(parsed.success).toBe(false);
      }
    });

    it('rechaza nombre vacío o correo inválido', () => {
      expect(
        accountSchema.safeParse({ name: ' ', email: 'lucho@bodega.pe', password: 'Bodega#2026' })
          .success,
      ).toBe(false);
      expect(
        accountSchema.safeParse({ name: 'Lucho', email: 'no-es-correo', password: 'Bodega#2026' })
          .success,
      ).toBe(false);
    });
  });

  describe('storeSchema', () => {
    it('acepta RUC de 11 dígitos o DNI de 8 dígitos con espacios o guiones', () => {
      const ruc = storeSchema.safeParse({
        commercialName: '  Bodega Don Lucho ',
        businessTurn: 'BODEGA',
        taxId: '20 123456789',
      });
      expect(ruc.success).toBe(true);
      if (ruc.success) {
        expect(ruc.data).toEqual({
          commercialName: 'Bodega Don Lucho',
          businessTurn: 'BODEGA',
          taxId: '20123456789',
        });
      }

      const dni = storeSchema.safeParse({
        commercialName: 'Botica Salud',
        businessTurn: 'BOTICA',
        taxId: '4567-8901',
      });
      expect(dni.success).toBe(true);
      if (dni.success) {
        expect(dni.data.taxId).toBe('45678901');
      }
    });

    it('rechaza RUC/DNI inválido o giro desconocido', () => {
      expect(
        storeSchema.safeParse({
          commercialName: 'Bodega',
          businessTurn: 'BODEGA',
          taxId: '12345',
        }).success,
      ).toBe(false);
      expect(
        storeSchema.safeParse({
          commercialName: 'Bodega',
          businessTurn: 'BANCO',
          taxId: '20123456789',
        }).success,
      ).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('valida correo y presencia de contraseña', () => {
      expect(
        loginSchema.safeParse({ email: 'Lucho@Bodega.pe', password: 'cualquiera' }).success,
      ).toBe(true);
      expect(loginSchema.safeParse({ email: 'invalido', password: 'x' }).success).toBe(false);
      expect(loginSchema.safeParse({ email: 'a@b.pe', password: '' }).success).toBe(false);
    });
  });
});
