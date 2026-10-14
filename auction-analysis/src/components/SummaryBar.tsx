import type { Tier } from '../types';
import type { Summary } from '../lib/derive';
import { money, pct, TIER_COLOR, TIERS } from '../lib/pricing';

export default function SummaryBar({
  summary,
  tierCounts,
  tier,
  onTier,
}: {
  summary: Summary;
  tierCounts: Record<Tier, number>;
  tier: Tier | 'ALL';
  onTier: (t: Tier | 'ALL') => void;
}) {
  const kpis: { label: string; value: string; tone?: string; sub?: string }[] = [
    { label: 'Total Lots', value: String(summary.totalLots) },
    { label: 'Market Resale Value', value: money(summary.marketValue), sub: 'median × units, all lots' },
    { label: 'Est. Net Profit', value: money(summary.netProfit), tone: 'var(--go)', sub: `${summary.viable} lots, at Balanced bid` },
    { label: 'Avg Projected ROI', value: pct(summary.avgRoi), tone: 'var(--cyan)' },
    { label: 'Strong Buys', value: String(summary.strongBuys), tone: 'var(--go)' },
  ];
  return (
    <section aria-label="Catalog summary" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k, i) => (
          <div key={k.label} className={`kpi ${i === 1 ? 'col-span-2 md:col-span-1' : ''}`}>
            <div className="label" style={{ marginBottom: 2 }}>{k.label}</div>
            <div className="num truncate text-2xl font-bold" style={{ color: k.tone }}>{k.value}</div>
            {k.sub && <div className="truncate text-xs text-faint">{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by tier">
        <button className="chip !min-h-9 cursor-pointer" aria-pressed={tier === 'ALL'} onClick={() => onTier('ALL')} style={tier === 'ALL' ? { color: 'var(--text)', borderColor: 'var(--text)' } : undefined}>
          All <span className="num">{summary.totalLots}</span>
        </button>
        {TIERS.map((t) => (
          <button
            key={t}
            className="chip !min-h-9 cursor-pointer"
            aria-pressed={tier === t}
            onClick={() => onTier(tier === t ? 'ALL' : t)}
            style={{ color: TIER_COLOR[t], borderColor: tier === t ? TIER_COLOR[t] : undefined, background: tier === t ? `color-mix(in srgb, ${TIER_COLOR[t]} 14%, transparent)` : undefined }}
          >
            {t} <span className="num">{tierCounts[t]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
