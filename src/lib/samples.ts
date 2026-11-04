/**
 * Synthetic UBL-TR documents for the demo and the test suite.
 * All companies, people and numbers are fictitious; VKN/TCKN values are
 * generated to pass checksum validation only.
 */
import { isValidTckn, isValidVkn } from './ids';

const NS = `xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"`;

function withCheckDigit(prefix: string, valid: (v: string) => boolean): string {
  for (let d = 0; d <= 9; d++) if (valid(prefix + d)) return prefix + d;
  throw new Error(`No check digit for ${prefix}`);
}

function tckn(prefix9: string): string {
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) if (isValidTckn(`${prefix9}${a}${b}`)) return `${prefix9}${a}${b}`;
  throw new Error('No TCKN');
}

export const SAMPLE_PARTIES = {
  anka: { name: 'Anka Yedek Parça Sanayi A.Ş.', vkn: withCheckDigit('074123456', isValidVkn), office: 'Kozyatağı', city: 'İstanbul' },
  bogazici: { name: 'Boğaziçi Lojistik Ltd. Şti.', vkn: withCheckDigit('183456789', isValidVkn), office: 'Tuzla', city: 'İstanbul' },
  mavi: { name: 'Mavi Kalem Yazılım Ltd. Şti.', vkn: withCheckDigit('612345670', isValidVkn), office: 'Çankaya', city: 'Ankara' },
  ege: { name: 'Ege Zeytin Tarım Kooperatifi', vkn: withCheckDigit('309876543', isValidVkn), office: 'Bornova', city: 'İzmir' },
  nordic: { name: 'Nordic Motor Parts AB', vkn: '2222222222', office: '', city: 'Göteborg' },
} as const;

const PERSON_TCKN = tckn('123456789');

type PartyKey = keyof typeof SAMPLE_PARTIES;

function party(key: PartyKey): string {
  const p = SAMPLE_PARTIES[key];
  return `<cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">${p.vkn}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${p.name}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:CityName>${p.city}</cbc:CityName><cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${p.office}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>`;
}

