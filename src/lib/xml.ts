/**
 * Namespace-agnostic helpers. UBL-TR producers use different prefixes
 * (cbc/cac, n1, ns2…), so we always match on localName.
 */

export function children(el: Element | null | undefined, name: string): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  for (const child of Array.from(el.children)) {
    if (child.localName === name) out.push(child);
  }
  return out;
}

/** First element following a child path, e.g. child(party, 'PartyName', 'Name'). */
export function child(el: Element | null | undefined, ...path: string[]): Element | null {
  let current: Element | null | undefined = el;
  for (const name of path) {
    if (!current) return null;
    current = children(current, name)[0];
  }
  return current ?? null;
}

export function text(el: Element | null | undefined, ...path: string[]): string {
  return child(el, ...path)?.textContent?.trim() ?? '';
}

export function num(el: Element | null | undefined, ...path: string[]): number | null {
  const raw = text(el, ...path);
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function attr(el: Element | null | undefined, name: string): string {
  return el?.getAttribute(name)?.trim() ?? '';
}
