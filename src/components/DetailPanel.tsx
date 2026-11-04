import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { describeFinding, type Dict } from '../i18n';
import type { DocLine, Party, UblDocument } from '../lib/types';
import { OriginalView } from './OriginalView';

type Tab = 'summary' | 'original' | 'lines' | 'checks' | 'xml';

interface Props {
  t: Dict;
  doc: UblDocument;
  onClose: () => void;
  money: (n: number | null | undefined) => string;
  qty: (n: number | null | undefined) => string;
  date: (iso: string) => string;
}

const LEVEL_ORDER = { error: 0, warning: 1, info: 2 } as const;

export function DetailPanel({ t, doc, onClose, money, qty, date }: Props) {
  const [tab, setTab] = useState<Tab>(doc.hasXslt ? 'original' : 'summary');
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTab(doc.hasXslt ? 'original' : 'summary');
    closeBtn.current?.focus();
  }, [doc]);

  // Escape closes; Tab stays inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const focusable = panel.current.querySelectorAll<HTMLElement>('button, [href], input, iframe, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'summary', label: t.tabSummary },
    ...(doc.kind !== 'despatch' || doc.hasXslt ? [{ id: 'original' as const, label: t.tabOriginal }] : []),
    { id: 'lines', label: t.tabLines, count: doc.lines.length },
    { id: 'checks', label: t.tabChecks, count: doc.findings.length },
    { id: 'xml', label: t.tabXml },
  ];

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const index = tabs.findIndex((x) => x.id === tab);
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
    setTab(next.id);
    panel.current?.querySelector<HTMLElement>(`#tab-${next.id}`)?.focus();
  };

  const copyXml = async () => {
    try {
      await navigator.clipboard.writeText(doc.xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={panel} className="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" onKeyDown={onKeyDown}>
        <div className="panel-head">
          <div>
            <h2 id="panel-title">{doc.number || doc.fileName}</h2>
            <p>
              {t.kindLabel[doc.kind]}, {[doc.profile, doc.typeCode].filter(Boolean).join(' / ')}, {date(doc.issueDate)}
            </p>
          </div>
          <button ref={closeBtn} type="button" className="btn" onClick={onClose}>
            {t.close}
          </button>
        </div>

        <div className="tabs" role="tablist" aria-label={doc.number} onKeyDown={onTabKey}>
          {tabs.map((x) => (
            <button
              key={x.id}
              id={`tab-${x.id}`}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              aria-controls="panel-tabpanel"
              tabIndex={tab === x.id ? 0 : -1}
              onClick={() => setTab(x.id)}
            >
              {x.label}
              {x.count !== undefined && <span className="count">{x.count}</span>}
            </button>
          ))}
        </div>

        <div className="panel-body" id="panel-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'summary' && <Summary t={t} doc={doc} money={money} date={date} />}
          {tab === 'original' && <OriginalView t={t} doc={doc} />}
          {tab === 'lines' && <Lines t={t} doc={doc} money={money} qty={qty} />}
          {tab === 'checks' && <Checks t={t} doc={doc} />}
          {tab === 'xml' && (
            <>
              <p>
                <button type="button" className="btn" onClick={copyXml}>
                  {copied ? t.copied : t.copyXml}
                </button>
              </p>
              <XmlView xml={doc.xml} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function PartyCard({ title, party, t }: { title: string; party: Party; t: Dict }) {
  return (
    <div className="party-card">
      <h3>{title}</h3>
      <p>{party.name || '—'}</p>
      {(party.vkn || party.tckn) && <small>{party.vkn ? `VKN ${party.vkn}` : `TCKN ${party.tckn}`}</small>}
      {party.taxOffice && (
        <small>
          {t.taxOffice}: {party.taxOffice}
        </small>
      )}
      {party.city && <small>{party.city}</small>}
    </div>
  );
}

function Summary({ t, doc, money, date }: { t: Dict; doc: UblDocument; money: Props['money']; date: Props['date'] }) {
  const tot = doc.totals;
  return (
    <>
      <div className="parties">
        <PartyCard t={t} title={t.colSupplier} party={doc.supplier} />
        <PartyCard t={t} title={t.colCustomer} party={doc.customer} />
      </div>
      <dl className="facts">
        <Fact label={t.ettn} value={<span className="code">{doc.uuid || '—'}</span>} />
        <Fact label={t.issueDate} value={`${date(doc.issueDate)} ${doc.issueTime}`.trim()} />
        <Fact label={t.profile} value={doc.profile || '—'} />
        <Fact label={t.typeCode} value={doc.typeCode || '—'} />
        {tot && <Fact label={t.currency} value={doc.currency} />}
        {doc.exchangeRate !== null && <Fact label={t.exchangeRate} value={String(doc.exchangeRate)} />}
        {doc.despatch?.date && <Fact label={t.despatchDate} value={doc.despatch.date} />}
        {doc.despatch?.plate && <Fact label={t.plate} value={doc.despatch.plate} />}
        {doc.despatch?.trailerPlate && <Fact label={t.trailer} value={doc.despatch.trailerPlate} />}
        {doc.despatch?.driver && <Fact label={t.driver} value={doc.despatch.driver} />}
        {doc.despatch?.carrier && <Fact label={t.carrier} value={doc.despatch.carrier} />}
        <Fact label={t.file} value={<span className="code">{doc.fileName}</span>} />
      </dl>

      {tot && (
        <>
          <h3 className="section">{t.taxes}</h3>
          <div className="ledger-wrap">
            <table className="ledger">
              <tbody>
                {doc.taxes.map((x, i) => (
                  <tr key={`t${i}`}>
                    <td>
                      {x.name || x.code} {x.percent !== null && `%${x.percent}`}
                    </td>
                    <td className="num">{money(x.taxable)}</td>
                    <td className="num">{money(x.amount)}</td>
                  </tr>
                ))}
                {doc.withholdings.map((x, i) => (
                  <tr key={`w${i}`}>
                    <td>
                      {t.withholding} {x.code} {x.name && `(${x.name})`} {x.percent !== null && `%${x.percent}`}
                    </td>
                    <td className="num">{money(x.taxable)}</td>
                    <td className="num">−{money(x.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td>{t.taxExclusive}</td>
                  <td />
                  <td className="num">{money(tot.taxExclusive)}</td>
                </tr>
                <tr>
                  <td>{t.taxInclusive}</td>
                  <td />
                  <td className="num">{money(tot.taxInclusive)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>{t.payable}</td>
                  <td />
                  <td className="num">
                    {money(tot.payable)} {doc.currency}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {doc.notes.length > 0 && (
        <>
          <h3 className="section">{t.notes}</h3>
          {doc.notes.map((n, i) => (
            <p key={i} className="muted">
              {n}
            </p>
          ))}
        </>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Lines({ t, doc, money, qty }: { t: Dict; doc: UblDocument; money: Props['money']; qty: Props['qty'] }) {
  const isMoney = doc.kind !== 'despatch';
  return (
    <div className="ledger-wrap">
      <table className="ledger">
        <thead>
          <tr>
            <th>{t.lineNo}</th>
            <th>{t.lineName}</th>
            <th className="num">{t.lineQty}</th>
            {isMoney && <th className="num">{t.linePrice}</th>}
            {isMoney && <th className="num">{t.lineVat}</th>}
            {isMoney && <th className="num">{t.lineTotal}</th>}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l: DocLine, i) => (
            <tr key={`${l.id}-${i}`}>
              <td>{l.id}</td>
              <td>{l.name || '—'}</td>
              <td className="num">
                {qty(l.quantity)} {l.unit}
              </td>
              {isMoney && <td className="num">{money(l.unitPrice)}</td>}
              {isMoney && <td className="num">{l.vatPercent ?? '—'}</td>}
              {isMoney && <td className="num">{money(l.total)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Checks({ t, doc }: { t: Dict; doc: UblDocument }) {
  const sorted = [...doc.findings].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const label = { error: t.statusError, warning: t.statusWarning, info: t.statusInfo };
  return (
    <>
      {sorted.length === 0 ? (
        <p>{t.noFindings}</p>
      ) : (
        <ul className="findings">
          {sorted.map((f, i) => (
            <li key={i}>
              <span className={`status is-${f.level}`}>{label[f.level]}</span>
              <span>{describeFinding(t, f)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="disclaimer">{t.checksDisclaimer}</p>
    </>
  );
}

/** Embedded base64 (XSLT, PDF, signatures) is collapsed so the XML stays readable. */
function XmlView({ xml }: { xml: string }) {
  const display = useMemo(
    () =>
      xml.replace(/>([A-Za-z0-9+/=\s]{400,})</g, (_m, data: string) => `>[… ${Math.round(data.length / 1024)} KB base64 …]<`).slice(0, 400_000),
    [xml],
  );
  return (
    <pre className="xml-view" tabIndex={0}>
      {display}
    </pre>
  );
}
