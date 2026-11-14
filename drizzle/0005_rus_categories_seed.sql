-- Topes mensuales del Nuevo RUS (US21, Plan 8). Fuente: D. Leg. N.° 937, artículo 7,
-- modificado por el D. Leg. N.° 1270 (vigente desde el 01/01/2017): categoría 1 hasta
-- S/ 5,000 de ingresos y de compras al mes; categoría 2 hasta S/ 8,000.
-- valid_to queda en NULL: rige hasta que el Administrador registre la vigencia siguiente.
INSERT INTO rus_categories (category, monthly_income_cap, monthly_purchases_cap, valid_from, valid_to)
VALUES
    (1, 5000.00, 5000.00, DATE '2017-01-01', NULL),
    (2, 8000.00, 8000.00, DATE '2017-01-01', NULL)
ON CONFLICT ON CONSTRAINT uq_rus_categories_period DO NOTHING;
