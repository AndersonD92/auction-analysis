import { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type { Row } from '../lib/derive';
import { money, nextIncrement } from '../lib/pricing';

type Zone = { label: string; color: string; detail: string };

function zoneFor(r: Row): Zone {
  const bid = r.lot.currentBid;
  const p = r.plan;
  if (p.max <= 0 || !p.viable) return { label: 'DO NOT BID', color: 'var(--stop)', detail: 'No bid leaves a profit for this lot.' };
  if (bid > p.max) return { label: 'STOP', color: 'var(--stop)', detail: `Over your ${money(p.max)} ceiling. Let it go.` };
  if (bid >= p.balanced) return { label: 'LAST ZONE', color: 'var(--amber)', detail: `Margin is below 27%. Ceiling is ${money(p.max)}.` };
  if (bid >= p.conservative) return { label: 'GOOD', color: 'var(--go)', detail: `Balanced bid is ${money(p.balanced)}.` };
  return { label: 'GREAT PRICE', color: 'var(--go)', detail: `Under your Conservative bid of ${money(p.conservative)}.` };
}

export default function LiveMode({
  rows,
  lotId,
  onSelect,
  onBid,
  onClose,
}: {
  rows: Row[];
  lotId: string;
  onSelect: (id: string) => void;
  onBid: (lotId: string, bid: number) => void;
  onClose: () => void;
}) {
  const row = rows.find((r) => r.lot.id === lotId) ?? rows[0];
  const [wake, setWake] = useState(false);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; setWake(true); }).catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lock?.release().catch(() => {});
    };
  }, [onClose]);

  if (!row) return null;
  const z = zoneFor(row);
  const step = nextIncrement(row.lot.currentBid, row.house);
  const set = (v: number) => onBid(row.lot.id, Math.max(0, v));

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto" style={{ background: 'var(--bg)' }} role="dialog" aria-modal="true" aria-label="Live auction mode">
      <div className="flex items-center gap-2 border-b border-line p-3">
        <select aria-label="Lot" className="field" value={row.lot.id} onChange={(e) => onSelect(e.target.value)}>
          {rows.map((r) => <option key={r.lot.id} value={r.lot.id}>Lot {r.lot.lotNumber} · {r.lot.title.slice(0, 50)}</option>)}
        </select>
        <button className="btn btn-icon" onClick={onClose} aria-label="Close live mode"><X size={20} /></button>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 p-5 text-center">
        <div className="rounded-3xl border-2 px-4 py-6" style={{ borderColor: z.color, background: `color-mix(in srgb, ${z.color} 10%, transparent)` }} role="status" aria-live="polite">
          <div className="display text-4xl font-extrabold tracking-wide" style={{ color: z.color }}>{z.label}</div>
          <div className="mt-1 text-sm text-mute">{z.detail}</div>
        </div>

        <div>
          <div className="label">Current bid in the room</div>
          <div className="num text-6xl font-bold">{money(row.lot.currentBid)}</div>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button className="btn btn-icon !h-14 !w-14" onClick={() => set(row.lot.currentBid - step)} aria-label={`Lower by ${step}`}><Minus size={22} /></button>
            <span className="num w-20 text-sm text-mute">± {money(step)}</span>
            <button className="btn btn-icon !h-14 !w-14" onClick={() => set(row.lot.currentBid + step)} aria-label={`Raise by ${step}`}><Plus size={22} /></button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            ['Conservative', row.plan.conservative, 'var(--cyan)'],
            ['Balanced', row.plan.balanced, 'var(--go)'],
            ['Max', row.plan.max, 'var(--amber)'],
          ].map(([k, v, c]) => (
            <div key={k as string} className="rounded-2xl border border-line bg-panel p-3">
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-mute">{k}</div>
              <div className="num text-2xl font-bold" style={{ color: c as string }}>{money(v as number)}</div>
            </div>
          ))}
        </div>

        <p className="m-0 text-xs text-faint">
          Type the bid you see on the auction page. Asking price only: this app never places bids for you.
          {wake ? ' Screen stays on while this is open.' : ''}
        </p>
      </div>
    </div>
  );
}
