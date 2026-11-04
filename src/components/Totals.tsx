import type { Dict } from '../i18n';
import type { CurrencySummary } from '../lib/aggregate';

interface Props {
  t: Dict;
  money: (n: number | null | undefined) => string;
  summary: CurrencySummary[];
  issueCount: number;
  hasErrors: boolean;
  /** Changes on every import so the stamp is pressed again. */
  stampKey: number;
}

export function Totals({ t, money, summary, issueCount, hasErrors, stampKey }: Props) {
  const stampClass = issueCount === 0 ? '' : hasErrors ? 'is-error' : 'is-warn';
  return (
    <section className="totals" aria-labelledby="totals-title">
      <div>
        <h2 id="totals-title">{t.summaryTitle}</h2>
        <p className="scope">{t.summaryScope}</p>
        {summary.length === 0 && <p className="muted">{t.despatchOnly}</p>}
        {summary.map((s) => (
          <div className="currency-block" key={s.currency}>
            {summary.length > 1 && <p className="block-scope">{t.blockScope(s.count, s.currency)}</p>}
            <dl className="figures">
              <Figure label={t.taxExclusive} value={money(s.taxExclusive)} cur={s.currency} />
              <Figure label={t.vat} value={money(s.vat)} cur={s.currency} />
              {s.withholding !== 0 && <Figure label={t.withholding} value={money(s.withholding)} cur={s.currency} />}
              <Figure label={t.taxInclusive} value={money(s.taxInclusive)} cur={s.currency} />
              <Figure label={t.payable} value={money(s.payable)} cur={s.currency} className="payable" />
            </dl>
            {s.vatByRate.length > 0 && (
              <ul className="rates" aria-label={t.vat}>
                {s.vatByRate.map((r) => (
                  <li key={r.percent}>
                    {t.vatRate(r.percent)}: <strong>{money(r.amount)}</strong> / {money(r.taxable)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div key={stampKey} className={`stamp is-fresh ${stampClass}`} role="status">
        <span>
          {issueCount === 0 ? (
            <>
              <b>✓</b>
              {t.stampClean}
            </>
          ) : (
            <>
              <b>{issueCount}</b>
              {t.stampIssues}
            </>
          )}
        </span>
      </div>
    </section>
  );
}

function Figure({ label, value, cur, className }: { label: string; value: string; cur: string; className?: string }) {
  return (
    <div className={className}>
      <dt>{label}</dt>
      <dd>
        {value}
        <span className="cur">{cur}</span>
      </dd>
    </div>
  );
}