interface LineSpec {
  name: string;
  qty: number;
  unit: string;
  price: number;
  vat: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const f2 = (n: number) => r2(n).toFixed(2);

function lines(specs: LineSpec[], currency: string): string {
  return specs
    .map((l, i) => {
      const total = r2(l.qty * l.price);
      const tax = r2((total * l.vat) / 100);
      return `<cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${l.unit}">${l.qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${f2(total)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${f2(tax)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${f2(total)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${f2(tax)}</cbc:TaxAmount>
        <cbc:Percent>${l.vat}</cbc:Percent>
        <cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item><cbc:Name>${l.name}</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${currency}">${f2(l.price)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('\n  ');
}

interface InvoiceSpec {
  profile: string;
  type: string;
  number: string;
  uuid: string;
  date: string;
  currency?: string;
  rate?: number;
  supplier: string;
  customer: string;
  lines: LineSpec[];
  withholding?: { code: string; name: string; percent: number };
  xslt?: string;
  notes?: string[];
  /** Deliberately corrupt the totals to demo findings. */
  tamper?: boolean;
}

export function buildInvoice(spec: InvoiceSpec): string {
  const cur = spec.currency ?? 'TRY';
  const totals = spec.lines.map((l) => r2(l.qty * l.price));
  const lineExt = r2(totals.reduce((a, b) => a + b, 0));
  const byRate = new Map<number, { base: number; tax: number }>();
  spec.lines.forEach((l, i) => {
    const entry = byRate.get(l.vat) ?? { base: 0, tax: 0 };
    entry.base = r2(entry.base + totals[i]!);
    entry.tax = r2(entry.tax + r2((totals[i]! * l.vat) / 100));
    byRate.set(l.vat, entry);
  });
  const vat = r2([...byRate.values()].reduce((a, b) => a + b.tax, 0));
  const withholding = spec.withholding ? r2((vat * spec.withholding.percent) / 100) : 0;
  const taxInclusive = r2(lineExt + vat);
  const payable = r2(taxInclusive - withholding);

  const subtotals = [...byRate.entries()]
    .map(
      ([rate, e]) => `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${f2(e.base)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${cur}">${f2(e.tax)}</cbc:TaxAmount>
      <cbc:Percent>${rate}</cbc:Percent>
      <cac:TaxCategory>${rate === 0 ? '<cbc:TaxExemptionReasonCode>301</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>11/1-a Mal ihracatı</cbc:TaxExemptionReason>' : ''}<cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>`,
    )
    .join('\n    ');

  const withholdingXml = spec.withholding
    ? `<cac:WithholdingTaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${f2(withholding)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${f2(vat)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${cur}">${f2(withholding)}</cbc:TaxAmount>
      <cbc:Percent>${spec.withholding.percent}</cbc:Percent>
      <cac:TaxCategory><cac:TaxScheme><cbc:Name>${spec.withholding.name}</cbc:Name><cbc:TaxTypeCode>${spec.withholding.code}</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:WithholdingTaxTotal>`
    : '';

  const xsltRef = spec.xslt
    ? `<cac:AdditionalDocumentReference>
    <cbc:ID>${spec.uuid}</cbc:ID>
    <cbc:IssueDate>${spec.date}</cbc:IssueDate>
    <cbc:DocumentType>XSLT</cbc:DocumentType>
    <cac:Attachment><cbc:EmbeddedDocumentBinaryObject characterSetCode="UTF-8" encodingCode="Base64" filename="${spec.number}.xslt" mimeCode="application/xml">${toBase64(spec.xslt)}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment>
  </cac:AdditionalDocumentReference>`
    : '';

  const declaredInclusive = spec.tamper ? taxInclusive + 150 : taxInclusive;
  const declaredLineExt = spec.tamper ? lineExt - 10 : lineExt;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice ${NS}>
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${spec.profile}</cbc:ProfileID>
  <cbc:ID>${spec.number}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${spec.uuid}</cbc:UUID>
  <cbc:IssueDate>${spec.date}</cbc:IssueDate>
  <cbc:IssueTime>10:24:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${spec.type}</cbc:InvoiceTypeCode>
  ${(spec.notes ?? []).map((n) => `<cbc:Note>${n}</cbc:Note>`).join('\n  ')}
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${spec.lines.length}</cbc:LineCountNumeric>
  ${xsltRef}
  <cac:AccountingSupplierParty>${spec.supplier}</cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${spec.customer}</cac:AccountingCustomerParty>
  ${spec.rate ? `<cac:PricingExchangeRate><cbc:SourceCurrencyCode>${cur}</cbc:SourceCurrencyCode><cbc:TargetCurrencyCode>TRY</cbc:TargetCurrencyCode><cbc:CalculationRate>${spec.rate}</cbc:CalculationRate></cac:PricingExchangeRate>` : ''}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${f2(vat)}</cbc:TaxAmount>
    ${subtotals}
  </cac:TaxTotal>
  ${withholdingXml}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${f2(declaredLineExt)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${f2(declaredLineExt)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${f2(declaredInclusive)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${cur}">0.00</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${cur}">${f2(payable)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines(spec.lines, cur)}
</Invoice>`;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildDespatch(): string {
  const p = SAMPLE_PARTIES;
  return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2.1</cbc:CustomizationID>
  <cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>
  <cbc:ID>IRS2026000000418</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>7c1e2a9b-5d43-4f6e-9a21-3b8c0d4e6f12</cbc:UUID>
  <cbc:IssueDate>2026-10-28</cbc:IssueDate>
  <cbc:IssueTime>08:15:00</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>
  <cbc:LineCountNumeric>3</cbc:LineCountNumeric>
  <cac:DespatchSupplierParty>${party('anka')}</cac:DespatchSupplierParty>
  <cac:DeliveryCustomerParty>${party('bogazici')}</cac:DeliveryCustomerParty>
  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cac:ShipmentStage>
      <cac:TransportMeans><cac:RoadTransport><cbc:LicensePlateID schemeID="PLAKA">34 ABC 128</cbc:LicensePlateID></cac:RoadTransport></cac:TransportMeans>
      <cac:DriverPerson><cbc:FirstName>Kemal</cbc:FirstName><cbc:FamilyName>Örnek</cbc:FamilyName><cbc:Title>Şoför</cbc:Title><cbc:NationalityID>${PERSON_TCKN}</cbc:NationalityID></cac:DriverPerson>
    </cac:ShipmentStage>
    <cac:Delivery>
      <cac:CarrierParty><cac:PartyName><cbc:Name>${p.bogazici.name}</cbc:Name></cac:PartyName></cac:CarrierParty>
      <cac:Despatch><cbc:ActualDespatchDate>2026-10-28</cbc:ActualDespatchDate><cbc:ActualDespatchTime>09:30:00</cbc:ActualDespatchTime></cac:Despatch>
    </cac:Delivery>
    <cac:TransportHandlingUnit><cac:TransportEquipment><cbc:ID schemeID="DORSEPLAKA">34 DRS 902</cbc:ID></cac:TransportEquipment></cac:TransportHandlingUnit>
  </cac:Shipment>
  <cac:DespatchLine><cbc:ID>1</cbc:ID><cbc:DeliveredQuantity unitCode="C62">240</cbc:DeliveredQuantity><cac:OrderLineReference><cbc:LineID>1</cbc:LineID></cac:OrderLineReference><cac:Item><cbc:Name>Fren balatası seti (ön)</cbc:Name></cac:Item></cac:DespatchLine>
  <cac:DespatchLine><cbc:ID>2</cbc:ID><cbc:DeliveredQuantity unitCode="C62">120</cbc:DeliveredQuantity><cac:OrderLineReference><cbc:LineID>2</cbc:LineID></cac:OrderLineReference><cac:Item><cbc:Name>Yağ filtresi</cbc:Name></cac:Item></cac:DespatchLine>
  <cac:DespatchLine><cbc:ID>3</cbc:ID><cbc:DeliveredQuantity unitCode="KGM">850</cbc:DeliveredQuantity><cac:OrderLineReference><cbc:LineID>3</cbc:LineID></cac:OrderLineReference><cac:Item><cbc:Name>Motor yağı 5W-30 (dökme)</cbc:Name></cac:Item></cac:DespatchLine>
</DespatchAdvice>`;
}

function personParty(): string {
  return `<cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="TCKN">${PERSON_TCKN}</cbc:ID></cac:PartyIdentification>
      <cac:PostalAddress><cbc:CityName>Eskişehir</cbc:CityName></cac:PostalAddress>
      <cac:Person><cbc:FirstName>Deniz</cbc:FirstName><cbc:FamilyName>Örnekoğlu</cbc:FamilyName></cac:Person>
    </cac:Party>`;
}

/** A compact, branded stylesheet in the shape real GİB XSLTs take. */
export const SAMPLE_XSLT = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:inv="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  exclude-result-prefixes="inv cac cbc">
  <xsl:output method="html" encoding="UTF-8" indent="no"/>
  <xsl:template match="/inv:Invoice">
    <html><head><title>e-Fatura <xsl:value-of select="cbc:ID"/></title>
    <style>
      body{font:13px/1.45 Georgia,'Times New Roman',serif;color:#222;margin:32px;background:#fff}
      .top{display:flex;justify-content:space-between;border-bottom:3px double #333;padding-bottom:12px}
      h1{font-size:22px;letter-spacing:.08em;margin:0}
      .muted{color:#666}
      table{width:100%;border-collapse:collapse;margin-top:18px}
      th,td{border:1px solid #bbb;padding:6px 8px;text-align:left}
      th{background:#f1efe9}
      td.n{text-align:right;font-variant-numeric:tabular-nums}
      .totals{margin-left:auto;width:320px}
    </style></head>
    <body>
      <div class="top">
        <div><strong><xsl:value-of select="cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name"/></strong><br/>
          <span class="muted">VKN: <xsl:value-of select="cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID"/></span></div>
        <div style="text-align:right"><h1>e-FATURA</h1>
          <span class="muted">No: <xsl:value-of select="cbc:ID"/><br/>Tarih: <xsl:value-of select="cbc:IssueDate"/><br/>Senaryo: <xsl:value-of select="cbc:ProfileID"/> · Tip: <xsl:value-of select="cbc:InvoiceTypeCode"/></span></div>
      </div>
      <p><strong>SAYIN</strong><br/><xsl:value-of select="cac:AccountingCustomerParty/cac:Party/cac:PartyName/cbc:Name"/><br/>
        <span class="muted">VKN: <xsl:value-of select="cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID"/></span></p>
      <p class="muted">ETTN: <xsl:value-of select="cbc:UUID"/></p>
      <table><thead><tr><th>#</th><th>Mal / Hizmet</th><th>Miktar</th><th>Birim Fiyat</th><th>KDV %</th><th>Tutar</th></tr></thead><tbody>
        <xsl:for-each select="cac:InvoiceLine"><tr>
          <td><xsl:value-of select="cbc:ID"/></td>
          <td><xsl:value-of select="cac:Item/cbc:Name"/></td>
          <td class="n"><xsl:value-of select="cbc:InvoicedQuantity"/></td>
          <td class="n"><xsl:value-of select="format-number(cac:Price/cbc:PriceAmount, '#,##0.00')"/></td>
          <td class="n"><xsl:value-of select="cac:TaxTotal/cac:TaxSubtotal/cbc:Percent"/></td>
          <td class="n"><xsl:value-of select="format-number(cbc:LineExtensionAmount, '#,##0.00')"/></td>
        </tr></xsl:for-each>
      </tbody></table>
      <table class="totals">
        <tr><th>Mal Hizmet Toplam</th><td class="n"><xsl:value-of select="format-number(cac:LegalMonetaryTotal/cbc:LineExtensionAmount, '#,##0.00')"/></td></tr>
        <tr><th>Hesaplanan KDV</th><td class="n"><xsl:value-of select="format-number(cac:TaxTotal/cbc:TaxAmount, '#,##0.00')"/></td></tr>
        <tr><th>Ödenecek Tutar</th><td class="n"><strong><xsl:value-of select="format-number(cac:LegalMonetaryTotal/cbc:PayableAmount, '#,##0.00')"/><xsl:text> </xsl:text><xsl:value-of select="cbc:DocumentCurrencyCode"/></strong></td></tr>
      </table>
    </body></html>
  </xsl:template>
</xsl:stylesheet>`;

/** A GİB-style envelope carrying two invoices. */
function envelope(...invoices: string[]): string {
  const body = invoices.map((x) => x.replace(/^<\?xml[^>]*\?>\s*/, '')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sh:StandardBusinessDocument xmlns:sh="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">
  <sh:StandardBusinessDocumentHeader><sh:HeaderVersion>1.0</sh:HeaderVersion></sh:StandardBusinessDocumentHeader>
  <ef:Package xmlns:ef="http://www.efatura.gov.tr/package-namespace"><Elements><ElementType>INVOICE</ElementType><ElementCount>${invoices.length}</ElementCount><ElementList>
${body}
  </ElementList></Elements></ef:Package>
</sh:StandardBusinessDocument>`;
}

export interface SampleFile {
  name: string;
  xml: string;
}

export function sampleFiles(): SampleFile[] {
  const inv1 = buildInvoice({
    profile: 'TICARIFATURA',
    type: 'SATIS',
    number: 'ANK2026000001247',
    uuid: '3f2b8c1d-7e4a-4b9c-a1d2-5e6f7a8b9c0d',
    date: '2026-10-02',
    supplier: party('anka'),
    customer: party('bogazici'),
    xslt: SAMPLE_XSLT,
    notes: ['Yalnız #41.592,00# TL'],
    lines: [
      { name: 'Fren balatası seti (ön)', qty: 240, unit: 'C62', price: 85, vat: 20 },
      { name: 'Yağ filtresi', qty: 120, unit: 'C62', price: 42.5, vat: 20 },
      { name: 'Teknik kılavuz (basılı)', qty: 10, unit: 'C62', price: 130, vat: 10 },
    ],
  });
  const inv2 = buildInvoice({
    profile: 'TEMELFATURA',
    type: 'TEVKIFAT',
    number: 'BGZ2026000000388',
    uuid: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    date: '2026-10-06',
    supplier: party('bogazici'),
    customer: party('anka'),
    withholding: { code: '624', name: 'Yük Taşımacılığı Hizmeti', percent: 20 },
    lines: [{ name: 'Karayolu yük taşımacılığı — Ekim', qty: 1, unit: 'C62', price: 48000, vat: 20 }],
  });
  const inv3 = buildInvoice({
    profile: 'EARSIVFATURA',
    type: 'SATIS',
    number: 'MKY2026000004120',
    uuid: '1b2c3d4e-5f60-4718-892a-bc3d4e5f6071',
    date: '2026-10-14',
    supplier: party('mavi'),
    customer: personParty(),
    lines: [{ name: 'Yıllık yazılım lisansı', qty: 1, unit: 'C62', price: 3999, vat: 20 }],
  });
  const inv4 = buildInvoice({
    profile: 'IHRACAT',
    type: 'ISTISNA',
    number: 'ANK2026000001302',
    uuid: '6e5d4c3b-2a19-4087-b6a5-948372615049',
    date: '2026-10-20',
    currency: 'EUR',
    rate: 37.8412,
    supplier: party('anka'),
    customer: party('nordic'),
    lines: [{ name: 'Debriyaj seti (ihraç)', qty: 400, unit: 'C62', price: 61.25, vat: 0 }],
  });
  const inv5 = buildInvoice({
    profile: 'TICARIFATURA',
    type: 'SATIS',
    number: 'EGZ2025000000077',
    uuid: 'not-a-valid-uuid',
    date: '2026-10-22',
    supplier: party('ege'),
    customer: party('anka').replace(SAMPLE_PARTIES.anka.vkn, '1234567891'),
    tamper: true,
    lines: [
      { name: 'Natürel sızma zeytinyağı 5 L', qty: 60, unit: 'C62', price: 1150, vat: 1 },
      { name: 'Ambalaj hizmeti', qty: 1, unit: 'C62', price: 900, vat: 20 },
    ],
  });
  const inv6 = buildInvoice({
    profile: 'TICARIFATURA',
    type: 'SATIS',
    number: 'ANK2026000001311',
    uuid: '0d9c8b7a-6f5e-4d3c-a2b1-0f9e8d7c6b5a',
    date: '2026-10-27',
    supplier: party('anka'),
    customer: party('mavi'),
    lines: [{ name: 'Filo bakım paketi (12 araç)', qty: 12, unit: 'C62', price: 2750, vat: 20 }],
  });
  return [
    { name: 'ANK2026000001247.xml', xml: inv1 },
    { name: 'BGZ2026000000388.xml', xml: inv2 },
    { name: 'MKY2026000004120.xml', xml: inv3 },
    { name: 'zarf-ekim.xml', xml: envelope(inv4, inv6) },
    { name: 'EGZ2025000000077.xml', xml: inv5 },
    { name: 'IRS2026000000418.xml', xml: buildDespatch() },
  ];
}

export const SAMPLE_MY_VKN = SAMPLE_PARTIES.anka.vkn;
