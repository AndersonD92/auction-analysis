import type { GlobalDefaults, HouseProfile, Lot, CalibrationRecord } from '../types';
import { allHouses, houseFor } from './houses';
import { buildPlan, CHANNELS, conservativeRecommended } from './pricing';
import type { BidPlan, SaleChannel } from './pricing';
import { calibrationFor } from './store';

export interface Prefs {
  channelId: string;
  payWithCash: boolean;
  resaleCertificate: boolean;
}

export const DEFAULT_PREFS: Prefs = { channelId: 'ebay', payWithCash: false, resaleCertificate: false };

export function channelOf(id: string): SaleChannel {
  return CHANNELS.find((c) => c.id === id) ?? CHANNELS[0];
}

export interface Row {
  lot: Lot;
  plan: BidPlan;
  house: HouseProfile;
  duplicates: number;
}

/** Calcula o plano de lance de todos os lotes de uma vez. */
export function computeRows(
  lots: Lot[],
  globals: GlobalDefaults,
  customHouses: HouseProfile[],
  prefs: Prefs,
  calibration: CalibrationRecord[],
): Row[] {
  const houses = allHouses(globals, customHouses);
  const counts = new Map<string, number>();
  for (const l of lots) {
    const k = `${l.make}|${l.model}`.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return lots.map((lot) => {
    const house = houseFor(houses, lot.houseId);
    const duplicates = counts.get(`${lot.make}|${lot.model}`.toLowerCase()) ?? 1;
    const plan = buildPlan(lot, house, {
      channel: channelOf(prefs.channelId),
      payWithCash: prefs.payWithCash,
      resaleCertificate: prefs.resaleCertificate,
      calibration: calibrationFor(calibration, lot.category),
      duplicates,
      avgShipping: globals.avgShipping,
    });
    return { lot, plan, house, duplicates };
  });
}

export interface Summary {
  totalLots: number;
  marketValue: number;
  netProfit: number;
  avgRoi: number;
  strongBuys: number;
  viable: number;
}

export function summarize(rows: Row[]): Summary {
  const viable = rows.filter((r) => r.plan.viable);
  const netProfit = viable.reduce((s, r) => s + r.plan.profitAtBalanced, 0);
  const avgRoi = viable.length ? viable.reduce((s, r) => s + r.plan.roiAtBalanced, 0) / viable.length : 0;
  return {
    totalLots: rows.length,
    marketValue: rows.reduce((s, r) => s + r.lot.market.p50 * r.lot.quantity, 0),
    netProfit,
    avgRoi,
    strongBuys: rows.filter((r) => r.plan.tier === 'STRONG BUY').length,
    viable: viable.length,
  };
}

/** Lance a copiar: o Conservative para itens críticos, senão o Balanced. */
export function suggestedBid(r: Row): { value: number; label: 'Conservative' | 'Balanced' } {
  return conservativeRecommended(r.lot)
    ? { value: r.plan.conservative, label: 'Conservative' }
    : { value: r.plan.balanced, label: 'Balanced' };
}
