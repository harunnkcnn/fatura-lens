<p align="center">
  <img src="public/favicon.svg" width="72" height="72" alt="">
</p>

<h1 align="center">Fatura Lens</h1>

<p align="center">
  <strong>Drop a folder of Turkish e-invoices. Get the totals, the VAT split and every inconsistency in seconds.</strong><br>
  Open-source, offline reader for UBL-TR e-Fatura, e-Arşiv and e-İrsaliye XML.
</p>

<p align="center">
  <a href="https://harunnkcnn.github.io/fatura-lens/"><b>Live demo</b></a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="#features">Features</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#run-it-yourself">Run it yourself</a>
</p>

<p align="center">
  <a href="https://github.com/harunnkcnn/fatura-lens/actions/workflows/ci.yml"><img src="https://github.com/harunnkcnn/fatura-lens/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-5b3fc4" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/data-never%20leaves%20your%20device-1f7a4d" alt="Data never leaves your device">
</p>

<p align="center">
  <a href="docs/assets/demo.mp4"><img src="docs/assets/demo.gif" width="860" alt="Loading sample invoices, filtering to documents with findings, opening the checks and the original invoice view"></a>
</p>

## Why

Every month, accountants, small businesses and logistics teams in Türkiye download ZIP files full of UBL-TR XML from their integrator or the GİB portal, then open them **one by one** to check amounts. Spreadsheets are typed in by hand. Mistakes like a wrong VKN, a line total that doesn't add up or a missing withholding breakdown are found late, if at all.

Fatura Lens reads the whole pile at once, entirely in your browser:

- **No upload, no account, no server.** Invoices contain trade secrets and personal data; they stay on your device.
- **Survives the end of browser XSLT.** Chrome [stops running XSLT on 17 November 2026](https://developer.chrome.com/docs/web-platform/deprecating-xslt), and Firefox and Safari plan the same. Many web-based e-invoice viewers will silently break. Fatura Lens uses the native engine while it exists and falls back to a bundled WebAssembly build of libxslt, so the invoice's own official layout keeps rendering.

## Features

| | |
|---|---|
| **Batch import** | Drag in any mix of `.xml` and `.zip` files (nested ZIPs and GİB envelopes included). Re-importing the same files does not double-count. |
| **Totals that respect currencies** | Net, VAT, withholding, tax-inclusive and payable amounts, per currency. TRY is never added to EUR. Sums use integer kuruş, so 2,000 invoices don't drift. |
| **VAT by rate** | %20 / %10 / %1 / %0 breakdown with base and tax, handy when preparing the monthly VAT return. |
| **Incoming vs outgoing** | Enter your own VKN/TCKN once; every document is labelled and filterable. |
| **Original view** | Renders the stylesheet (XSLT) embedded in each invoice, the same layout the issuer intended. Print-ready. |
| **e-İrsaliye** | Despatch advices with plate, trailer plate, driver, carrier and delivered quantities. |
| **Quick checks** | Flags broken ETTN, number/date year mismatch, VKN/TCKN check-digit failures, line totals that don't add up, tax totals vs subtotals, missing withholding on `TEVKIFAT`, duplicate ETTNs with different content. |
| **Excel export** | Documents and line items as CSV, with `;` and decimal commas for Turkish Excel (or `,` and points in English). Formula injection is neutralized. |
| **Search everything** | Number, company, VKN, ETTN, product name, plate, driver. Press `/` to focus search. |
| **Turkish and English** | Full UI in both, light and dark themes, keyboard accessible, works on phones. |

<table>
  <tr>
    <td><img src="docs/assets/overview-en.png" alt="Totals per currency with a check stamp, and the document table"></td>
    <td><img src="docs/assets/original-view-en.png" alt="An invoice rendered with its own embedded stylesheet"></td>
  </tr>
  <tr>
    <td align="center">Totals per currency, VAT by rate, status for every document</td>
    <td align="center">The invoice's own layout, rendered locally and sandboxed</td>
  </tr>
</table>

<p align="center">
  <img src="docs/assets/mobile-dark.png" width="260" alt="Mobile layout in dark mode">
  <img src="docs/assets/mobile-checks-dark.png" width="260" alt="Quick checks on mobile">
</p>

## Privacy

- Files are read with the File API and parsed with the browser's own `DOMParser`. There is no backend.
- The page ships a strict Content-Security-Policy (`connect-src 'self'`): the app itself cannot send your data anywhere.
- Invoice stylesheets run inside a sandboxed iframe **without scripts** and with their own CSP (`default-src 'none'`), so a hostile XSLT cannot run code, load tracking pixels or reach the network.
- The only things stored in your browser are the language, the theme and the VKN/TCKN you typed. No analytics.

## What the checks are, and aren't

The checks are fast heuristics meant to catch the mistakes people actually make. They are **not** a replacement for GİB's XSD + schematron validation and do not verify digital signatures. If you need full schematron validation, see [efatura-kontrol](https://pypi.org/project/efatura-kontrol/).

## Run it yourself

The live demo is the same static build you get here. Requirements: Node.js 22+.

```bash
git clone https://github.com/harunnkcnn/fatura-lens.git
cd fatura-lens
npm ci
npm run dev        # http://localhost:5173
npm test           # parser, checks, ZIP, CSV and aggregation tests
npm run build      # static files in dist/
```

`dist/` is plain static files. Host it on any web server, an intranet share or GitHub Pages. To serve under a sub-path, build with `VITE_BASE=/your-path/ npm run build`.

## How it works

```
 .xml / .zip ─▶ ingest.ts ─▶ parse.ts ─▶ checks.ts ─▶ aggregate.ts ─▶ React UI
   (fflate,       (encoding,   (UBL-TR →    (findings)    (per-currency      │
    limits)        envelopes)   typed doc)                 totals, dedupe)    ├─▶ csv.ts
                                                                              └─▶ xslt.ts (native → WASM)
```

- `src/lib/parse.ts`: namespace-agnostic UBL-TR reader (works with `cbc:`, `n1:` or no prefixes).
- `src/lib/ingest.ts`: ZIP expansion with zip-bomb limits (5,000 entries, 500 MB, 2 levels), BOM and `ISO-8859-9` handling.
- `src/lib/xslt.ts`: native `XSLTProcessor` when available, [xslt-polyfill](https://github.com/mfreed7/xslt_polyfill) (libxslt compiled to WASM) otherwise, loaded only when needed.
- All sample documents in `src/lib/samples.ts` are synthetic; companies and IDs are fictitious.

## Roadmap

- [ ] Desktop app for Windows and macOS (Tauri), with folder watching
- [ ] Native `.xlsx` export with one sheet per currency
- [ ] Installable PWA for fully offline use
- [ ] e-SMM and e-Müstahsil support
- [ ] Monthly VAT return helper (KDV beyannamesi grouping)

Ideas and real-world edge cases are welcome in [issues](https://github.com/harunnkcnn/fatura-lens/issues). Please never attach real invoices; see [CONTRIBUTING](CONTRIBUTING.md).

## License and credits

[MIT](LICENSE) © Harun. Not affiliated with the Revenue Administration (GİB); "e-Fatura", "e-Arşiv" and "e-İrsaliye" are names of public services. Third-party components keep their own licenses; see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).
