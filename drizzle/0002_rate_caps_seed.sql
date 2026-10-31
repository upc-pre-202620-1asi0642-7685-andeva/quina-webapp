-- Topes del BCRP para operaciones entre personas ajenas al sistema financiero (US06.2).
-- Fuente: tabla "Tasas máximas de interés compensatorio" del BCRP al 30/10/2026,
-- vigente desde el 01/05/2026. La moratoria máxima es el 15 % de la compensatoria
-- (Circular N.° 0008-2021-BCRP) y se redondea hacia abajo para no pasar el tope.
-- valid_to queda en NULL: rige hasta que el Administrador registre la vigencia siguiente.
INSERT INTO credit_rate_caps (rate_kind, currency, max_effective_annual_rate, valid_from, valid_to, source_reference)
VALUES
    ('COMPENSATORY', 'PEN', 1.1413, DATE '2026-05-01', NULL, 'BCRP, Circular N.° 0008-2021-BCRP; tasa máxima en moneda nacional 114.13 % (mayo-octubre 2026)'),
    ('COMPENSATORY', 'USD', 0.9984, DATE '2026-05-01', NULL, 'BCRP, Circular N.° 0008-2021-BCRP; tasa máxima en moneda extranjera 99.84 % (mayo-octubre 2026)'),
    ('MORATORY', 'PEN', 0.1711, DATE '2026-05-01', NULL, 'BCRP, Circular N.° 0008-2021-BCRP; 15 % de la compensatoria máxima en moneda nacional (17.1195 %)'),
    ('MORATORY', 'USD', 0.1497, DATE '2026-05-01', NULL, 'BCRP, Circular N.° 0008-2021-BCRP; 15 % de la compensatoria máxima en moneda extranjera (14.976 %)')
ON CONFLICT ON CONSTRAINT uq_rate_caps_period DO NOTHING;
