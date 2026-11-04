import { ANONYMOUS_TCKN, FOREIGN_VKN, isGibDocumentNumber, isValidTckn, isValidUuid, isValidVkn } from './ids';
import type { Finding, Party, UblDocument } from './types';
import { children, num } from './xml';

/** Rounding tolerance for money comparisons (UBL-TR amounts are 2-decimal). */
const TOLERANCE = 0.011;

const differs = (a: number, b: number, tol = TOLERANCE) => Math.abs(a - b) > tol;
const money = (n: number) => n.toFixed(2);

/**
 * Fast consistency checks. These are deliberately heuristic and are NOT a
 * substitute for GİB's XSD + schematron validation.
 */
export function runChecks(doc: UblDocument, root: Element | null): Finding[] {
  const findings: Finding[] = [];

  if (!doc.uuid) findings.push({ level: 'error', code: 'missingUuid' });
  else if (!isValidUuid(doc.uuid)) findings.push({ level: 'warning', code: 'badUuid', params: { value: doc.uuid } });

  if (!doc.number) findings.push({ level: 'error', code: 'missingNumber' });
  else if (!isGibDocumentNumber(doc.number)) {
    findings.push({ level: 'info', code: 'badNumberFormat', params: { value: doc.number } });
  } else if (doc.issueDate && doc.number.slice(3, 7) !== doc.issueDate.slice(0, 4)) {
    findings.push({
      level: 'warning',
      code: 'numberYearMismatch',
      params: { numberYear: doc.number.slice(3, 7), dateYear: doc.issueDate.slice(0, 4) },
    });
  }

  if (!doc.issueDate) findings.push({ level: 'error', code: 'missingDate' });

  checkPartyIds(doc.supplier, 'supplier', findings);
  checkPartyIds(doc.customer, 'customer', findings);

  // Structural checks need the XML tree; karekod-only documents carry just the summary.
  if (!root) return findings;

  if (doc.kind !== 'despatch' && doc.totals) checkMoney(doc, root, findings);

  const declaredLines = num(root, 'LineCountNumeric');
  if (declaredLines !== null && declaredLines !== doc.lines.length) {
    findings.push({ level: 'warning', code: 'lineCountMismatch', params: { declared: declaredLines, actual: doc.lines.length } });
  }

  return findings;
}

function checkPartyIds(party: Party, role: 'supplier' | 'customer', findings: Finding[]) {
  if (party.vkn && party.vkn !== FOREIGN_VKN && !isValidVkn(party.vkn)) {
    findings.push({ level: 'warning', code: 'badVkn', params: { role, value: party.vkn } });
  }
  if (party.tckn && party.tckn !== ANONYMOUS_TCKN && !isValidTckn(party.tckn)) {
    findings.push({ level: 'warning', code: 'badTckn', params: { role, value: party.tckn } });
  }
}

function checkMoney(doc: UblDocument, root: Element, findings: Finding[]) {
  const t = doc.totals!;

  const lineSum = doc.lines.reduce((s, l) => s + (l.total ?? 0), 0);
  // Producers differ on whether document-level LineExtensionAmount is before or after
  // allowances (GİB's own commercial-invoice sample uses "before"); accept either.
  const netOfAllowances = (t.lineExtension ?? 0) - (t.allowance ?? 0) + (t.charge ?? 0);
  if (t.lineExtension !== null && doc.lines.length && differs(lineSum, t.lineExtension) && differs(lineSum, netOfAllowances)) {
    findings.push({ level: 'warning', code: 'lineSumMismatch', params: { lines: money(lineSum), total: money(t.lineExtension) } });
  }

  if (t.lineExtension !== null && t.taxExclusive !== null) {
    const expected = t.lineExtension - (t.allowance ?? 0) + (t.charge ?? 0);
    if (differs(expected, t.taxExclusive)) {
      findings.push({ level: 'warning', code: 'taxExclusiveMismatch', params: { expected: money(expected), actual: money(t.taxExclusive) } });
    }
  }

  // Subtotals carry the full tax even when a producer reports TaxTotal/TaxAmount net of withholding.
  const subtotalTax = doc.taxes.reduce((s, x) => s + x.amount, 0);
  if (t.taxExclusive !== null && t.taxInclusive !== null && (t.tax !== null || doc.taxes.length)) {
    const expected = t.taxExclusive + (doc.taxes.length ? subtotalTax : t.tax!);
    if (differs(expected, t.taxInclusive)) {
      findings.push({ level: 'warning', code: 'taxInclusiveMismatch', params: { expected: money(expected), actual: money(t.taxInclusive) } });
    }
  }

  for (const total of children(root, 'TaxTotal')) {
    const declared = num(total, 'TaxAmount');
    const sum = children(total, 'TaxSubtotal').reduce((s, sub) => s + (num(sub, 'TaxAmount') ?? 0), 0);
    // Some producers (including GİB's TEVKIFAT sample) declare the VAT left after withholding.
    if (declared !== null && differs(declared, sum) && differs(declared, sum - t.withholding)) {
      findings.push({ level: 'warning', code: 'taxTotalMismatch', params: { declared: money(declared), sum: money(sum) } });
    }
  }

  for (const tax of [...doc.taxes, ...doc.withholdings]) {
    if (tax.percent === null || tax.taxable === 0) continue;
    // Withholding subtotals carry the VAT amount as TaxableAmount, so the same formula applies.
    const expected = (tax.taxable * tax.percent) / 100;
    // Allow per-line rounding drift: one kuruş per line, minimum 2 kuruş.
    const tol = Math.max(0.021, doc.lines.length * 0.01);
    if (differs(expected, tax.amount, tol)) {
      findings.push({
        level: 'info',
        code: 'subtotalRateMismatch',
        params: { tax: tax.name || tax.code, percent: tax.percent, expected: money(expected), actual: money(tax.amount) },
      });
    }
  }

  if (doc.typeCode.toUpperCase() === 'TEVKIFAT' && doc.withholdings.length === 0) {
    findings.push({ level: 'warning', code: 'withholdingMissing' });
  }
}
