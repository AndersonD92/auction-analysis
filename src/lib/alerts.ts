import type { WatchEntry } from '../types';
import type { Row } from './derive';
import { isCriticalCondition, money } from './pricing';

export type AlertKind = 'danger' | 'warn' | 'info' | 'good';

export interface AppAlert {
  id: string;
  kind: AlertKind;
  lotId: string;
  title: string;
  detail: string;
}

/**
 * Alertas calculados a partir do catálogo e da watchlist. Não dependem de servidor:
 * quanto mais você atualiza o lance atual dos lotes, mais úteis ficam.
 */
export function buildAlerts(rows: Row[], watch: WatchEntry[], now = Date.now()): AppAlert[] {
  const out: AppAlert[] = [];
  const byId = new Map(rows.map((r) => [r.lot.id, r]));

  for (const w of watch) {
    const r = byId.get(w.lotId);
    if (!r || w.status === 'Won' || w.status === 'Lost') continue;
    const { lot, plan } = r;
    const tag = `Lot ${lot.lotNumber}`;

    if (lot.currentBid > plan.max) {
      out.push({
        id: `over-${lot.id}`,
        kind: 'danger',
        lotId: lot.id,
        title: `${tag}: bid is above your ceiling`,
        detail: `Current bid ${money(lot.currentBid)} is over the max bid of ${money(plan.max)}. Stop here.`,
      });
    } else if (plan.max > 0 && lot.currentBid >= plan.max * 0.9) {
      out.push({
        id: `near-${lot.id}`,
        kind: 'warn',
        lotId: lot.id,
        title: `${tag}: close to your ceiling`,
        detail: `Current bid ${money(lot.currentBid)} is within 10% of the max bid of ${money(plan.max)}.`,
      });
    }
    if (w.myMaxBid > 0 && w.myMaxBid > plan.max) {
      out.push({
        id: `mymax-${lot.id}`,
        kind: 'danger',
        lotId: lot.id,
        title: `${tag}: your max bid is too high`,
        detail: `You set ${money(w.myMaxBid)}, above the ${money(plan.max)} that still leaves a 15% margin.`,
      });
    }
    if (lot.closesAt) {
      const ms = Date.parse(lot.closesAt) - now;
      if (ms > 0 && ms < 24 * 3600_000) {
        const h = Math.max(1, Math.round(ms / 3600_000));
        out.push({
          id: `closing-${lot.id}`,
          kind: 'warn',
          lotId: lot.id,
          title: `${tag}: closes in about ${h} h`,
          detail: `${lot.title.slice(0, 80)}`,
        });
      }
    }
  }

  const watched = new Set(watch.map((w) => w.lotId));
  for (const r of rows) {
    if (r.plan.tier === 'STRONG BUY' && !watched.has(r.lot.id)) {
      out.push({
        id: `strong-${r.lot.id}`,
        kind: 'good',
        lotId: r.lot.id,
        title: `Lot ${r.lot.lotNumber}: strong buy not on your watchlist`,
        detail: `Score ${r.plan.score}, balanced bid ${money(r.plan.balanced)}.`,
      });
    }
    if (r.duplicates > 1 && !watched.has(r.lot.id)) {
      // Só um aviso por grupo de lotes repetidos.
      const first = rows.find((x) => x.lot.make === r.lot.make && x.lot.model === r.lot.model);
      if (first === r) {
        out.push({
          id: `dup-${r.lot.id}`,
          kind: 'info',
          lotId: r.lot.id,
          title: `${r.duplicates} lots of ${r.lot.make} ${r.lot.model}`,
          detail: 'The same model appears several times in this event. Buy one, not all of them, or you will compete with yourself.',
        });
      }
    }
  }

  for (const r of rows) {
    const { lot, plan } = r;
    const isWatched = watched.has(lot.id);
    if (plan.roi > 1.5 && plan.profit > 0) {
      out.push({
        id: `roi-${lot.id}`,
        kind: 'good',
        lotId: lot.id,
        title: `Lot ${lot.lotNumber}: ROI above 150%`,
        detail: `At the current bid of ${money(lot.currentBid)} the projected return is ${Math.round(plan.roi * 100)}%. ${lot.title.slice(0, 60)}`,
      });
    }
    if (lot.market.sellSpeed === 'Fast' && plan.viable && plan.tier !== 'HIGH RISK / AVOID') {
      out.push({
        id: `fast-${lot.id}`,
        kind: 'good',
        lotId: lot.id,
        title: `Lot ${lot.lotNumber}: fast seller`,
        detail: `Expected to resell in about ${Math.round(lot.market.daysToSell)} days. ${lot.title.slice(0, 60)}`,
      });
    }
    if (isCriticalCondition(lot)) {
      out.push({
        id: `risk-${lot.id}`,
        kind: isWatched ? 'warn' : 'info',
        lotId: lot.id,
        title: `Lot ${lot.lotNumber}: ${lot.condition}`,
        detail: 'Not tested or sold for parts. Bid only the Conservative amount and expect some units to be dead.',
      });
    }
  }

  const order: Record<AlertKind, number> = { danger: 0, warn: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}
