const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Lima',
});

const timeFormatter = new Intl.DateTimeFormat('es-PE', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Lima',
});

/** Fecha corta peruana en cualquier idioma (`5 nov 2026`, DESIGN.md §10). */
export function formatDate(date: Date): string {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  const month = (parts.month ?? '').replace(/\.$/, '').toLowerCase();
  return `${parts.day} ${month} ${parts.year}`;
}

/** Hora peruana en America/Lima (`6:00 p. m.`, DESIGN.md §10). */
export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

/** Fecha y hora peruana en America/Lima (`5 nov 2026 · 6:00 p. m.`). */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} · ${formatTime(date)}`;
}
