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

/** Punto diario (o agrupado en UI) en zona horaria de Lima para los gráficos del reporte. */
export type DailyReportPoint = {
  /** Día de Lima, `YYYY-MM-DD`. */
  day: string;
  cashSales: string;
  creditSales: string;
  totalSales: string;
  grossMargin: string;
  debtCollections: string;
  purchases: string;
  netCashFlow: string;
};

/** Desglose de ventas completadas por medio de pago en el rango elegido. */
export type PaymentMethodBreakdown = {
  method: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'CREDIT';
  total: string;
  count: number;
};

/** Fila de desempeño por producto en el rango elegido (top 10 por ingreso). */
export type ProductSalesRow = {
  productId: string;
  name: string;
  categoryName: string | null;
  unitCode: string;
  quantitySold: string;
  revenue: string;
  cost: string;
  margin: string;
};

/** Fila de desempeño agregado por categoría de producto en el rango elegido. */
export type CategorySalesRow = {
  categoryId: string | null;
  categoryName: string | null;
  revenue: string;
  cost: string;
  margin: string;
  unitsSold: string;
  productsCount: number;
};

/** Analítica extendida del reporte ejecutivo para un rango de fechas de Lima. */
export type ReportAnalytics = {
  previousSummary: ReportSummary;
  collections: {
    totalCollected: string;
    principalCollected: string;
    paymentsCount: number;
  };
  purchasesTotal: string;
  dailySeries: DailyReportPoint[];
  paymentMethods: PaymentMethodBreakdown[];
  topProducts: ProductSalesRow[];
  byCategory: CategorySalesRow[];
};
