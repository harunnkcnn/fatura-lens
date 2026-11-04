# Security policy

Fatura Lens processes invoices, which contain trade secrets and personal data. Its security model is simple: **nothing leaves the device.**

## Design guarantees

- **No backend.** The app is static files. Documents are read with the File API and parsed locally.
- **Strict CSP on the app.** `connect-src 'self'`, no third-party scripts, styles or fonts.
- **Sandboxed invoice rendering.** Embedded XSLT output is shown in an `<iframe sandbox>` without `allow-scripts`, with its own CSP (`default-src 'none'; img-src data:`). Script tags and meta refreshes are stripped before rendering.
- **Scanning is local.** PDFs are rendered with pdf.js and QR codes decoded with zxing-wasm, both served from the app itself; nothing is sent to an OCR or QR service.
- **Archive limits.** ZIP expansion stops at 5,000 entries, 500 MB uncompressed, 50 MB per XML and two nesting levels.
- **CSV export** neutralizes cells starting with `= + - @` to prevent spreadsheet formula injection.
- **XML parsing** uses the browser's `DOMParser`, which does not resolve external entities.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private vulnerability reporting (Security tab → *Report a vulnerability*). Include steps to reproduce and, if possible, a **synthetic** XML file. Never send real invoices.

You can expect a first response within 7 days.

## Supported versions

Only the latest release on `main` receives fixes.
