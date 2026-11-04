import polyfillUrl from 'xslt-polyfill/xslt-polyfill.min.js?url';

declare global {
  interface Window {
    xsltUsePolyfillOnlyIfNeeded?: boolean;
    xsltDontAutoloadXmlDocs?: boolean;
    xsltPolyfillQuiet?: boolean;
    xsltPolyfillInstalled?: boolean;
    xsltPolyfillReady?: () => Promise<void>;
  }
}

/**
 * Locks the rendered invoice down: no scripts, no network (tracking pixels,
 * remote fonts), only inline styles and data: images. Keeps the "nothing
 * leaves your device" promise even for hostile stylesheets.
 */
const CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'";

let polyfillPromise: Promise<void> | null = null;

/**
 * Browsers are removing native XSLT (Chrome 158+). The WASM polyfill
 * (libxslt) is only downloaded when the native processor is missing or fails.
 */
function loadPolyfill(): Promise<void> {
  polyfillPromise ??= new Promise<void>((resolve, reject) => {
    window.xsltUsePolyfillOnlyIfNeeded = false;
    window.xsltDontAutoloadXmlDocs = true;
    window.xsltPolyfillQuiet = true;
    const script = document.createElement('script');
    script.src = polyfillUrl;
    script.async = true;
    script.onload = () => {
      Promise.resolve(window.xsltPolyfillReady?.()).then(() => resolve(), reject);
    };
    script.onerror = () => reject(new Error('XSLT polyfill failed to load'));
    document.head.append(script);
  });
  return polyfillPromise;
}

function isNativeProcessor(): boolean {
  try {
    return (
      typeof XSLTProcessor === 'function' &&
      !window.xsltPolyfillInstalled &&
      /\[native code\]/.test(Function.prototype.toString.call(XSLTProcessor))
    );
  } catch {
    return false;
  }
}

function transform(xml: string, xslt: string): string {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'application/xml');
  const xslDoc = parser.parseFromString(xslt, 'application/xml');
  if (xslDoc.getElementsByTagName('parsererror').length) throw new Error('Invalid XSLT');
  const processor = new XSLTProcessor();
  processor.importStylesheet(xslDoc);
  const out = processor.transformToDocument(xmlDoc);
  if (!out?.documentElement) throw new Error('XSLT produced no output');
  const html = out.documentElement.outerHTML ?? new XMLSerializer().serializeToString(out);
  return html;
}

export type XsltEngine = 'native' | 'polyfill';

/** Renders a UBL document with its embedded stylesheet into a self-contained, locked-down HTML string. */
export async function renderWithXslt(xml: string, xslt: string): Promise<{ html: string; engine: XsltEngine }> {
  let html: string | null = null;
  let engine: XsltEngine = 'native';
  if (isNativeProcessor()) {
    try {
      html = transform(xml, xslt);
    } catch {
      html = null;
    }
  }
  if (html === null) {
    await loadPolyfill();
    html = transform(xml, xslt);
    engine = 'polyfill';
  }
  return { html: harden(html), engine };
}

function harden(html: string): string {
  const meta = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  const withoutScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]*>/gi, '');
  if (/<head[^>]*>/i.test(withoutScripts)) {
    return `<!DOCTYPE html>${withoutScripts.replace(/<head[^>]*>/i, (m) => `${m}${meta}`)}`;
  }
  return `<!DOCTYPE html><html><head>${meta}</head><body>${withoutScripts}</body></html>`;
}
