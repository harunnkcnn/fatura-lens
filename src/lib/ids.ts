/** Turkish tax number (VKN, 10 digits) check-digit validation. */
export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const d = Array.from(value, Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const c1 = ((d[i] ?? 0) + 9 - i) % 10;
    const c2 = (c1 * 2 ** (9 - i)) % 9;
    sum += c1 !== 0 && c2 === 0 ? 9 : c2;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

/** GİB's placeholder for consumers without a known ID on e-Arşiv invoices. */
export const ANONYMOUS_TCKN = '11111111111';
/** GİB's placeholder VKN for foreign buyers (export invoices). */
export const FOREIGN_VKN = '2222222222';

/** Turkish national ID (TCKN, 11 digits) check-digit validation. */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = Array.from(value, Number) as number[];
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  if (tenth !== d[9]) return false;
  const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return eleventh === d[10];
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** GİB document number: 3-char prefix + 4-digit year + 9-digit sequence. */
export function isGibDocumentNumber(value: string): boolean {
  return /^[A-Z0-9]{3}\d{13}$/.test(value);
}
