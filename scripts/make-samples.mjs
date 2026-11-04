#!/usr/bin/env node
/**
 * Builds the synthetic karekod demo files in public/samples from
 * src/lib/sample-karekod.json: an HTML invoice page per sample with a real
 * GİB-format QR code, printed to PDF (or a JPEG for "photo" samples) with a
 * local Chrome/Chromium in headless mode.
 *
 *   CHROME=/path/to/chrome node scripts/make-samples.mjs
 *
 * All companies, IDs and amounts are fictitious.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'samples');
const workDir = join(root, 'node_modules', '.cache', 'fatura-lens-samples');
mkdirSync(outDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const { samples } = JSON.parse(readFileSync(join(root, 'src/lib/sample-karekod.json'), 'utf8'));
const chrome = process.env.CHROME ?? 'google-chrome';

const tl = (v) => Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

for (const sample of samples) {
  const p = sample.payload;
  const qr = await QRCode.toDataURL(JSON.stringify(p), { errorCorrectionLevel: 'M', margin: 2, width: 360 });
  const rates = Object.entries(p)
    .filter(([k]) => /^hesaplanankdv/.test(k.replace(/\s/g, '')))
    .map(([k, v]) => `<tr><th>Hesaplanan KDV (%${k.match(/\(([\d.]+)\)/)[1]})</th><td>${tl(v)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0 }
    body { margin: 0; font: 13px/1.45 'DejaVu Sans', Arial, sans-serif; color: #222; }
    .page { width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 18mm 16mm; background: #fff; }
    .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #333; padding-bottom: 12px; }
    .top img { width: 34mm; height: 34mm; }
    h1 { font-size: 22px; letter-spacing: .06em; margin: 0 0 6px; }
    .muted { color: #666; }
    table { border-collapse: collapse; margin-top: 18px; }
    th, td { border: 1px solid #bbb; padding: 6px 10px; text-align: left; }
    td { text-align: right; min-width: 40mm; }
    .note { margin-top: 28px; padding: 10px 12px; background: #f4f1ff; border-left: 3px solid #5b3fc4; }
  </style></head><body><div class="page">
    <div class="top">
      <div><strong>${esc(sample.supplierName)}</strong><br><span class="muted">VKN: ${esc(p.vkntckn)}</span>
        <p><strong>SAYIN</strong><br>${esc(sample.customerName)}<br><span class="muted">VKN/TCKN: ${esc(p.avkntckn)}</span></p></div>
      <div style="text-align:right"><img src="${qr}" alt=""><h1>${esc(sample.title)}</h1>
        <span class="muted">No: ${esc(p.no)}<br>Tarih: ${esc(p.tarih)}<br>Senaryo: ${esc(p.senaryo)}, Tip: ${esc(p.tip)}<br>ETTN: ${esc(p.ettn)}</span></div>
    </div>
    <table>
      <tr><th>Mal Hizmet Toplam Tutarı</th><td>${tl(p.malhizmettoplam)}</td></tr>
      ${rates}
      <tr><th>Vergiler Dahil Toplam</th><td>${tl(p.vergidahil)}</td></tr>
      <tr><th>Ödenecek Tutar</th><td><strong>${tl(p.odenecek)} ${esc(p.parabirimi)}</strong></td></tr>
    </table>
    <p class="note">Örnek belge — Fatura Lens demosu için üretilmiştir. ${esc(sample.note)}</p>
  </div></body></html>`;

  const htmlPath = join(workDir, `${sample.file}.html`);
  writeFileSync(htmlPath, html);
  const target = join(outDir, sample.file);
  if (sample.photo) {
    const png = join(workDir, `${sample.file}.png`);
    execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${png}`, '--window-size=900,1100', htmlPath]);
    console.log(`Rendered ${png}; convert it to ${target} (optionally rotate/blur to mimic a photo).`);
  } else {
    execFileSync(chrome, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${target}`, htmlPath]);
    console.log(`Wrote ${target}`);
  }
}
