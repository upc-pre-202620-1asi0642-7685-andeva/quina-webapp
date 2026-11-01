/** `20.000` → `20`, `2.500` → `2.5`: cantidades sin ceros de más y sin pasar por `number`. */
export function formatQuantity(quantity: string): string {
  if (!quantity.includes('.')) return quantity;
  return quantity.replace(/\.?0+$/, '') || '0';
}
