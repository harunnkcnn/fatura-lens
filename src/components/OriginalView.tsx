import { useEffect, useRef, useState } from 'react';
import type { Dict } from '../i18n';
import { extractXslt } from '../lib/parse';
import type { UblDocument } from '../lib/types';
import { renderWithXslt, type XsltEngine } from '../lib/xslt';

type State =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; html: string; engine: XsltEngine }
  | { status: 'failed' };

export function OriginalView({ t, doc }: { t: Dict; doc: UblDocument }) {
  const [state, setState] = useState<State>({ status: doc.hasXslt ? 'loading' : 'none' });
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!doc.hasXslt) {
      setState({ status: 'none' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    const xslt = extractXslt(doc);
    if (!xslt) {
      setState({ status: 'failed' });
      return;
    }
    renderWithXslt(doc.xml, xslt)
      .then((result) => !cancelled && setState({ status: 'ready', ...result }))
      .catch(() => !cancelled && setState({ status: 'failed' }));
    return () => {
      cancelled = true;
    };
  }, [doc]);

  if (state.status === 'none') return <p className="muted">{t.noXslt}</p>;
  if (state.status === 'failed') return <p className="muted">{t.renderFailed}</p>;
  if (state.status === 'loading') return <p className="muted" role="status">{t.rendering}</p>;

  return (
    <div className="original">
      <div>
        <button type="button" className="btn" onClick={() => frame.current?.contentWindow?.print()}>
          {t.print}
        </button>
      </div>
      {/* No allow-scripts: the stylesheet output can never execute code. allow-same-origin only enables print(). */}
      <iframe ref={frame} title={`${t.tabOriginal}: ${doc.number}`} sandbox="allow-same-origin allow-modals" srcDoc={state.html} />
      {t.renderEngine(state.engine) && <p className="muted">{t.renderEngine(state.engine)}</p>}
    </div>
  );
}
