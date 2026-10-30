const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Lima',
});

/** Fecha corta peruana en cualquier idioma (`5 nov 2026`, DESIGN.md §10). */
export function formatDate(date: Date): string {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  const month = (parts.month ?? '').replace(/\.$/, '').toLowerCase();
  return `${parts.day} ${month} ${parts.year}`;
}
