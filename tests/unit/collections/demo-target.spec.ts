import { describe, expect, it } from 'vitest';
import { demoTarget } from '../../../scripts/demo/demo-collections';

const base = {
  DATABASE_URL: 'postgres://quina_app:x@localhost:54329/quina',
  DEMO_STORE_ID: '3f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f',
  DEMO_CONFIRM: 'localhost:54329',
};

describe('demoTarget (P8)', () => {
  it('corre con la tienda y el host de la base confirmados', () => {
    expect(demoTarget(base)).toEqual({ storeId: base.DEMO_STORE_ID });
  });

  it('se niega en producción aunque todo lo demás esté bien', () => {
    expect(demoTarget({ ...base, VERCEL_ENV: 'production' })).toHaveProperty('refused');
    expect(demoTarget({ ...base, NODE_ENV: 'production' })).toHaveProperty('refused');
  });

  it('exige confirmar el host de la base de destino', () => {
    expect(demoTarget({ ...base, DEMO_CONFIRM: undefined })).toEqual({
      refused: 'Confirma el destino con DEMO_CONFIRM=localhost:54329',
    });
    expect(demoTarget({ ...base, DEMO_STORE_ID: 'otra' })).toHaveProperty('refused');
  });
});
