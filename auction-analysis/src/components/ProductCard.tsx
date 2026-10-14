import { useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  LineChart,
  Package,
  ShieldCheck,
  Sparkles,
  Star,
  Weight,
} from 'lucide-react';
import type { Row } from '../lib/derive';
import { suggestedBid } from '../lib/derive';
import { conservativeRecommended, DOA_RATE, money, moneyPrecise, pct, pctCap, TIER_COLOR, winProbability } from '../lib/pricing';
import { safeExternalUrl } from '../utils/auctionLinks';
import { Stat, TierBadge } from './ui';

function CopyButton({ value, label }: { value: number; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
    } catch {
      /* clipboard bloqueado: o valor continua visível no cartão */
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <button className="btn btn-ghost btn-sm mt-1 w-full !min-h-8" onClick={copy} aria-label={`Copy ${label} bid ${value}`}>
      {done ? <Check size={14} className="text-go" /> : <Copy size={14} />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function ProductCard({
  row,
  watched,
  onToggleWatch,
  onCalc,
  onMarket,
}: {
  row: Row;
  watched: boolean;
  onToggleWatch: () => void;
  onCalc: () => void;
  onMarket: () => void;
}) {
  const { lot, plan, house, duplicates } = row;
  const [deep, setDeep] = useState(false);
  const url = safeExternalUrl(lot.directUrl);
  const tc = TIER_COLOR[plan.tier];
  const consRec = conservativeRecommended(lot);
  const sug = suggestedBid(row);
  const profitTone = plan.profitAtBalanced > 0 ? 'var(--go)' : 'var(--stop)';

  return (
    <article id={`lot-${lot.id}`} className="panel flex min-w-0 flex-col overflow-hidden" style={{ borderTop: `3px solid ${tc}` }} aria-label={`Lot ${lot.lotNumber}: ${lot.title}`}>
      <div className="relative aspect-[4/3] bg-bg">
        {lot.imageUrl ? (
          <img src={lot.imageUrl} alt={`${lot.make} ${lot.model}`} loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full items-center justify-center text-faint">
            <Package size={40} />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <TierBadge tier={plan.tier} score={plan.score} />
        </div>
        <button
          className="btn btn-icon btn-sm absolute right-3 top-3"
          style={{ background: 'rgb(11 18 32 / 0.85)', color: watched ? 'var(--amber)' : 'var(--text)' }}
          aria-pressed={watched}
          aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          onClick={onToggleWatch}
        >
          <Star size={18} fill={watched ? 'currentColor' : 'none'} />
        </button>
        <span className="chip num absolute bottom-3 left-3" style={{ background: 'rgb(11 18 32 / 0.85)' }}>
          LOT #{lot.lotNumber}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-wider text-cyan">
            {lot.make} · {lot.model}
          </p>
          <h3 className="m-0 mt-0.5 text-[0.95rem] font-semibold leading-snug">{lot.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip">{lot.condition}</span>
            <span className="chip">{lot.category}</span>
            {lot.quantity > 1 && <span className="chip num">×{lot.quantity} units</span>}
            <span className="chip">
              <Clock size={12} /> {lot.market.sellSpeed} · ~{Math.round(lot.market.daysToSell)}d
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Current bid" value={money(lot.currentBid)} />
          <Stat label="eBay sold avg" value={money(lot.market.p50)} sub={lot.quantity > 1 ? `${money(lot.market.p50 * lot.quantity)} lot` : 'per unit'} />
          <Stat label="Local market" value={money(lot.market.localQuick)} sub="cash, per unit" />
        </div>

        <div>
          <div className="label">Smart bids · {house.name}</div>
          <div className="ladder">
            <div className="ladder-cell" data-pick={consRec} style={{ ['--cc' as string]: 'var(--cyan)' }}>
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-mute">Conservative</div>
              <div className="num text-base font-semibold">{money(plan.conservative)}</div>
              <div className="text-[0.65rem] text-faint">40% margin</div>
              <CopyButton value={plan.conservative} label="Conservative" />
            </div>
            <div className="ladder-cell" data-pick={!consRec} style={{ ['--cc' as string]: 'var(--go)' }}>
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-mute">Balanced</div>
              <div className="num text-base font-semibold">{money(plan.balanced)}</div>
              <div className="text-[0.65rem] text-faint">27% margin</div>
              <CopyButton value={plan.balanced} label="Balanced" />
            </div>
            <div className="ladder-cell" style={{ borderColor: 'color-mix(in srgb, var(--amber) 55%, var(--line))' }}>
              <div className="flex items-center justify-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider text-amber">
                <ShieldCheck size={11} /> Max · ceiling
              </div>
              <div className="num text-base font-semibold">{money(plan.max)}</div>
              <div className="text-[0.65rem] text-faint">15% margin</div>
              <div className="mt-1 flex min-h-8 items-center justify-center text-[0.65rem] font-semibold text-amber">Never go above</div>
            </div>
          </div>
          {consRec && (
            <p className="m-0 mt-2 flex items-start gap-1.5 text-xs text-amber">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Untested or incomplete: the Conservative bid ({money(sug.value)}) is the one to use.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Profit @ Balanced" value={plan.viable ? money(plan.profitAtBalanced) : '—'} tone={plan.viable ? profitTone : 'var(--stop)'} />
          <Stat label="ROI @ Balanced" value={plan.viable ? pct(plan.roiAtBalanced) : '—'} tone={plan.viable ? profitTone : 'var(--stop)'} />
          <Stat label="Confidence" value={pct(lot.market.confidence)} tone={lot.market.confidence < 0.6 ? 'var(--amber)' : undefined} />
        </div>
        {!plan.viable && <p className="m-0 text-xs text-stop">No bid leaves a profit after fees, tax and freight for this lot.</p>}

        {lot.shippingRestriction && (
          <p className="m-0 flex items-start gap-1.5 text-xs text-amber">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {lot.shippingRestriction}
          </p>
        )}
        {duplicates > 1 && (
          <p className="m-0 text-xs text-amber">
            {duplicates} lots of this model in the event: expected resale price is reduced for saturation.
          </p>
        )}

        <div>
          <button className="btn btn-ghost btn-sm w-full justify-between" onClick={() => setDeep((v) => !v)} aria-expanded={deep}>
            <span className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-cyan" /> Deep Data
              {lot.risks.length > 0 && <span className="chip !border-stop/40 !text-stop">{lot.risks.length} risk{lot.risks.length > 1 ? 's' : ''}</span>}
            </span>
            <ChevronDown size={16} className="transition-transform" style={{ transform: deep ? 'rotate(180deg)' : undefined }} />
          </button>
          <div className="expand" data-open={deep}>
            <div aria-hidden={!deep}>
              <div className="mt-2 space-y-3 rounded-xl border border-line bg-bg p-3 text-sm">
                <div>
                  <div className="label">AI Investment Thesis</div>
                  <p className="m-0 text-mute">{lot.rationale || 'No thesis available for this lot.'}</p>
                </div>
                {lot.risks.length > 0 && (
                  <div>
                    <div className="label">Risk alerts</div>
                    <ul className="m-0 list-none space-y-1 p-0 text-mute">
                      {lot.risks.map((r) => (
                        <li key={r} className="flex gap-1.5">
                          <AlertTriangle size={13} className="mt-1 shrink-0 text-stop" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3">
                  <Stat label="Suggested freight" value={money(plan.logistics)} sub={lot.logistics === null ? 'global average' : 'estimated'} />
                  <Stat label="Fees & tax @ bid" value={moneyPrecise(plan.feesAtBalanced)} sub="premium, tax, card" />
                  <Stat label="Total cost @ bid" value={moneyPrecise(plan.costAtBalanced)} />
                  <Stat label="Net resale (est.)" value={money(plan.revenue)} sub="after channel fees & DOA" />
                  <Stat label="Break-even bid" value={money(plan.breakEven)} />
                  <Stat label="Units to sell to break even" value={`${plan.perUnitBreakEvenSales} of ${lot.quantity}`} />
                  <Stat label="Annualized ROI" value={pctCap(plan.roiAnnual)} sub="simple, not compounded" />
                  <Stat label="Dead-on-arrival risk" value={pct(DOA_RATE[lot.condition])} />
                  <Stat label="Win chance @ balanced" value={pct(winProbability(plan.balanced, lot))} sub="rough estimate" />
                  <Stat label="Weight" value={<span className="inline-flex items-center gap-1"><Weight size={14} />{lot.weightLb} lb</span>} />
                  {lot.partOutValue ? <Stat label="Parted-out value" value={money(lot.partOutValue)} /> : null}
                  <Stat label="Pickup window" value={`${house.pickupWindowDays} days`} sub={house.storagePerDay ? `${money(house.storagePerDay)}/day after` : undefined} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          {url ? (
            <a className="btn btn-primary col-span-2" href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} /> Visit Auction
            </a>
          ) : (
            <button className="btn col-span-2" disabled title="No link available for this lot">
              <ExternalLink size={16} /> No link
            </button>
          )}
          <button className="btn" onClick={onCalc}>
            <Calculator size={16} /> Calculator
          </button>
          <button className="btn" onClick={onMarket}>
            <LineChart size={16} /> Market
          </button>
        </div>
      </div>
    </article>
  );
}
