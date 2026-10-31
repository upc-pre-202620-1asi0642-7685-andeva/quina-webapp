import data from './datasets.json';

/**
 * Juegos de datos del informe (docs/quina-financial-engine.md). Los valores
 * esperados los calcula `scripts/finance-oracle.py`, que no comparte código con
 * el motor en TypeScript.
 */
export const datasets = data.datasets;
export const control = data.control;
export type Dataset = (typeof datasets)[number];
