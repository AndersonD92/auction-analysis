import { ExternalLink, ShoppingBag } from 'lucide-react';
import type { Lot } from '../types';
import { money, pct } from '../lib/pricing';
import { safeExternalUrl } from '../utils/auctionLinks';
import { Modal, Stat } from './ui';

export function ebaySoldUrl(lot: Lot): string {
  const q = encodeURIComponent(`${lot.make} ${lot.model}`.replace(/Unknown/g, '').trim());
  return `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;
}

export function googleShoppingUrl(lot: Lot): string {
  const q = encodeURIComponent(`${lot.make} ${lot.model}`.replace(/Unknown/g, '').trim());
  return `https://www.google.com/search?tbm=shop&q=${q}`;
}

export default function MarketModal({ lot, calibration, onClose }: { lot: Lot; calibration: number; onClose: () => void }) {
  const m = lot.market;
  const span = Math.max(1, m.high - m.low);
  const at = (v: number) => `${Math.min(100, Math.max(0, ((v - m.low) / span) * 100))}%`;
  const lotUrl = safeExternalUrl(lot.directUrl);
  const top = Math.max(m.p50, m.localQuick, 1);
  return (
    <Modal title={`Market research · Lot ${lot.lotNumber}`} onClose={onClose} wide>
      <p className="m-0 mb-4 text-sm text-mute">
        {lot.make} {lot.model} · prices are per unit
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="eBay sold median" value={money(m.p50)} />
        <Stat label="Sold range" value={`${money(m.low)}–${money(m.high)}`} />
        <Stat label="Local / Marketplace" value={money(m.localQuick)} sub="cash, no shipping" />
        <Stat label="Confidence" value={pct(m.confidence)} tone={m.confidence < 0.6 ? 'var(--amber)' : undefined} />
      </div>

      <div className="mt-6">
        <div className="label">eBay sold vs local market</div>
        <div className="space-y-2">
          {[
            ['eBay sold (median)', m.p50, 'var(--cyan)'],
            ['Facebook Marketplace (quick cash)', m.localQuick, 'var(--go)'],
          ].map(([k, v, color]) => (
            <div key={k as string}>
              <div className="flex justify-between text-xs text-mute">
                <span>{k}</span>
                <span className="num text-ink">{money(v as number)}</span>
              </div>
              <div className="bar"><span style={{ width: `${((v as number) / top) * 100}%`, background: color as string }} /></div>
            </div>
          ))}
        </div>
        <p className="m-0 mt-1 text-xs text-faint">
          Local sale is about {pct(m.p50 > 0 ? m.localQuick / m.p50 : 0)} of the eBay price, with no fees or shipping.
        </p>
      </div>

      <div className="mt-6">
        <div className="label">Historical price range (low · median · high)</div>
        <div className="relative h-14">
          <div className="absolute left-0 right-0 top-6 h-2 rounded-full bg-bg" style={{ border: '1px solid var(--line)' }} />
          <div className="absolute top-6 h-2 rounded-full bg-cyan/40" style={{ left: at(m.p25), width: `calc(${at(m.p75)} - ${at(m.p25)})` }} />
          {([
            ['Low', m.low],
            ['P25', m.p25],
            ['P50', m.p50],
            ['P75', m.p75],
            ['High', m.high],
          ] as const).map(([k, v], i) => (
            <div key={k} className="absolute -translate-x-1/2 text-center" style={{ left: at(v), top: i % 2 ? 30 : 0 }}>
              <div className="num text-[0.7rem] text-mute">{k}</div>
              <div className="num text-xs font-semibold">{money(v)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Sell speed" value={m.sellSpeed} sub={`about ${Math.round(m.daysToSell)} days`} />
        <Stat label="History adjustment" value={calibration === 1 ? 'None yet' : `×${calibration.toFixed(2)}`} sub="from your real sales" />
      </div>

      <div className="mt-6">
        <div className="label">Comparable sales</div>
        {m.comps.length === 0 ? (
          <p className="m-0 rounded-xl border border-dashed border-line p-3 text-sm text-amber">
            No comparable sales were found. Treat this estimate with caution.
          </p>
        ) : (
          <ul className="m-0 list-none divide-y divide-line rounded-xl border border-line p-0">
            {m.comps.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="chip">{c.source}</span>
                <span className="num hidden text-xs text-faint sm:inline">{c.soldAt}</span>
                <span className="num font-semibold">{money(c.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lot.partOutValue ? (
        <p className="m-0 mt-4 rounded-xl border border-line bg-bg p-3 text-sm text-mute">
          Parted out, this lot could bring about <span className="num text-ink">{money(lot.partOutValue)}</span>, usually slower and more work.
        </p>
      ) : null}

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <a className="btn" href={ebaySoldUrl(lot)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} /> eBay · Sold & Completed
        </a>
        <a className="btn" href={googleShoppingUrl(lot)} target="_blank" rel="noopener noreferrer">
          <ShoppingBag size={15} /> Google Shopping
        </a>
        {lotUrl ? (
          <a className="btn btn-primary" href={lotUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> Lot on the auction
          </a>
        ) : (
          <button className="btn" disabled>No auction link</button>
        )}
      </div>
    </Modal>
  );
}
