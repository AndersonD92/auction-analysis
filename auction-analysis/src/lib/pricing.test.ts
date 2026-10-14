import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBALS, makeDefaultHouse, standardIncrements } from './houses';
import {
  allocateBudget,
  buildPlan,
  CHANNELS,
  computeCost,
  netProceeds,
  opportunityScore,
  pctCap,
  roundToIncrement,
  sellSpeedFromDays,
  solveBidForMargin,
  tierFor,
  winProbability,
} from './pricing';
import { buildCalibration, calibrationFor } from './store';
import { DEMO_CATALOGS } from './demoData';
import type { Lot, WatchEntry } from '../types';

const house = makeDefaultHouse(DEFAULT_GLOBALS);
const ebay = CHANNELS[0];
const lot = DEMO_CATALOGS.find((c) => c.slug === 'enterprise-it')!.lots.find((l) => l.lotNumber === '141')!;
const opts = {
  channel: ebay,
  payWithCash: false,
  resaleCertificate: false,
  calibration: 1,
  duplicates: 1,
  avgShipping: DEFAULT_GLOBALS.avgShipping,
};

describe('computeCost (TAC)', () => {
  it('soma lance, premium, imposto, cartão e logística', () => {
    const c = computeCost({ bid: 100, house, logistics: 25, refurb: 10, payWithCash: false, resaleCertificate: false });
    expect(c.premium).toBeCloseTo(15, 5);
    expect(c.tax).toBeCloseTo(115 * 0.0825, 5);
    expect(c.cardFee).toBeCloseTo((115 + 115 * 0.0825) * 0.03, 5);
    expect(c.total).toBeCloseTo(115 + c.tax + c.cardFee + 35, 5);
  });
  it('certificado de revenda zera o imposto e dinheiro zera a taxa do cartão', () => {
    const c = computeCost({ bid: 100, house, logistics: 0, refurb: 0, payWithCash: true, resaleCertificate: true });
    expect(c.tax).toBe(0);
    expect(c.cardFee).toBe(0);
  });
});

describe('lance inverso', () => {
  it('o lance resolvido produz exatamente a margem pedida', () => {
    const revenue = 2000;
    const base = { house, logistics: 25, refurb: 0, payWithCash: false, resaleCertificate: false };
    for (const m of [0.4, 0.27, 0.15, 0]) {
      const bid = solveBidForMargin(m, revenue, base);
      const cost = computeCost({ ...base, bid }).total;
      expect((revenue - cost) / cost).toBeCloseTo(m, 6);
    }
  });
  it('arredonda para baixo no incremento da casa', () => {
    expect(roundToIncrement(47, house)).toBe(45);
    expect(roundToIncrement(263, house)).toBe(260);
    expect(roundToIncrement(740, house)).toBe(725);
    expect(roundToIncrement(0, house)).toBe(0);
    expect(standardIncrements.length).toBeGreaterThan(0);
  });
});

describe('buildPlan', () => {
  it('lances ficam em ordem e o Balanced é lucrativo', () => {
    const p = buildPlan(lot, house, opts);
    expect(p.conservative).toBeLessThanOrEqual(p.balanced);
    expect(p.balanced).toBeLessThanOrEqual(p.max);
    expect(p.max).toBeLessThanOrEqual(p.breakEven);
    expect(p.viable).toBe(true);
    expect(p.profitAtBalanced).toBeGreaterThan(0);
  });
  it('lotes repetidos derrubam o preço de venda esperado', () => {
    const one = buildPlan(lot, house, opts);
    const three = buildPlan(lot, house, { ...opts, duplicates: 3 });
    expect(three.revenue).toBeLessThan(one.revenue);
  });
  it('calibração acima de 1 aumenta a receita', () => {
    expect(buildPlan(lot, house, { ...opts, calibration: 1.2 }).revenue).toBeGreaterThan(buildPlan(lot, house, opts).revenue);
  });
  it('usa o frete médio global quando o lote não informa frete', () => {
    const noShip: Lot = { ...lot, logistics: null };
    expect(buildPlan(noShip, house, { ...opts, avgShipping: 100 }).logistics).toBe(100);
    expect(buildPlan(noShip, house, { ...opts, avgShipping: 5 }).logistics).toBe(5);
  });
  it('ROI anualizado simples não explode', () => {
    const p = buildPlan(lot, house, opts);
    expect(Number.isFinite(p.roiAnnual)).toBe(true);
    expect(p.roiAnnual).toBeLessThan(100);
  });
});

