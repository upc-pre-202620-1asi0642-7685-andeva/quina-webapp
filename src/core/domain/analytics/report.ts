/**
 * US20 crit. 1: reporte financiero de un rango de fechas, solo con montos
 * agregados de la tienda (texto con 2 decimales). No lleva nombres, documentos
 * ni identificadores: es lo único que viaja al modelo de IA (crit. 3).
 */
export type ReportSummary = {
  /** Días de Lima, `YYYY-MM-DD`. */
  from: string;
  to: string;
  cashSales: string;
  creditSales: string;
  compensatoryInterest: string;
  moratoryInterest: string;
  costOfSales: string;
  grossMargin: string;
  salesCount: number;
};

/** US20 crit. 5: una tarjeta de recomendación en lenguaje del bodeguero. */
export type Recommendation = { title: string; body: string };
