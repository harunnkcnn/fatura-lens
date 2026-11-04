import { directionOf } from './aggregate';
import type { UblDocument } from './types';

export type CsvLocale = 'tr' | 'en';

type Cell = string | number | null | undefined;

interface CsvOptions {
  locale: CsvLocale;
  headers: string[];
}

/**
 * Excel-friendly CSV: UTF-8 BOM, `;` + decimal comma for Turkish Excel,
 * `,` + decimal point otherwise. Text cells are neutralized against
 * spreadsheet formula injection (OWASP CSV injection).
 */
export function toCsv(rows: Cell[][], { locale, headers }: CsvOptions): string {
  const sep = locale === 'tr' ? ';' : ',';
  const format = (cell: Cell): string => {
    if (cell === null || cell === undefined) return '';
    if (typeof cell === 'number') {
      const fixed = Number.isInteger(cell) ? String(cell) : cell.toFixed(2);
      return locale === 'tr' ? fixed.replace('.', ',') : fixed;
    }
    let value = cell;
    if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
    return /["\n\r]/.test(value) || value.includes(sep) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  const lines = [headers, ...rows].map((row) => row.map(format).join(sep));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function documentRows(docs: UblDocument[], myIds: ReadonlySet<string>): Cell[][] {
  return docs.map((d) => [
    d.kind,
    directionOf(d, myIds) ?? '',
    d.profile,
    d.typeCode,
    d.number,
    d.uuid,
    d.issueDate,
    d.supplier.name,
    d.supplier.vkn ?? d.supplier.tckn ?? '',
    d.customer.name,
    d.customer.vkn ?? d.customer.tckn ?? '',
    d.currency,
    d.exchangeRate,
    d.totals?.taxExclusive,
    d.totals?.vat,
    d.totals?.withholding,
    d.totals?.taxInclusive,
    d.totals?.payable,
    d.lines.length,
    d.despatch?.plate ?? '',
    d.findings.length,
    d.source === 'karekod' ? 'karekod' : d.pairedFile ? 'xml+karekod' : 'xml',
    d.pairedFile ? `${d.fileName} + ${d.pairedFile}` : d.fileName,
  ]);
}

export function lineRows(docs: UblDocument[]): Cell[][] {
  return docs.flatMap((d) =>
    d.lines.map((l) => [d.number, d.issueDate, d.supplier.name, d.customer.name, l.id, l.name, l.quantity, l.unit, l.unitPrice, l.total, l.vatPercent, d.currency]),
  );
}

export function downloadText(content: string, fileName: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
