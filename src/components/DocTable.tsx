import type { Dict } from '../i18n';
import { directionOf, worstLevel } from '../lib/aggregate';
import type { UblDocument } from '../lib/types';
import { SortIcon } from './Icons';

export type SortKey = 'status' | 'date' | 'number' | 'supplier' | 'customer' | 'taxExclusive' | 'vat' | 'withholding' | 'payable';
export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const LEVEL_RANK = { error: 3, warning: 2, info: 1 } as const;

export function sortDocs(docs: UblDocument[], { key, dir }: SortState): UblDocument[] {
  const value = (d: UblDocument): string | number => {
    switch (key) {
      case 'status': {
        const level = worstLevel(d);
        return level ? LEVEL_RANK[level] : 0;
      }
      case 'date':
        return `${d.issueDate} ${d.issueTime}`;
      case 'number':
        return d.number;
      case 'supplier':
        return d.supplier.name.toLocaleLowerCase('tr');
      case 'customer':
        return d.customer.name.toLocaleLowerCase('tr');
      case 'taxExclusive':
        return d.totals?.taxExclusive ?? -Infinity;
      case 'vat':
        return d.totals?.vat ?? -Infinity;
      case 'withholding':
        return d.totals?.withholding ?? -Infinity;
      case 'payable':
        return d.totals?.payable ?? -Infinity;
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...docs].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
    return String(va).localeCompare(String(vb), 'tr') * sign;
  });
}

interface Props {
  t: Dict;
  docs: UblDocument[];
  total: number;
  sort: SortState;
  onSort: (key: SortKey) => void;
  selectedKey: string | null;
  onOpen: (doc: UblDocument, opener: HTMLElement) => void;
  myIds: ReadonlySet<string>;
  money: (n: number | null | undefined) => string;
  date: (iso: string) => string;
  canShowMore: boolean;
  onShowMore: () => void;
}

export function DocTable(props: Props) {
  const { t, docs, sort, onSort, money, date } = props;

  const header = (key: SortKey, label: string, numeric = false) => {
    const active = sort.key === key;
    return (
      <th className={numeric ? 'num' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} scope="col">
        <button type="button" className="sort" data-active={active} onClick={() => onSort(key)} aria-label={t.sortBy(label)}>
          {label}
          <SortIcon dir={active ? sort.dir : null} />
        </button>
      </th>
    );
  };

  return (
    <div className="table-wrap">
      <table className="docs">
        <thead>
          <tr>
            {header('status', t.colStatus)}
            {header('date', t.colDate)}
            {header('number', t.colNumber)}
            <th scope="col">{t.colType}</th>
            {header('supplier', t.colSupplier)}
            {header('customer', t.colCustomer)}
            {header('taxExclusive', t.colTaxExclusive, true)}
            {header('vat', t.colVat, true)}
            {header('withholding', t.colWithholding, true)}
            {header('payable', t.colPayable, true)}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => {
            const level = worstLevel(doc);
            const dir = directionOf(doc, props.myIds);
            const cur = doc.totals && doc.currency !== 'TRY' ? ` ${doc.currency}` : '';
            return (
              <tr key={doc.key} className={props.selectedKey === doc.key ? 'is-selected' : undefined}>
                <td className="c-status">
                  <span className={`status${level ? ` is-${level}` : ''}`}>
                    {level === 'error' ? t.statusError : level === 'warning' ? t.statusWarning : level === 'info' ? t.statusInfo : t.statusOk}
                  </span>
                </td>
                <td className="c-date">{date(doc.issueDate)}</td>
                <td className="c-number">
                  <button type="button" className="doc-link" onClick={(e) => props.onOpen(doc, e.currentTarget)} aria-label={t.openDoc(doc.number || doc.fileName)}>
                    {doc.number || '—'}
                  </button>
                  {dir && <span className="dir">{dir === 'incoming' ? t.dirIncoming : t.dirOutgoing}</span>}
                </td>
                <td className="type c-type">
                  {t.kindLabel[doc.kind]}
                  <small>{[doc.profile, doc.typeCode].filter(Boolean).join(' / ')}</small>
                </td>
                <td className="party c-supplier" title={doc.supplier.name}>
                  {doc.supplier.name || '—'}
                  <small>{doc.supplier.vkn ?? doc.supplier.tckn ?? ''}</small>
                </td>
                <td className="party c-customer" title={doc.customer.name}>
                  {doc.customer.name || '—'}
                  <small>{doc.customer.vkn ?? doc.customer.tckn ?? ''}</small>
                </td>
                <td className="num c-net">{doc.totals ? money(doc.totals.taxExclusive) + cur : '—'}</td>
                <td className="num c-vat">{doc.totals ? money(doc.totals.vat) : '—'}</td>
                <td className="num c-wh">{doc.totals?.withholding ? money(doc.totals.withholding) : '—'}</td>
                <td className="num c-payable">
                  <strong>{doc.totals ? money(doc.totals.payable) + cur : '—'}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="table-foot">
        <span>{props.canShowMore ? t.shownOf(docs.length, props.total) : t.docsCount(props.total)}</span>
        {props.canShowMore && (
          <button type="button" className="btn btn-quiet" onClick={props.onShowMore}>
            {t.showMore}
          </button>
        )}
      </div>
    </div>
  );
}
