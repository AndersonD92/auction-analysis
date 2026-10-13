import { useMemo } from 'react';
import { Wallet } from 'lucide-react';
import type { Row } from '../lib/derive';
import { allocateBudget, money, pct } from '../lib/pricing';
import { NumberField } from './ui';

export default function BudgetPanel({
  rows,
  budget,
  onBudget,
  onWatchAll,
}: {
  rows: Row[];
  budget: number;
  onBudget: (n: number) => void;
  onWatchAll: (ids: string[]) => void;
}) {
  const result = useMemo(
    () =>
      allocateBudget(
        rows.filter((r) => r.plan.viable).map((r) => ({ id: r.lot.id, cost: r.plan.costAtBalanced, profit: r.plan.profitAtBalanced })),
        budget,
      ),
    [rows, budget],
  );
  const picked = result.picked.map((id) => rows.find((r) => r.lot.id === id)!).filter(Boolean);

  return (
    <section className="panel p-4" aria-label="Budget allocator">
      <div className="mb-3 flex items-center gap-2">
        <Wallet size={18} className="text-cyan" />
        <h2 className="display m-0 text-base font-bold">Budget allocator</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="min-w-0">
          <NumberField label="Cash available" value={budget} onChange={onBudget} prefix="$" step={100} />
          <p className="m-0 mt-2 text-xs text-faint">Picks the mix of lots with the most profit, assuming you win each at its Balanced bid.</p>
        </div>
        <div className="min-w-0">
          {picked.length === 0 ? (
            <p className="m-0 text-sm text-mute">{budget <= 0 ? 'Enter how much you can spend.' : 'No lot fits this budget with a profit.'}</p>
          ) : (
            <>
              <ul className="m-0 mb-3 list-none divide-y divide-line rounded-xl border border-line p-0">
                {picked.map((r) => (
                  <li key={r.lot.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate"><span className="num text-faint">#{r.lot.lotNumber}</span> {r.lot.title}</span>
                    <span className="num text-mute">{money(r.plan.balanced)}</span>
                    <span className="num font-semibold text-go">+{money(r.plan.profitAtBalanced)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-sm">
                  Spend <span className="num font-semibold">{money(result.spend)}</span> for about{' '}
                  <span className="num font-semibold text-go">{money(result.profit)}</span> profit ({pct(result.spend ? result.profit / result.spend : 0)} ROI).
                </p>
                <button className="btn btn-sm" onClick={() => onWatchAll(picked.map((r) => r.lot.id))}>Add all to watchlist</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
