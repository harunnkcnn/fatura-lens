import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { directionOf, mergeDocuments, summarize } from './aggregate';
import { documentRows, toCsv } from './csv';
import { isValidTckn, isValidVkn } from './ids';
import { decodeXml, ingest } from './ingest';
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
