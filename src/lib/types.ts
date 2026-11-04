export type DocKind = 'invoice' | 'creditNote' | 'despatch';

export interface Party {
  name: string;
  vkn?: string;
  tckn?: string;
  taxOffice?: string;
  city?: string;
}

export interface TaxLine {
  /** GİB tax type code, e.g. 0015 = KDV, 0071 = ÖTV, 601–650 = tevkifat */
  code: string;
  name: string;
  percent: number | null;
  taxable: number;
  amount: number;
}

export interface DocLine {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  unitPrice: number | null;
  total: number | null;
  vatPercent: number | null;
}

export interface MonetaryTotals {
  lineExtension: number | null;
  taxExclusive: number | null;
  taxInclusive: number | null;
  allowance: number | null;
  charge: number | null;
  payable: number | null;
  /** Sum of document-level TaxTotal/TaxAmount */
  tax: number | null;
  /** KDV (0015) only */
  vat: number;
  withholding: number;
}

export interface DespatchInfo {
  date?: string;
  plate?: string;
  trailerPlate?: string;
  driver?: string;
  carrier?: string;
}

export type FindingLevel = 'error' | 'warning' | 'info';

export interface Finding {
  level: FindingLevel;
  code: FindingCode;
  params?: Record<string, string | number>;
}

export type FindingCode =
  | 'missingUuid'
  | 'missingNumber'
  | 'missingDate'
  | 'badUuid'
  | 'badNumberFormat'
  | 'numberYearMismatch'
  | 'badVkn'
  | 'badTckn'
  | 'lineSumMismatch'
  | 'taxExclusiveMismatch'
  | 'taxInclusiveMismatch'
  | 'taxTotalMismatch'
  | 'subtotalRateMismatch'
  | 'lineCountMismatch'
  | 'withholdingMissing'
  | 'duplicateUuid';

export interface UblDocument {
  /** Stable key within a session (file + index) */
  key: string;
  fileName: string;
  kind: DocKind;
  profile: string;
  typeCode: string;
  number: string;
  uuid: string;
  issueDate: string;
  issueTime: string;
  currency: string;
  exchangeRate: number | null;
  supplier: Party;
  customer: Party;
  totals: MonetaryTotals | null;
  taxes: TaxLine[];
  withholdings: TaxLine[];
  lines: DocLine[];
  despatch: DespatchInfo | null;
  notes: string[];
  hasXslt: boolean;
  /** Serialized XML of this document only (envelopes are unwrapped). */
  xml: string;
  findings: Finding[];
}

export interface IngestError {
  fileName: string;
  reason: 'notXml' | 'parseError' | 'noUblDocument' | 'tooLarge' | 'zipError' | 'zipLimit';
  detail?: string;
}
