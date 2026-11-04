import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { directionOf, mergeDocuments, summarize } from './aggregate';
import { documentRows, toCsv } from './csv';
import { isValidTckn, isValidVkn } from './ids';
import { decodeXml, ingest, type Scanner } from './ingest';
import { parseKarekod } from './karekod';
import sampleKarekod from './sample-karekod.json';
import { extractXslt, parseXmlText } from './parse';
import { SAMPLE_MY_VKN, SAMPLE_XSLT, sampleFiles } from './samples';
import type { UblDocument } from './types';

const samples = sampleFiles();
const parseSample = (name: string): UblDocument[] => {
  const file = samples.find((s) => s.name === name)!;
  return parseXmlText(file.xml, file.name);
};
const codes = (doc: UblDocument) => doc.findings.map((f) => f.code);

describe('ids', () => {
  it('validates VKN with the reference example', () => {
    expect(isValidVkn('4540536920')).toBe(true);
    expect(isValidVkn('4540536921')).toBe(false);
    expect(isValidVkn('454053692')).toBe(false);
  });
  it('validates TCKN', () => {
    expect(isValidTckn('10000000146')).toBe(true);
    expect(isValidTckn('10000000147')).toBe(false);
    expect(isValidTckn('01234567890')).toBe(false);
  });
});

describe('parse', () => {
  it('reads a commercial invoice with VAT breakdown and embedded XSLT', () => {
    const [doc] = parseSample('ANK2026000001247.xml');
    expect(doc).toBeDefined();
    expect(doc!.kind).toBe('invoice');
    expect(doc!.profile).toBe('TICARIFATURA');
    expect(doc!.supplier.name).toBe('Anka Yedek Parça Sanayi A.Ş.');
    expect(doc!.supplier.vkn).toBe(SAMPLE_MY_VKN);
    expect(doc!.lines).toHaveLength(3);
    expect(doc!.totals?.lineExtension).toBe(26800);
    expect(doc!.totals?.vat).toBe(5230);
    expect(doc!.taxes.map((t) => t.percent)).toEqual([20, 10]);
    expect(doc!.hasXslt).toBe(true);
    expect(extractXslt(doc!)).toBe(SAMPLE_XSLT);
    expect(doc!.findings).toEqual([]);
  });

  it('reads withholding (tevkifat) totals', () => {
    const [doc] = parseSample('BGZ2026000000388.xml');
    expect(doc!.typeCode).toBe('TEVKIFAT');
    expect(doc!.totals?.vat).toBe(9600);
    expect(doc!.totals?.withholding).toBe(1920);
    expect(doc!.totals?.payable).toBe(55680);
    expect(doc!.findings).toEqual([]);
  });

  it('reads an e-Arşiv invoice addressed to a person', () => {
    const [doc] = parseSample('MKY2026000004120.xml');
    expect(doc!.customer.name).toBe('Deniz Örnekoğlu');
    expect(doc!.customer.tckn).toMatch(/^\d{11}$/);
    expect(doc!.findings).toEqual([]);
  });

  it('unwraps GİB envelopes into separate documents', () => {
    const docs = parseSample('zarf-ekim.xml');
    expect(docs.map((d) => d.number)).toEqual(['ANK2026000001302', 'ANK2026000001311']);
    expect(docs[0]!.currency).toBe('EUR');
    expect(docs[0]!.exchangeRate).toBeCloseTo(37.8412);
    expect(docs[0]!.findings).toEqual([]);
  });

  it('reads a despatch advice with vehicle and driver', () => {
    const [doc] = parseSample('IRS2026000000418.xml');
    expect(doc!.kind).toBe('despatch');
    expect(doc!.totals).toBeNull();
    expect(doc!.despatch).toEqual({
      date: '2026-10-28 09:30:00',
      plate: '34 ABC 128',
      trailerPlate: '34 DRS 902',
      driver: 'Kemal Örnek',
      carrier: 'Boğaziçi Lojistik Ltd. Şti.',
    });
    expect(doc!.lines.map((l) => l.quantity)).toEqual([240, 120, 850]);
    expect(doc!.findings).toEqual([]);
  });

  it('flags inconsistent documents', () => {
    const [doc] = parseSample('EGZ2025000000077.xml');
    expect(codes(doc!)).toEqual(
      expect.arrayContaining(['badUuid', 'numberYearMismatch', 'badVkn', 'lineSumMismatch', 'taxInclusiveMismatch']),
    );
  });

  it('rejects malformed XML', () => {
    expect(() => parseXmlText('<Invoice><broken', 'x.xml')).toThrow();
  });
});

