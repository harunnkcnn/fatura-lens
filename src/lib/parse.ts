import { runChecks } from './checks';
import type {
  DespatchInfo,
  DocKind,
  DocLine,
  MonetaryTotals,
  Party,
  TaxLine,
  UblDocument,
} from './types';
import { attr, child, children, num, text } from './xml';

const UBL_NS_PREFIX = 'urn:oasis:names:specification:ubl:schema:xsd:';
const ROOTS: Record<string, DocKind> = {
  Invoice: 'invoice',
  CreditNote: 'creditNote',
  DespatchAdvice: 'despatch',
};
export const VAT_CODE = '0015';

export class XmlParseError extends Error {}

/** Finds every UBL document in an XML tree (plain document or GİB envelope). */
export function findUblRoots(doc: Document): Element[] {
  const root = doc.documentElement;
  if (isUblRoot(root)) return [root];
  const found: Element[] = [];
  for (const name of Object.keys(ROOTS)) {
    for (const el of Array.from(doc.getElementsByTagNameNS('*', name))) {
      if (isUblRoot(el)) found.push(el);
    }
  }
  return found;
}

function isUblRoot(el: Element): boolean {
  return el.localName in ROOTS && (el.namespaceURI ?? '').startsWith(UBL_NS_PREFIX);
}

export function parseXmlText(xmlText: string, fileName: string): UblDocument[] {
  const dom = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserError = dom.getElementsByTagName('parsererror')[0];
  if (parserError) throw new XmlParseError(parserError.textContent?.slice(0, 200) ?? 'XML parse error');

  const roots = findUblRoots(dom);
  const serializer = new XMLSerializer();
  return roots.map((root, index) =>
    parseDocument(root, {
      fileName,
      key: `${fileName}#${index}`,
      // A lone root keeps its original text (and XML declaration); envelope parts are re-serialized.
      xml: roots.length === 1 && root === dom.documentElement ? xmlText : serializer.serializeToString(root),
    }),
  );
}

