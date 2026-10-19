// Strict YYYY-MM-DD → UTC-midnight Date, or null. The round-trip check rejects
// overflow dates that JS would silently normalize (2024-02-31 → Mar 2).
export function parseDate(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str);
  return !isNaN(d.getTime()) && d.toISOString().startsWith(str) ? d : null;
}

// Prisma filter covering the whole UTC day that `date` falls in.
export function dayRange(date) {
  const gte = new Date(date);
  gte.setUTCHours(0, 0, 0, 0);
  const lte = new Date(date);
  lte.setUTCHours(23, 59, 59, 999);
  return { gte, lte };
}
