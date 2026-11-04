import { unzipSync } from 'fflate';
import { parseXmlText, XmlParseError } from './parse';
import type { IngestError, UblDocument } from './types';

export const LIMITS = {
  maxXmlBytes: 50 * 1024 * 1024,
  maxZipEntries: 5000,
  maxZipTotalBytes: 500 * 1024 * 1024,
  maxZipDepth: 2,
} as const;

export interface IngestResult {
  docs: UblDocument[];
  errors: IngestError[];
}

export interface IngestSource {
  name: string;
  bytes: Uint8Array;
}

export type ProgressFn = (done: number, total: number) => void;

let batchCounter = 0;

/** Parses XML and ZIP sources into UBL documents, yielding to the UI between files. */
export async function ingest(sources: IngestSource[], onProgress?: ProgressFn): Promise<IngestResult> {
  const batch = ++batchCounter;
  const expanded: IngestSource[] = [];
  const errors: IngestError[] = [];
  for (const source of sources) expand(source, 0, expanded, errors);

  const docs: UblDocument[] = [];
  for (const [i, source] of expanded.entries()) {
    const result = ingestXml(source);
    for (const doc of result.docs) doc.key = `${batch}/${doc.key}`;
    docs.push(...result.docs);
    errors.push(...result.errors);
    if (i % 25 === 24) {
      onProgress?.(i + 1, expanded.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress?.(expanded.length, expanded.length);
  return { docs, errors };
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
        if (!lower.endsWith('.xml') && !lower.endsWith('.zip')) return false;
        entries += 1;
        total += file.originalSize;
        if (entries > LIMITS.maxZipEntries || total > LIMITS.maxZipTotalBytes || file.originalSize > LIMITS.maxXmlBytes) {
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
