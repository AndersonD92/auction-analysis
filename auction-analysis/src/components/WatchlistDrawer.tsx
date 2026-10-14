import { Trash2 } from 'lucide-react';
import type { CalibrationRecord, WatchEntry, WatchStatus } from '../types';
import type { Row } from '../lib/derive';
import { money, pct } from '../lib/pricing';
import { Drawer, EmptyNote, NumberField, TierBadge } from './ui';

const STATUSES: WatchStatus[] = ['Monitoring', 'Bid Placed', 'Won', 'Lost'];

export default function WatchlistDrawer({
  rows,
  watch,
  calibration,
  onChange,
  onRemove,
  onLive,
  onClose,
}: {
  rows: Row[];
  watch: WatchEntry[];
  calibration: CalibrationRecord[];
  onChange: (lotId: string, patch: Partial<WatchEntry>) => void;
  onRemove: (lotId: string) => void;
  onLive: (lotId: string) => void;
  onClose: () => void;
}) {
  const byId = new Map(rows.map((r) => [r.lot.id, r]));
  const items = watch.map((w) => ({ w, r: byId.get(w.lotId) })).filter((x): x is { w: WatchEntry; r: Row } => Boolean(x.r));
  const orphan = watch.length - items.length;

  return (
    <Drawer title={`Watchlist (${items.length})`} onClose={onClose}>
      {items.length === 0 ? (
        <EmptyNote>Star a lot to follow it here. You can track your max bid and, after the sale, what you really paid and received.</EmptyNote>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {items.map(({ w, r }) => {
            const over = w.myMaxBid > 0 && w.myMaxBid > r.plan.max;
            return (
              <li key={w.lotId} className="rounded-xl border border-line bg-bg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="num text-xs text-faint">LOT {r.lot.lotNumber}</div>
                    <div className="text-sm font-semibold leading-snug">{r.lot.title}</div>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove lot ${r.lot.lotNumber}`} onClick={() => onRemove(w.lotId)}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TierBadge tier={r.plan.tier} score={r.plan.score} />
                  <span className="chip num">Bid now {money(r.lot.currentBid)}</span>
                  <span className="chip num">Ceiling {money(r.plan.max)}</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor={`st-${w.lotId}`}>Status</label>
                    <select id={`st-${w.lotId}`} className="field" value={w.status} onChange={(e) => onChange(w.lotId, { status: e.target.value as WatchStatus })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <NumberField label="My max bid" value={w.myMaxBid} onChange={(n) => onChange(w.lotId, { myMaxBid: n })} prefix="$" />
                </div>
                {over && <p className="m-0 mt-2 text-xs text-stop">Above the {money(r.plan.max)} ceiling that keeps a 15% margin.</p>}

                {w.status === 'Won' && (
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
                    <NumberField label="Total I paid" value={w.finalPricePaid ?? 0} onChange={(n) => onChange(w.lotId, { finalPricePaid: n })} prefix="$" hint={`Estimated ${money(r.plan.costAtBalanced)}`} />
                    <NumberField label="Total I resold for" value={w.actualResale ?? 0} onChange={(n) => onChange(w.lotId, { actualResale: n })} prefix="$" hint={`Expected ${money(r.lot.market.p50 * r.lot.quantity)} before fees`} />
                    {w.finalPricePaid && w.actualResale ? (
                      <p className="col-span-2 m-0 text-sm">
                        Real result:{' '}
                        <span className="num font-semibold" style={{ color: w.actualResale - w.finalPricePaid >= 0 ? 'var(--go)' : 'var(--stop)' }}>
                          {money(w.actualResale - w.finalPricePaid)} ({pct((w.actualResale - w.finalPricePaid) / w.finalPricePaid)})
                        </span>
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <button className="btn btn-sm flex-1" onClick={() => onLive(w.lotId)}>Live mode</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {orphan > 0 && <p className="mt-3 text-xs text-faint">{orphan} watched lot(s) belong to a catalog that is not open now.</p>}

      <div className="mt-6">
        <div className="label">Learned from your real sales</div>
        {calibration.length === 0 ? (
          <p className="m-0 text-sm text-mute">Mark lots as Won and fill in what you resold them for. After two sales in a category, the app adjusts its price estimates for that category.</p>
        ) : (
          <ul className="m-0 list-none space-y-1 p-0 text-sm">
            {calibration.map((c) => (
              <li key={c.category} className="flex justify-between gap-3">
                <span>{c.category}</span>
                <span className="num text-mute">
                  {c.samples < 2 ? `${c.samples} sale, needs 2` : `×${Math.min(1.5, Math.max(0.5, c.factor)).toFixed(2)} (${c.samples} sales)`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