describe('ingest', () => {
  it('expands ZIP archives and reports non-UBL files', async () => {
    const zip = zipSync({
      'ekim/a.xml': strToU8(samples[0]!.xml),
      'ekim/b.xml': strToU8(samples[1]!.xml),
      'readme.txt': strToU8('ignored'),
      'notes.xml': strToU8('<root/>'),
    });
    const result = await ingest([{ name: 'arsiv.zip', bytes: zip }]);
    expect(result.docs).toHaveLength(2);
    expect(result.errors).toEqual([{ fileName: 'arsiv.zip/notes.xml', reason: 'noUblDocument' }]);
  });

  it('decodes ISO-8859-9 declared files', () => {
    const bytes = new Uint8Array([...strToU8('<?xml version="1.0" encoding="ISO-8859-9"?><a>'), 0xfe, ...strToU8('</a>')]);
    expect(decodeXml(bytes)).toContain('<a>ş</a>');
  });
});

describe('aggregate', () => {
  const all = samples.flatMap((s) => parseXmlText(s.xml, s.name));

  it('never mixes currencies', () => {
    const summary = summarize(all);
    expect(summary.map((s) => s.currency)).toEqual(['TRY', 'EUR']);
    const eur = summary.find((s) => s.currency === 'EUR')!;
    expect(eur.count).toBe(1);
    expect(eur.taxExclusive).toBe(24500);
  });

  it('classifies direction from the user VKN', () => {
    const mine = new Set([SAMPLE_MY_VKN]);
    expect(directionOf(all[0]!, mine)).toBe('outgoing');
    expect(directionOf(all[1]!, mine)).toBe('incoming');
    expect(directionOf(all[2]!, mine)).toBeNull();
  });

  it('skips identical re-imports and flags conflicting UUIDs', () => {
    const first = mergeDocuments([], all);
    const again = mergeDocuments(first.docs, all);
    expect(again.skippedDuplicates).toBe(all.length);
    expect(again.docs).toHaveLength(all.length);

    const conflicting = { ...all[0]!, key: 'other', xml: `${all[0]!.xml}\n` };
    const merged = mergeDocuments(first.docs, [conflicting]);
    expect(merged.docs.filter((d) => codes(d).includes('duplicateUuid'))).toHaveLength(2);
  });
});

