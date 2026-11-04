/**
 * GİB "Karekod Standardı Kılavuzu" (v1.2, 2023) reader.
 *
 * Every e-Fatura / e-Arşiv / e-İrsaliye PDF carries a QR code whose payload is
 * a flat JSON object. It holds the summary of the document, not its lines:
 *
 *   e-Fatura:   vkntckn, avkntckn, senaryo, tip, tarih, no, ettn, parabirimi,
 *               malhizmettoplam, kdvmatrah(<oran>), hesaplanankdv(<oran>),
 *               vergidahil, odenecek
 *   e-İrsaliye: vkntckn, avkntckn, senaryo, tip, tarih, no, ettn,
 *               sevktarihi, sevkzamani, tasiyicivkn, plaka
 *
 * Producers vary in whitespace and casing ("hesaplanankdv (20)"), so keys are
 * normalized before use.
 */
import { runChecks } from './checks';
import { VAT_CODE } from './parse';
import type { DocLine, MonetaryTotals, Party, SourcePreview, TaxLine, UblDocument } from './types';

type Payload = Record<string, string>;

const RATE_KEY = /^(kdvmatrah|hesaplanankdv)\(([\d.,]+)\)$/;

function normalize(raw: unknown): Payload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Payload = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || value === undefined || typeof value === 'object') continue;
    out[key.toLowerCase().replace(/\s+/g, '')] = String(value).trim();
  }
  return out;
}

const amount = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  // The standard uses "1080.00"; tolerate "1.080,00" from non-conforming producers.
  const cleaned = /,\d{1,2}$/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

function party(id: string | undefined): Party {
  if (!id) return { name: '' };
  if (/^\d{10}$/.test(id)) return { name: '', vkn: id };
  if (/^\d{11}$/.test(id)) return { name: '', tckn: id };
  return { name: '' };
}

/** True when a decoded QR text looks like a GİB e-document karekod. */
export function isGibKarekod(text: string): boolean {
  const data = tryParse(text);
  return Boolean(data && data.vkntckn && (data.ettn || data.no));
}

