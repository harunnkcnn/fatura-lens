import { unzipSync } from 'fflate';
import { parseKarekod } from './karekod';
import { parseXmlText, XmlParseError } from './parse';
import type { IngestError, UblDocument } from './types';

export const LIMITS = {
  maxXmlBytes: 50 * 1024 * 1024,
  maxZipEntries: 5000,
  maxZipTotalBytes: 500 * 1024 * 1024,
  maxZipDepth: 2,
  maxScanBytes: 60 * 1024 * 1024,
} as const;

const SCANNABLE_EXT = /\.(pdf|png|jpe?g|webp)$/i;

export interface IngestResult {
  docs: UblDocument[];
  errors: IngestError[];
}

export interface IngestSource {
  name: string;
  bytes: Uint8Array;
}

export type ProgressFn = (done: number, total: number) => void;

export type ScanKind = 'pdf' | 'image';
export interface ScanHit {
  text: string;
  previewUrl: string | null;
}
/** Decodes QR codes from a PDF or image. Injected so tests can run without a browser. */
export type Scanner = (kind: ScanKind, bytes: Uint8Array, mime: string) => Promise<ScanHit[]>;

/** Default scanner: pdf.js + zxing-wasm, downloaded only the first time a PDF or image arrives. */
export const browserScanner: Scanner = async (kind, bytes, mime) => {
  const scan = await import('./scan');
  return kind === 'pdf' ? scan.scanPdf(bytes) : scan.scanImage(bytes, mime);
};

let batchCounter = 0;

/** Parses XML, ZIP, PDF and image sources into documents, yielding to the UI between files. */
export async function ingest(sources: IngestSource[], onProgress?: ProgressFn, scanner: Scanner = browserScanner): Promise<IngestResult> {
  const batch = ++batchCounter;
  const expanded: IngestSource[] = [];
  const errors: IngestError[] = [];
  for (const source of sources) expand(source, 0, expanded, errors);

  const docs: UblDocument[] = [];
  for (const [i, source] of expanded.entries()) {
    const kind = scanKind(source.bytes);
    const result = kind ? await ingestScan(source, kind, scanner) : ingestXml(source);
    for (const doc of result.docs) doc.key = `${batch}/${doc.key}`;
    docs.push(...result.docs);
    errors.push(...result.errors);
    // Scans are slow enough to report every file; XML is reported in batches.
    if (kind || i % 25 === 24) {
      onProgress?.(i + 1, expanded.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress?.(expanded.length, expanded.length);
  return { docs, errors };
}

async function ingestScan(source: IngestSource, kind: ScanKind, scanner: Scanner): Promise<IngestResult> {
  if (source.bytes.byteLength > LIMITS.maxScanBytes) {
    return { docs: [], errors: [{ fileName: source.name, reason: 'tooLarge' }] };
  }
  let hits: ScanHit[];
  try {
    hits = await scanner(kind, source.bytes, mimeOf(source.bytes));
  } catch (error) {
    return { docs: [], errors: [{ fileName: source.name, reason: 'scanError', detail: String(error) }] };
  }
  const docs: UblDocument[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.text)) continue;
    seen.add(hit.text);
    const preview = hit.previewUrl ? { fileName: source.name, url: hit.previewUrl } : null;
    const doc = parseKarekod(hit.text, source.name, `${source.name}#qr${docs.length}`, preview);
    if (doc) docs.push(doc);
  }
  if (docs.length === 0) return { docs, errors: [{ fileName: source.name, reason: 'noKarekod' }] };
  return { docs, errors: [] };
}

export function scanKind(bytes: Uint8Array): ScanKind | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  return mimeOf(bytes).startsWith('image/') ? 'image' : null;
}

function mimeOf(bytes: Uint8Array): string {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return 'application/octet-stream';
}

export async function readFiles(files: Iterable<File>): Promise<IngestSource[]> {
  return Promise.all(
    Array.from(files, async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
  );
}

function expand(source: IngestSource, depth: number, out: IngestSource[], errors: IngestError[]) {
  if (!isZip(source.bytes)) {
    out.push(source);
    return;
  }
  if (depth >= LIMITS.maxZipDepth) {
    errors.push({ fileName: source.name, reason: 'zipLimit', detail: 'nested' });
    return;
  }
  let entries = 0;
  let total = 0;
  let limitHit = false;
  try {
    const files = unzipSync(source.bytes, {
      filter: (file) => {
        const lower = file.name.toLowerCase();
        if (file.name.endsWith('/') || lower.includes('__macosx/')) return false;
        if (!lower.endsWith('.xml') && !lower.endsWith('.zip') && !SCANNABLE_EXT.test(lower)) return false;
        entries += 1;
        total += file.originalSize;
        if (entries > LIMITS.maxZipEntries || total > LIMITS.maxZipTotalBytes || file.originalSize > LIMITS.maxScanBytes) {
          limitHit = true;
          return false;
        }
        return true;
      },
    });
    if (limitHit) errors.push({ fileName: source.name, reason: 'zipLimit' });
    for (const [name, bytes] of Object.entries(files)) {
      expand({ name: `${source.name}/${name}`, bytes }, depth + 1, out, errors);
    }
  } catch (error) {
    errors.push({ fileName: source.name, reason: 'zipError', detail: String(error) });
  }
}

function ingestXml(source: IngestSource): IngestResult {
  if (source.bytes.byteLength > LIMITS.maxXmlBytes) {
    return { docs: [], errors: [{ fileName: source.name, reason: 'tooLarge' }] };
  }
  const xmlText = decodeXml(source.bytes);
  if (!/^\s*</.test(xmlText)) {
    return { docs: [], errors: [{ fileName: source.name, reason: 'notXml' }] };
  }
  try {
    const docs = parseXmlText(xmlText, source.name);
    if (docs.length === 0) return { docs, errors: [{ fileName: source.name, reason: 'noUblDocument' }] };
    return { docs, errors: [] };
  } catch (error) {
    const reason = error instanceof XmlParseError ? 'parseError' : 'noUblDocument';
    return { docs: [], errors: [{ fileName: source.name, reason, detail: String((error as Error).message) }] };
  }
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Honors BOMs and the XML declaration's encoding (some producers still emit ISO-8859-9). */
export function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /encoding\s*=\s*["']([\w.-]+)["']/i.exec(head)?.[1]?.toLowerCase();
  let encoding = 'utf-8';
  if (declared && declared !== 'utf-8' && declared !== 'utf8') {
    try {
      new TextDecoder(declared);
      encoding = declared;
    } catch {
      encoding = 'utf-8';
    }
  }
  return new TextDecoder(encoding).decode(bytes).replace(/^﻿/, '');
}