describe('csv', () => {
  it('uses Turkish Excel conventions and blocks formula injection', () => {
    const csv = toCsv([['=HYPERLINK("x")', 1234.5, -3]], { locale: 'tr', headers: ['a', 'b', 'c'] });
    expect(csv.startsWith('﻿a;b;c\r\n')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")";1234,50;-3`);
  });

  it('exports one row per document', () => {
    const docs = samples.slice(0, 2).flatMap((s) => parseXmlText(s.xml, s.name));
    expect(documentRows(docs, new Set())).toHaveLength(2);
  });
});

describe('karekod', () => {
  const karekod = (i: number) => JSON.stringify(sampleKarekod.samples[i]!.payload);

  it('reads the GİB karekod JSON, including spaced rate keys', () => {
    const doc = parseKarekod(karekod(2), 'fis.jpg', 'k')!;
    expect(doc.source).toBe('karekod');
    expect(doc.number).toBe('KZY2026000000913');
    expect(doc.profile).toBe('EARSIVFATURA');
    expect(doc.supplier.vkn).toBe('4812345674');
    expect(doc.taxes).toEqual([{ code: '0015', name: 'KDV', percent: 20, taxable: 2450, amount: 490 }]);
    expect(doc.totals?.payable).toBe(2940);
    expect(codes(doc)).toEqual(['karekodOnly']);
  });

  it('reads the despatch karekod from the standard', () => {
    const doc = parseKarekod(
      '{"vkntckn":"1111111111","avkntckn":"1111111111","senaryo":"TEMELIRSALIYE","tip":"SEVK","tarih":"2022-08-17","no":"IRS2022000000001","ettn":"04e35a51-7c00-45d0-968c-6f7c60834525","sevktarihi":"2022-08-17","sevkzamani":"09:32:13","tasiyicivkn":"1111111111","plaka":"06AA0606"}',
      'irs.pdf',
      'k',
    )!;
    expect(doc.kind).toBe('despatch');
    expect(doc.despatch).toEqual({ date: '2022-08-17 09:32:13', plate: '06AA0606', carrier: 'VKN 1111111111' });
  });

  it('infers withholding for TEVKIFAT from tax-inclusive minus payable', () => {
    const doc = parseKarekod(JSON.stringify({ ...sampleKarekod.samples[1]!.payload, odenecek: '55680.00' }), 'b.pdf', 'k')!;
    expect(doc.totals?.withholding).toBe(1920);
  });

  it('ignores QR codes that are not GİB karekods', () => {
    expect(parseKarekod('https://example.com', 'x.png', 'k')).toBeNull();
    expect(parseKarekod('{"hello":"world"}', 'x.png', 'k')).toBeNull();
  });

  it('ingests PDFs and photos through the scanner and pairs them with XML', async () => {
    const encoder = new TextEncoder();
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    let pdfCalls = 0;
    const scanner: Scanner = async (kind) => [{ text: kind === 'pdf' ? karekod(1) : karekod(2), previewUrl: 'blob:x' }];
    const result = await ingest(
      [
        { name: 'BGZ.xml', bytes: encoder.encode(samples[1]!.xml) },
        { name: 'BGZ.pdf', bytes: pdfBytes },
        { name: 'fis.jpg', bytes: jpgBytes },
        { name: 'empty.pdf', bytes: pdfBytes },
      ],
      undefined,
      async (kind, bytes, mime) => (kind === 'pdf' && pdfCalls++ > 0 ? [] : scanner(kind, bytes, mime)),
    );
    expect(result.errors).toEqual([{ fileName: 'empty.pdf', reason: 'noKarekod' }]);
    const merged = mergeDocuments([], result.docs);
    expect(merged.paired).toBe(1);
    expect(merged.docs).toHaveLength(2);
    const bgz = merged.docs.find((d) => d.number === 'BGZ2026000000388')!;
    expect(bgz.source).toBe('xml');
    expect(bgz.pairedFile).toBe('BGZ.pdf');
    expect(bgz.preview?.url).toBe('blob:x');
    // The PDF forgot to subtract withholding: payable differs from the XML.
    expect(bgz.findings.filter((f) => f.code === 'karekodMismatch').map((f) => f.params?.field)).toEqual(['payable']);
  });

  it('a matching karekod adds no findings and the XML arriving later replaces the karekod row', () => {
    const xml = parseSample('ANK2026000001247.xml')[0]!;
    const qr = parseKarekod(karekod(0), 'ANK.pdf', 'k')!;
    const merged = mergeDocuments([qr], [xml]);
    expect(merged.docs).toHaveLength(1);
    expect(merged.docs[0]!.source).toBe('xml');
    expect(merged.docs[0]!.findings).toEqual([]);
    expect(summarize(merged.docs)[0]!.count).toBe(1);
  });
});

describe('real-world conventions', () => {
  it('accepts TaxTotal declared net of withholding (as in GİB’s TEVKIFAT sample)', () => {
    const file = samples.find((s) => s.name === 'BGZ2026000000388.xml')!;
    const xml = file.xml.replace(/(<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="TRY">)9600\.00/, '$17680.00');
    const [doc] = parseXmlText(xml, 'net.xml');
    expect(codes(doc!)).toEqual([]);
  });
});
