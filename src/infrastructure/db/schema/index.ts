// Las 35 tablas de docs/quina-database-schema.md, agrupadas por dominio.
// RLS, triggers de inmutabilidad y roles van en una migración SQL aparte.
export * from './identity';
export * from './credit';
export * from './catalog';
export * from './sales';
export * from './ledger';
export * from './notifications';
export * from './audit';