function tryParse(text: string): Payload | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return normalize(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export function parseKarekod(text: string, fileName: string, key: string, preview: SourcePreview | null = null): UblDocument | null {
  const data = tryParse(text);
  if (!data || !data.vkntckn || !(data.ettn || data.no)) return null;

  const scenario = (data.senaryo ?? '').toUpperCase();
  const isDespatch = scenario.endsWith('IRSALIYE') || 'sevktarihi' in data || 'plaka' in data;

  const rates = new Map<number, { taxable: number; amount: number }>();
  for (const [k, v] of Object.entries(data)) {
    const match = RATE_KEY.exec(k);
    if (!match) continue;
    const percent = Number(match[2]!.replace(',', '.'));
    if (!Number.isFinite(percent)) continue;
    const entry = rates.get(percent) ?? { taxable: 0, amount: 0 };
    if (match[1] === 'kdvmatrah') entry.taxable = amount(v) ?? 0;
    else entry.amount = amount(v) ?? 0;
    rates.set(percent, entry);
  }
  const taxes: TaxLine[] = [...rates.entries()]
    .sort(([a], [b]) => b - a)
    .map(([percent, r]) => ({ code: VAT_CODE, name: 'KDV', percent, taxable: r.taxable, amount: r.amount }));

  let totals: MonetaryTotals | null = null;
  if (!isDespatch) {
    const goods = amount(data.malhizmettoplam);
    const taxInclusive = amount(data.vergidahil);
    const payable = amount(data.odenecek);
    const vat = taxes.reduce((s, t) => s + t.amount, 0);
    const base = taxes.length ? taxes.reduce((s, t) => s + t.taxable, 0) : goods;
    // The karekod has no withholding field. For TEVKIFAT invoices the gap between
    // tax-inclusive and payable amounts is the withheld VAT.
    const gap = taxInclusive !== null && payable !== null ? Math.round((taxInclusive - payable) * 100) / 100 : 0;
    totals = {
      lineExtension: goods,
      taxExclusive: base,
      taxInclusive,
      allowance: null,
      charge: null,
      payable,
      tax: taxInclusive !== null && base !== null ? Math.round((taxInclusive - base) * 100) / 100 : vat,
      vat,
      withholding: (data.tip ?? '').toUpperCase() === 'TEVKIFAT' && gap > 0 ? gap : 0,
    };
  }

  const despatchDate = [data.sevktarihi, data.sevkzamani].filter(Boolean).join(' ');
  const carrier = data.tasiyicivkn ? `VKN ${data.tasiyicivkn}` : '';

  const doc: UblDocument = {
    key,
    fileName,
    kind: isDespatch ? 'despatch' : 'invoice',
    profile: scenario,
    typeCode: (data.tip ?? '').toUpperCase(),
    number: data.no ?? '',
    uuid: data.ettn ?? '',
    issueDate: data.tarih ?? '',
    issueTime: '',
    currency: (data.parabirimi || 'TRY').toUpperCase(),
    exchangeRate: null,
    supplier: party(data.vkntckn),
    customer: party(data.avkntckn),
    totals,
    taxes,
    withholdings: [],
    lines: [] as DocLine[],
    despatch: isDespatch
      ? {
          ...(despatchDate ? { date: despatchDate } : {}),
          ...(data.plaka ? { plate: data.plaka } : {}),
          ...(carrier ? { carrier } : {}),
        }
      : null,
    notes: [],
    hasXslt: false,
    xml: '',
    source: 'karekod',
    preview,
    pairedFile: null,
    findings: [],
  };
  doc.findings = [{ level: 'info', code: 'karekodOnly' }, ...runChecks(doc, null)];
  return doc;
}

const TOLERANCE = 0.011;

/**
 * Compares a full XML document with the karekod printed on its PDF.
 * A mismatch means the PDF a customer received does not say what the XML says.
 */
export function compareWithKarekod(xmlDoc: UblDocument, qrDoc: UblDocument): { field: string; xml: string; karekod: string }[] {
  const diffs: { field: string; xml: string; karekod: string }[] = [];
  const text = (field: string, a: string | undefined, b: string | undefined) => {
    if (b && (a ?? '') !== b) diffs.push({ field, xml: a || '—', karekod: b });
  };
  const money = (field: string, a: number | null | undefined, b: number | null | undefined) => {
    if (b === null || b === undefined) return;
    if (a === null || a === undefined || Math.abs(a - b) > TOLERANCE) {
      diffs.push({ field, xml: a === null || a === undefined ? '—' : a.toFixed(2), karekod: b.toFixed(2) });
    }
  };

  text('number', xmlDoc.number, qrDoc.number);
  text('issueDate', xmlDoc.issueDate, qrDoc.issueDate);
  text('supplierId', xmlDoc.supplier.vkn ?? xmlDoc.supplier.tckn, qrDoc.supplier.vkn ?? qrDoc.supplier.tckn);
  text('customerId', xmlDoc.customer.vkn ?? xmlDoc.customer.tckn, qrDoc.customer.vkn ?? qrDoc.customer.tckn);
  if (xmlDoc.kind === 'despatch') {
    text('plate', xmlDoc.despatch?.plate?.replace(/\s+/g, ''), qrDoc.despatch?.plate?.replace(/\s+/g, ''));
    return diffs;
  }
  text('currency', xmlDoc.currency, qrDoc.currency);
  money('vat', xmlDoc.totals?.vat, qrDoc.totals?.vat);
  money('taxInclusive', xmlDoc.totals?.taxInclusive, qrDoc.totals?.taxInclusive);
  money('payable', xmlDoc.totals?.payable, qrDoc.totals?.payable);
  return diffs;
}
