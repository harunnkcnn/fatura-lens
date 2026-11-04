import type { Finding, UblDocument } from './types';

export type Direction = 'incoming' | 'outgoing' | null;

export function partyIds(doc: UblDocument, role: 'supplier' | 'customer'): string[] {
  const party = doc[role];
  return [party.vkn, party.tckn].filter((v): v is string => Boolean(v));
}

/** Classifies a document relative to the user's own VKN/TCKN list. */
export function directionOf(doc: UblDocument, myIds: ReadonlySet<string>): Direction {
  if (myIds.size === 0) return null;
  if (partyIds(doc, 'supplier').some((id) => myIds.has(id))) return 'outgoing';
  if (partyIds(doc, 'customer').some((id) => myIds.has(id))) return 'incoming';
  return null;
}

export interface CurrencySummary {
  currency: string;
  count: number;
  taxExclusive: number;
  vat: number;
  withholding: number;
  taxInclusive: number;
  payable: number;
  vatByRate: { percent: number; taxable: number; amount: number }[];
}

/** Integer kuruş arithmetic avoids float drift across hundreds of documents. */
const minor = (n: number | null | undefined) => Math.round((n ?? 0) * 100);
const major = (n: number) => n / 100;

/** Totals per currency — never sums TRY with USD/EUR. Despatch advices are skipped. */
export function summarize(docs: UblDocument[]): CurrencySummary[] {
  const byCurrency = new Map<
    string,
    { count: number; taxExclusive: number; vat: number; withholding: number; taxInclusive: number; payable: number; rates: Map<number, { taxable: number; amount: number }> }
  >();
  for (const doc of docs) {
    if (!doc.totals) continue;
    let acc = byCurrency.get(doc.currency);
    if (!acc) {
      acc = { count: 0, taxExclusive: 0, vat: 0, withholding: 0, taxInclusive: 0, payable: 0, rates: new Map() };
      byCurrency.set(doc.currency, acc);
    }
    acc.count += 1;
    acc.taxExclusive += minor(doc.totals.taxExclusive);
    acc.vat += minor(doc.totals.vat);
    acc.withholding += minor(doc.totals.withholding);
    acc.taxInclusive += minor(doc.totals.taxInclusive);
    acc.payable += minor(doc.totals.payable);
    for (const tax of doc.taxes) {
      if (tax.code !== '0015' || tax.percent === null) continue;
      const rate = acc.rates.get(tax.percent) ?? { taxable: 0, amount: 0 };
      rate.taxable += minor(tax.taxable);
      rate.amount += minor(tax.amount);
      acc.rates.set(tax.percent, rate);
    }
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => (a === 'TRY' ? -1 : b === 'TRY' ? 1 : a.localeCompare(b)))
    .map(([currency, acc]) => ({
      currency,
      count: acc.count,
      taxExclusive: major(acc.taxExclusive),
      vat: major(acc.vat),
      withholding: major(acc.withholding),
      taxInclusive: major(acc.taxInclusive),
      payable: major(acc.payable),
      vatByRate: [...acc.rates.entries()]
        .sort(([a], [b]) => b - a)
        .map(([percent, r]) => ({ percent, taxable: major(r.taxable), amount: major(r.amount) })),
    }));
}

export interface MergeResult {
  docs: UblDocument[];
  skippedDuplicates: number;
}

/**
 * Adds new documents to the collection. Byte-identical re-imports (same UUID,
 * same XML) are skipped; same UUID with different content is kept and flagged.
 */
export function mergeDocuments(existing: UblDocument[], incoming: UblDocument[]): MergeResult {
  const seen = new Map<string, string>(existing.filter((d) => d.uuid).map((d) => [d.uuid, d.xml]));
  const added: UblDocument[] = [];
  let skippedDuplicates = 0;
  for (const doc of incoming) {
    if (doc.uuid && seen.get(doc.uuid) === doc.xml) {
      skippedDuplicates += 1;
      continue;
    }
    if (doc.uuid) seen.set(doc.uuid, doc.xml);
    added.push(doc);
  }
  return { docs: flagDuplicates([...existing, ...added]), skippedDuplicates };
}

function flagDuplicates(docs: UblDocument[]): UblDocument[] {
  const counts = new Map<string, number>();
  for (const d of docs) if (d.uuid) counts.set(d.uuid, (counts.get(d.uuid) ?? 0) + 1);
  return docs.map((doc) => {
    const isDuplicate = (counts.get(doc.uuid) ?? 0) > 1;
    const hasFlag = doc.findings.some((f) => f.code === 'duplicateUuid');
    if (isDuplicate === hasFlag) return doc;
    const findings: Finding[] = isDuplicate
      ? [...doc.findings, { level: 'error', code: 'duplicateUuid', params: { value: doc.uuid } }]
      : doc.findings.filter((f) => f.code !== 'duplicateUuid');
    return { ...doc, findings };
  });
}

export function worstLevel(doc: UblDocument): Finding['level'] | null {
  if (doc.findings.some((f) => f.level === 'error')) return 'error';
  if (doc.findings.some((f) => f.level === 'warning')) return 'warning';
  if (doc.findings.some((f) => f.level === 'info')) return 'info';
  return null;
}