describe('netProceeds', () => {
  it('item em peças vale menos que item novo por causa da taxa de item morto', () => {
    const a = netProceeds(100, 1, ebay, 'Brand New', 0);
    const b = netProceeds(100, 1, ebay, 'For Parts / Repair', 0);
    expect(b).toBeLessThan(a);
  });
  it('multiplica pela quantidade', () => {
    expect(netProceeds(100, 10, ebay, 'Brand New', 0)).toBeCloseTo(10 * netProceeds(100, 1, ebay, 'Brand New', 0), 6);
  });
});

describe('score e faixas do manual', () => {
  it('faixas 80/65/50', () => {
    expect(tierFor(80)).toBe('STRONG BUY');
    expect(tierFor(79)).toBe('GOOD FLIP');
    expect(tierFor(65)).toBe('GOOD FLIP');
    expect(tierFor(64)).toBe('MODERATE');
    expect(tierFor(50)).toBe('MODERATE');
    expect(tierFor(49)).toBe('HIGH RISK / AVOID');
  });
  it('velocidade: Fast < 7, Medium até 30, Slow acima', () => {
    expect(sellSpeedFromDays(6)).toBe('Fast');
    expect(sellSpeedFromDays(7)).toBe('Medium');
    expect(sellSpeedFromDays(30)).toBe('Medium');
    expect(sellSpeedFromDays(31)).toBe('Slow');
  });
  it('o score fica entre 0 e 100 e duplicatas o reduzem', () => {
    const s1 = opportunityScore(lot, 0.8, 1);
    const s2 = opportunityScore(lot, 0.8, 4);
    expect(s1).toBeGreaterThanOrEqual(0);
    expect(s1).toBeLessThanOrEqual(100);
    expect(s2).toBeLessThan(s1);
  });
  it('todos os lotes demo ficam com score válido e tiers variados', () => {
    const tiers = new Set<string>();
    for (const c of DEMO_CATALOGS) {
      for (const l of c.lots) {
        const p = buildPlan(l, house, opts);
        expect(p.score).toBeGreaterThanOrEqual(0);
        expect(p.score).toBeLessThanOrEqual(100);
        tiers.add(p.tier);
      }
    }
    expect(tiers.size).toBeGreaterThanOrEqual(3);
  });
});

describe('pctCap', () => {
  it('limita números absurdos', () => {
    expect(pctCap(50)).toBe('999%+');
    expect(pctCap(0.25)).toBe('25%');
  });
});

describe('allocateBudget', () => {
  it('escolhe a combinação de maior lucro dentro do orçamento', () => {
    const r = allocateBudget(
      [
        { id: 'a', cost: 600, profit: 300 },
        { id: 'b', cost: 400, profit: 250 },
        { id: 'c', cost: 500, profit: 260 },
      ],
      1000,
    );
    expect(r.spend).toBeLessThanOrEqual(1000);
    expect(r.profit).toBe(550);
    expect(r.picked.sort()).toEqual(['a', 'b']);
  });
  it('ignora itens sem lucro e aceita orçamento zero', () => {
    expect(allocateBudget([{ id: 'x', cost: 10, profit: -1 }], 100).picked).toEqual([]);
    expect(allocateBudget([{ id: 'x', cost: 10, profit: 5 }], 0).picked).toEqual([]);
  });
});

describe('winProbability', () => {
  it('cresce com o lance e considera a quantidade do lote', () => {
    expect(winProbability(800, lot)).toBeGreaterThan(winProbability(300, lot));
    const single: Lot = { ...lot, quantity: 1 };
    expect(winProbability(300, single)).toBeGreaterThan(winProbability(300, lot));
  });
});

describe('calibração por histórico', () => {
  const lots = [lot, { ...lot, id: 'other', lotNumber: '999' }];
  const entry = (id: string, actual: number): WatchEntry => ({ lotId: id, status: 'Won', myMaxBid: 0, actualResale: actual });
  it('precisa de 2 amostras e compara com o valor total do lote', () => {
    const total = lot.market.p50 * lot.quantity;
    const recs = buildCalibration([entry(lot.id, total * 0.8)], lots);
    expect(calibrationFor(recs, lot.category)).toBe(1);
    const two = buildCalibration([entry(lot.id, total * 0.8), entry('other', total * 0.8)], lots);
    expect(calibrationFor(two, lot.category)).toBeCloseTo(0.8, 6);
  });
  it('limita o fator entre 0.5 e 1.5', () => {
    const total = lot.market.p50 * lot.quantity;
    const recs = buildCalibration([entry(lot.id, total * 5), entry('other', total * 5)], lots);
    expect(calibrationFor(recs, lot.category)).toBe(1.5);
  });
});
