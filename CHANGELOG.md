# Changelog

## 0.1.0 · 2026-11-05

First public release.

- Batch import of UBL-TR e-Fatura, e-Arşiv, e-İrsaliye XML and ZIP archives, including GİB envelopes and nested ZIPs
- Per-currency totals with VAT by rate and withholding, computed in integer kuruş
- Incoming/outgoing classification from the user's own VKN/TCKN
- Original view from the document's embedded XSLT, with a WebAssembly fallback for browsers without native XSLT
- Quick consistency checks (ETTN, number format, VKN/TCKN check digits, totals, withholding, duplicate ETTN)
- CSV export for documents and line items (Turkish and English Excel conventions)
- Turkish and English UI, light and dark themes, mobile layout
