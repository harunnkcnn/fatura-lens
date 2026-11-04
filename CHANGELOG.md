# Changelog

## 0.2.0 · 2026-11-05

- Read PDFs and photos (PNG, JPEG, WebP) through the GİB karekod: number, ETTN, parties, VAT by rate and totals, decoded locally with pdf.js and zxing-wasm (loaded on demand)
- Multi-page PDFs: every page is scanned, so a batch PDF becomes one row per invoice
- XML ↔ PDF cross-check: same ETTN becomes one row, counted once, with every disagreeing field flagged
- Company names for karekod-only rows are filled in from XML documents in the same session
- Checks tolerate the conventions in GİB's public example set (line totals after discounts, VAT net of withholding)
- New demo samples: two PDFs and a phone photo with real GİB-format karekods

## 0.1.0 · 2026-11-05

First public release.

- Batch import of UBL-TR e-Fatura, e-Arşiv, e-İrsaliye XML and ZIP archives, including GİB envelopes and nested ZIPs
- Per-currency totals with VAT by rate and withholding, computed in integer kuruş
- Incoming/outgoing classification from the user's own VKN/TCKN
- Original view from the document's embedded XSLT, with a WebAssembly fallback for browsers without native XSLT
- Quick consistency checks (ETTN, number format, VKN/TCKN check digits, totals, withholding, duplicate ETTN)
- CSV export for documents and line items (Turkish and English Excel conventions)
- Turkish and English UI, light and dark themes, mobile layout
