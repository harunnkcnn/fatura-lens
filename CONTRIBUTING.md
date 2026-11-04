# Contributing / Katkı

Türkçe ya da İngilizce yazabilirsiniz. You can write in Turkish or English.

## Never share real invoices / Gerçek fatura paylaşmayın

Real e-invoices contain tax IDs, names, addresses and prices. When reporting a parsing problem, **anonymize** the XML: replace names, VKN/TCKN, addresses and amounts, keep only the structure that triggers the bug. `src/lib/samples.ts` shows how to build a synthetic document.

Gerçek faturalar VKN/TCKN, isim, adres ve fiyat içerir. Hata bildirirken XML'i **anonimleştirin**: isimleri, numaraları, adresleri ve tutarları değiştirin, yalnızca hatayı tetikleyen yapıyı bırakın.

## Development

```bash
npm ci
npm run dev
npm test
npm run typecheck
```

- Keep the app dependency-light. A new runtime dependency needs a clear reason in the PR.
- Parsing logic lives in `src/lib/` and must stay framework-free and covered by tests in `src/lib/lib.test.ts`.
- Every UI string goes through `src/i18n.ts` in **both** languages.
- Interactive elements must work with the keyboard and keep a visible focus ring.
- New checks belong in `src/lib/checks.ts` with a level (`error` only for things that are certainly wrong), a translated message and a test.

## Pull requests

1. Open an issue first for larger changes.
2. One topic per PR, with a short description of the why.
3. `npm test` and `npm run build` must pass (CI runs both).
