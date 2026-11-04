import { compareWithKarekod } from './karekod';
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
  /** Karekod documents matched to an XML document with the same ETTN. */
  paired: number;
}

/**
 * Adds new documents to the collection.
 * - Byte-identical XML re-imports and repeated karekods are skipped.
 * - A karekod (PDF/photo) and an XML with the same ETTN become one row: the XML
 *   keeps its full data, gains the preview, and any disagreement is flagged.
 *   This also prevents counting the same invoice twice in the totals.
 * - Same ETTN with different XML content is kept and flagged as a duplicate.
 */
export function mergeDocuments(existing: UblDocument[], incoming: UblDocument[]): MergeResult {
  const docs = [...existing];
  const byUuid = new Map<string, number>();
  docs.forEach((d, i) => {
    if (d.uuid && !byUuid.has(d.uuid)) byUuid.set(d.uuid, i);
  });
  let skippedDuplicates = 0;
  let paired = 0;

  for (const doc of incoming) {
    const index = doc.uuid ? byUuid.get(doc.uuid) : undefined;
    if (index === undefined) {
      if (doc.uuid) byUuid.set(doc.uuid, docs.length);
      docs.push(doc);
      continue;
    }
    const current = docs[index]!;
    if (doc.source === 'karekod') {
      if (current.source === 'xml' && !current.pairedFile) {
        docs[index] = pairWithKarekod(current, doc);
        paired += 1;
      } else {
        skippedDuplicates += 1;
      }
      continue;
    }
    if (current.source === 'karekod') {
      docs[index] = pairWithKarekod(doc, current);
      paired += 1;
      continue;
    }
    if (current.xml === doc.xml) {
      skippedDuplicates += 1;
      continue;
    }
    docs.push(doc);
  }
  return { docs: fillKnownNames(flagDuplicates(docs)), skippedDuplicates, paired };
}

/** Karekods carry IDs only; borrow company names from XML documents loaded in the same session. */
function fillKnownNames(docs: UblDocument[]): UblDocument[] {
  const names = new Map<string, string>();
  for (const d of docs) {
    if (d.source !== 'xml') continue;
    for (const p of [d.supplier, d.customer]) {
      const id = p.vkn ?? p.tckn;
      if (id && p.name && !names.has(id)) names.set(id, p.name);
    }
  }
  return docs.map((d) => {
    if (d.source !== 'karekod') return d;
    const fill = (p: UblDocument['supplier']) => (p.name ? p : { ...p, name: names.get(p.vkn ?? p.tckn ?? '') ?? '' });
    const supplier = fill(d.supplier);
    const customer = fill(d.customer);
    return supplier === d.supplier && customer === d.customer ? d : { ...d, supplier, customer };
  });
}

export function pairWithKarekod(xmlDoc: UblDocument, qrDoc: UblDocument): UblDocument {
  const mismatches: Finding[] = compareWithKarekod(xmlDoc, qrDoc).map((d) => ({
    level: 'error',
    code: 'karekodMismatch',
    params: { field: d.field, xml: d.xml, karekod: d.karekod, file: qrDoc.fileName },
  }));
  return {
    ...xmlDoc,
    preview: qrDoc.preview ?? xmlDoc.preview,
    pairedFile: qrDoc.fileName,
    findings: [...xmlDoc.findings.filter((f) => f.code !== 'karekodMismatch'), ...mismatches],
  };
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
