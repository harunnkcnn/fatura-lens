/**
 * Browser-only karekod scanner for PDFs and images. Loaded on demand, so
 * XML-only users never download pdf.js or the QR decoder.
 *
 * Everything runs locally: pdf.js renders pages to a canvas and zxing-wasm
 * (ZXing-C++ compiled to WebAssembly) decodes the QR codes. Both the pdf.js
 * worker and the .wasm file are bundled with the app, not fetched from a CDN.
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { ScanHit } from './ingest';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingWasmUrl : prefix + path),
  },
});

const READER: ReaderOptions = {
  formats: ['QRCode'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  maxNumberOfSymbols: 8,
};

const MAX_PDF_PAGES = 60;
/** ~2× A4 at 72 dpi: enough for a 2 cm karekod to resolve cleanly. */
const PDF_SCALE = 2;
const MAX_IMAGE_EDGE = 2400;

export async function scanPdf(bytes: Uint8Array): Promise<ScanHit[]> {
  // pdf.js transfers the buffer to its worker; give it a copy so the caller's bytes stay usable.
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
  const pdf = await task.promise;
  const hits: ScanHit[] = [];
  try {
    const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: PDF_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const texts = await decode(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (texts.length) {
        const previewUrl = await canvasUrl(canvas);
        for (const text of texts) hits.push({ text, previewUrl });
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return hits;
}

export async function scanImage(bytes: Uint8Array, mime: string): Promise<ScanHit[]> {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const texts = await decode(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (!texts.length) return [];
  const previewUrl = URL.createObjectURL(blob);
  return texts.map((text) => ({ text, previewUrl }));
}

async function decode(image: ImageData): Promise<string[]> {
  const results = await readBarcodes(image, READER);
  return [...new Set(results.filter((r) => r.isValid && r.text).map((r) => r.text))];
}

function canvasUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.85),
  );
}
