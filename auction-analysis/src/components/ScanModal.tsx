import { useRef, useState } from 'react';
import { FileUp, Globe, Loader2, PlayCircle, ClipboardPaste, Sparkles, AlertTriangle } from 'lucide-react';
import { ApiError, isMockMode, listDemoCatalogs, loadDemoCatalog, scanSource } from '../lib/api';
import type { Health, ScanProgress, ScanResult, ScanSource } from '../lib/api';
import type { GlobalDefaults } from '../types';
import { Modal, NumberField } from './ui';

type Tab = 'url' | 'file' | 'text' | 'demo';
const MAX_FILE = 5 * 1024 * 1024;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

export default function ScanModal({
  health,
  globals,
  onGlobals,
  onResult,
  onClose,
}: {
  health: Health | null | undefined;
  globals: GlobalDefaults;
  onGlobals: (g: GlobalDefaults) => void;
  onResult: (r: ScanResult) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(isMockMode ? 'demo' : 'url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [catalogLink, setCatalogLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const live = !isMockMode;
  const aiMissing = live && Boolean(health) && !health!.ai;
  const unreachable = live && health === null;

  const run = async (source: ScanSource) => {
    setError('');
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await scanSource(source, setProgress, ctrl.signal);
      onResult(r);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'aborted') setError('Scan cancelled.');
      else setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const submitUrl = () => {
    let u = url.trim();
    if (!u) return setError('Paste the address of the auction catalog.');
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try {
      new URL(u);
    } catch {
      return setError('That does not look like a valid address.');
    }
    void run({ kind: 'url', url: u });
  };

  /** Link do catálogo é opcional nas abas de arquivo e texto: serve para montar o botão Visit Auction. */
  const optionalCatalog = (): string | null => {
    const raw = catalogLink.trim();
    if (!raw) return '';
    const u = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      new URL(u);
      return u;
    } catch {
      setError('The catalog link does not look like a valid address.');
      return null;
    }
  };

  const submitFile = async () => {
    if (!file) return setError('Choose a PDF or an image first.');
    if (file.size > MAX_FILE) return setError('The file is larger than 5 MB.');
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      return setError('Only PDF, PNG, JPEG or WebP files are supported.');
    }
    const cat = optionalCatalog();
    if (cat === null) return;
    try {
      const data = await toBase64(file);
      void run({ kind: 'file', mimeType: file.type, data, name: file.name.replace(/\.[^.]+$/, ''), catalogUrl: cat });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    }
  };

  const submitText = () => {
    if (text.trim().length < 20) return setError('Paste the lot list (at least a few lines).');
    const cat = optionalCatalog();
    if (cat === null) return;
    void run({ kind: 'text', text, catalogUrl: cat });
  };

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'url', label: 'Link', icon: <Globe size={15} /> },
    { id: 'file', label: 'PDF / photo', icon: <FileUp size={15} /> },
    { id: 'text', label: 'Paste text', icon: <ClipboardPaste size={15} /> },
    { id: 'demo', label: 'Demo', icon: <PlayCircle size={15} /> },
  ];

  return (
    <Modal title="Scan New Auction" onClose={onClose}>
      <div className="tabs" role="tablist" aria-label="Source">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => { setTab(t.id); setError(''); }} disabled={busy}>
            <span className="inline-flex items-center gap-1.5">{t.icon}{t.label}</span>
          </button>
        ))}
      </div>

      {!live && tab !== 'demo' && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Demo mode: live scanning and the AI are turned off in this build. Use the Demo tab.</span>
        </div>
      )}
      {unreachable && tab !== 'demo' && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>The server could not be reached. Live scanning needs the deployed site (or npm run cf:dev). The Demo tab still works.</span>
        </div>
      )}
      {aiMissing && tab !== 'demo' && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>The server is running but has no Gemini key yet. Add the GEMINI_API_KEY secret to enable the analysis.</span>
        </div>
      )}

      <div className="mt-4">
        {tab === 'url' && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="scan-url">Auction catalog address</label>
              <input id="scan-url" data-autofocus className="field" placeholder="https://…hibid.com/catalog/…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && live && submitUrl()} disabled={busy} inputMode="url" autoComplete="off" />
              <p className="m-0 mt-1 text-xs text-faint">Works with catalogs that show their lots in the page HTML. Reads up to 10 pages. Sites like HiBid load their lots with JavaScript and cannot be read by link: for those, open the catalog, press Ctrl+A and Ctrl+C, and use Paste text (or save the page as PDF).</p>
            </div>
            <button className="btn btn-primary w-full" onClick={submitUrl} disabled={busy || !live}>
              <Sparkles size={16} /> Scan and analyze
            </button>
          </div>
        )}

        {tab === 'file' && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="scan-file">Catalog PDF or photo of the lot list</label>
              <input id="scan-file" className="field" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} style={{ paddingTop: 7 }} />
              <p className="m-0 mt-1 text-xs text-faint">PDF, PNG, JPEG or WebP, up to 5 MB. The AI reads the lots from the file.</p>
            </div>
            <div>
              <label className="label" htmlFor="scan-catalog-link">Catalog link (optional)</label>
              <input id="scan-catalog-link" className="field" placeholder="https://…hibid.com/catalog/…" value={catalogLink} onChange={(e) => setCatalogLink(e.target.value)} disabled={busy} inputMode="url" autoComplete="off" />
              <p className="m-0 mt-1 text-xs text-faint">Paste the auction page address here so each lot gets its Visit Auction link and the right fee profile.</p>
            </div>
            <button className="btn btn-primary w-full" onClick={submitFile} disabled={busy || !live}>
              <Sparkles size={16} /> Read file and analyze
            </button>
          </div>
        )}

        {tab === 'text' && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="scan-text">Lot list</label>
              <textarea id="scan-text" className="field" placeholder={'Lot 12 - Keysight DSOX1204G oscilloscope - current bid $620\nLot 15 - Fluke 87V multimeters x6 - $480'} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
              <p className="m-0 mt-1 text-xs text-faint">On the auction page press Ctrl+A, then Ctrl+C, and paste here. Up to about 150 lots per paste: do one catalog page at a time.</p>
            </div>
            <div>
              <label className="label" htmlFor="scan-catalog-link">Catalog link (optional)</label>
              <input id="scan-catalog-link" className="field" placeholder="https://…hibid.com/catalog/…" value={catalogLink} onChange={(e) => setCatalogLink(e.target.value)} disabled={busy} inputMode="url" autoComplete="off" />
              <p className="m-0 mt-1 text-xs text-faint">Paste the auction page address here so each lot gets its Visit Auction link and the right fee profile.</p>
            </div>
            <button className="btn btn-primary w-full" onClick={submitText} disabled={busy || !live}>
              <Sparkles size={16} /> Read text and analyze
            </button>
          </div>
        )}

        {tab === 'demo' && (
          <div className="space-y-2">
            <p className="m-0 text-sm text-mute">Fictional catalogs with made-up prices, to try the app without any setup.</p>
            {listDemoCatalogs().map((d) => (
              <button key={d.slug} className="btn w-full !h-auto flex-col !items-start gap-0.5 !py-3 text-left" onClick={() => onResult(loadDemoCatalog(d.slug))}>
                <span className="font-semibold">{d.name}</span>
                <span className="text-xs font-normal text-mute">{d.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <fieldset className="m-0 mt-5 min-w-0 rounded-xl border border-line p-3" disabled={busy}>
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-mute">Starting defaults</legend>
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Buyer's premium" value={Math.round(globals.buyersPremium * 10000) / 100} onChange={(n) => onGlobals({ ...globals, buyersPremium: n / 100 })} suffix="%" step={0.25} />
          <NumberField label="Sales tax" value={Math.round(globals.salesTax * 10000) / 100} onChange={(n) => onGlobals({ ...globals, salesTax: n / 100 })} suffix="%" step={0.25} />
          <NumberField label="Avg freight / lot" value={globals.avgShipping} onChange={(n) => onGlobals({ ...globals, avgShipping: n })} prefix="$" />
        </div>
        <p className="m-0 mt-2 text-xs text-faint">Used for auctions with no profile of their own. Known auction houses use their own fees (see Settings).</p>
      </fieldset>

      {busy && (
        <div className="mt-4 rounded-xl border border-line bg-bg p-3" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin text-cyan" />
            <span>{progress?.message ?? 'Working…'}</span>
          </div>
          {progress && progress.total > 0 && (
            <div className="bar mt-2"><span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
          )}
          <button className="btn btn-sm mt-3" onClick={() => abortRef.current?.abort()}>Cancel</button>
        </div>
      )}

      {error && (
        <p className="m-0 mt-3 rounded-xl border border-stop/40 bg-stop/10 p-3 text-sm text-stop" role="alert">{error}</p>
      )}
    </Modal>
  );
}