function parseDocument(root: Element, meta: { fileName: string; key: string; xml: string }): UblDocument {
  const kind = ROOTS[root.localName]!;
  const isDespatch = kind === 'despatch';

  const supplier = parseParty(
    child(root, isDespatch ? 'DespatchSupplierParty' : 'AccountingSupplierParty', 'Party'),
  );
  const customer = parseParty(
    child(root, isDespatch ? 'DeliveryCustomerParty' : 'AccountingCustomerParty', 'Party'),
  );

  const taxes = children(root, 'TaxTotal').flatMap(parseTaxSubtotals);
  const withholdings = children(root, 'WithholdingTaxTotal').flatMap(parseTaxSubtotals);

  const doc: UblDocument = {
    key: meta.key,
    fileName: meta.fileName,
    kind,
    profile: text(root, 'ProfileID'),
    typeCode: text(root, isDespatch ? 'DespatchAdviceTypeCode' : kind === 'creditNote' ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'),
    number: text(root, 'ID'),
    uuid: text(root, 'UUID'),
    issueDate: text(root, 'IssueDate'),
    issueTime: text(root, 'IssueTime'),
    currency: text(root, 'DocumentCurrencyCode') || 'TRY',
    exchangeRate: num(root, 'PricingExchangeRate', 'CalculationRate'),
    supplier,
    customer,
    totals: isDespatch ? null : parseTotals(root, taxes, withholdings),
    taxes,
    withholdings,
    lines: parseLines(root, kind),
    despatch: isDespatch ? parseDespatch(root) : null,
    notes: children(root, 'Note')
      .map((n) => n.textContent?.trim() ?? '')
      .filter(Boolean),
    hasXslt: findXsltNode(root) !== null,
    xml: meta.xml,
    findings: [],
  };
  doc.findings = runChecks(doc, root);
  return doc;
}

function parseParty(party: Element | null): Party {
  if (!party) return { name: '' };
  const result: Party = { name: text(party, 'PartyName', 'Name') };
  for (const idNode of children(party, 'PartyIdentification')) {
    const idEl = child(idNode, 'ID');
    const scheme = attr(idEl, 'schemeID').toUpperCase();
    const value = idEl?.textContent?.trim() ?? '';
    if (scheme === 'VKN') result.vkn = value;
    if (scheme === 'TCKN') result.tckn = value;
  }
  if (!result.name) {
    const person = child(party, 'Person');
    result.name = [text(person, 'FirstName'), text(person, 'MiddleName'), text(person, 'FamilyName')]
      .filter(Boolean)
      .join(' ');
  }
  const taxOffice = text(party, 'PartyTaxScheme', 'TaxScheme', 'Name');
  if (taxOffice) result.taxOffice = taxOffice;
  const city = text(party, 'PostalAddress', 'CityName');
  if (city) result.city = city;
  return result;
}

function parseTaxSubtotals(total: Element): TaxLine[] {
  return children(total, 'TaxSubtotal').map((sub) => {
    const scheme = child(sub, 'TaxCategory', 'TaxScheme');
    return {
      code: text(scheme, 'TaxTypeCode'),
      name: text(scheme, 'Name'),
      percent: num(sub, 'Percent'),
      taxable: num(sub, 'TaxableAmount') ?? 0,
      amount: num(sub, 'TaxAmount') ?? 0,
    };
  });
}

function parseTotals(root: Element, taxes: TaxLine[], withholdings: TaxLine[]): MonetaryTotals {
  const legal = child(root, 'LegalMonetaryTotal');
  const taxTotals = children(root, 'TaxTotal');
  return {
    lineExtension: num(legal, 'LineExtensionAmount'),
    taxExclusive: num(legal, 'TaxExclusiveAmount'),
    taxInclusive: num(legal, 'TaxInclusiveAmount'),
    allowance: num(legal, 'AllowanceTotalAmount'),
    charge: num(legal, 'ChargeTotalAmount'),
    payable: num(legal, 'PayableAmount'),
    tax: taxTotals.length ? taxTotals.reduce((s, t) => s + (num(t, 'TaxAmount') ?? 0), 0) : null,
    vat: taxes.filter((t) => t.code === VAT_CODE).reduce((s, t) => s + t.amount, 0),
    withholding: withholdings.reduce((s, t) => s + t.amount, 0),
  };
}

function parseLines(root: Element, kind: DocKind): DocLine[] {
  const lineName = kind === 'despatch' ? 'DespatchLine' : kind === 'creditNote' ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyName = kind === 'despatch' ? 'DeliveredQuantity' : kind === 'creditNote' ? 'CreditedQuantity' : 'InvoicedQuantity';
  return children(root, lineName).map((line) => {
    const qty = child(line, qtyName);
    const vat = children(child(line, 'TaxTotal'), 'TaxSubtotal').find(
      (s) => text(s, 'TaxCategory', 'TaxScheme', 'TaxTypeCode') === VAT_CODE,
    );
    return {
      id: text(line, 'ID'),
      name: text(line, 'Item', 'Name') || text(line, 'Item', 'Description'),
      quantity: num(line, qtyName),
      unit: attr(qty, 'unitCode'),
      unitPrice: num(line, 'Price', 'PriceAmount'),
      total: num(line, 'LineExtensionAmount'),
      vatPercent: vat ? num(vat, 'Percent') : null,
    };
  });
}

function parseDespatch(root: Element): DespatchInfo {
  const shipment = child(root, 'Shipment');
  const stage = child(shipment, 'ShipmentStage');
  const driver = child(stage, 'DriverPerson');
  const info: DespatchInfo = {};
  const date = [text(shipment, 'Delivery', 'Despatch', 'ActualDespatchDate'), text(shipment, 'Delivery', 'Despatch', 'ActualDespatchTime')]
    .filter(Boolean)
    .join(' ');
  if (date) info.date = date;
  const plate = text(stage, 'TransportMeans', 'RoadTransport', 'LicensePlateID');
  if (plate) info.plate = plate;
  for (const unit of children(shipment, 'TransportHandlingUnit')) {
    for (const equipment of children(unit, 'TransportEquipment')) {
      const idEl = child(equipment, 'ID');
      const scheme = attr(idEl, 'schemeID').toUpperCase();
      const value = idEl?.textContent?.trim() ?? '';
      if (!value) continue;
      if (scheme === 'DORSEPLAKA') info.trailerPlate = value;
      else if (!info.plate) info.plate = value;
    }
  }
  const driverName = [text(driver, 'FirstName'), text(driver, 'FamilyName')].filter(Boolean).join(' ');
  if (driverName) info.driver = driverName;
  const carrier = text(shipment, 'Delivery', 'CarrierParty', 'PartyName', 'Name');
  if (carrier) info.carrier = carrier;
  return info;
}

/** The embedded stylesheet GİB documents carry for their official human-readable view. */
export function findXsltNode(root: Element): Element | null {
  for (const ref of children(root, 'AdditionalDocumentReference')) {
    const binary = child(ref, 'Attachment', 'EmbeddedDocumentBinaryObject');
    if (!binary) continue;
    const fileName = attr(binary, 'filename').toLowerCase();
    const docType = (text(ref, 'DocumentType') || text(ref, 'DocumentTypeCode')).toUpperCase();
    if (fileName.endsWith('.xslt') || fileName.endsWith('.xsl') || docType === 'XSLT') return binary;
  }
  return null;
}

/** Decodes the embedded XSLT of a parsed document, or null if absent/invalid. */
export function extractXslt(doc: UblDocument): string | null {
  if (!doc.hasXslt) return null;
  const dom = new DOMParser().parseFromString(doc.xml, 'application/xml');
  const root = findUblRoots(dom)[0];
  const node = root ? findXsltNode(root) : null;
  const base64 = node?.textContent?.replace(/\s+/g, '') ?? '';
  if (!base64) return null;
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  } catch {
    return null;
  }
}
