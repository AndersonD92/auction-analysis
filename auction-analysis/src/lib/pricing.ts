import type { Condition, HouseProfile, Lot, SellSpeed, Tier } from '../types';

/** Taxas do canal de venda. */
export interface SaleChannel {
  id: string;
  name: string;
  feePct: number;
  fixedFee: number;
  /** Frete de saída médio pago pelo vendedor. */
  outboundShipping: number;
}

export const CHANNELS: SaleChannel[] = [
  { id: 'ebay', name: 'eBay', feePct: 0.1325, fixedFee: 0.4, outboundShipping: 0 },
  { id: 'ebay-ship', name: 'eBay + free shipping', feePct: 0.1325, fixedFee: 0.4, outboundShipping: 18 },
  { id: 'local', name: 'Local / Marketplace (cash)', feePct: 0, fixedFee: 0, outboundShipping: 0 },
  { id: 'amazon', name: 'Amazon', feePct: 0.15, fixedFee: 0.99, outboundShipping: 0 },
];

/** Fração dos itens que chega morto/inservível, por condição. */
export const DOA_RATE: Record<Condition, number> = {
  'Brand New': 0.01,
  'Open Box': 0.04,
  'Used - Tested': 0.07,
  'Used - Untested / As-Is': 0.22,
  'For Parts / Repair': 0.4,
};

/**
 * Velocidade de saída. O manual define Fast < 7 dias, Medium 7–21 e Slow > 30, e deixa
 * 21–30 sem classe: aqui esse intervalo cai em Medium.
 */
export function sellSpeedFromDays(days: number): SellSpeed {
  if (days < 7) return 'Fast';
  if (days <= 30) return 'Medium';
  return 'Slow';
}

/** Facilidade de transporte de 0 a 1, a partir do peso e de restrições de envio. */
export function transportEase(weightLb: number, shippingRestriction?: string): number {
  let ease: number;
  if (weightLb <= 15) ease = 1;
  else if (weightLb <= 40) ease = 0.8;
  else if (weightLb <= 100) ease = 0.6;
  else if (weightLb <= 250) ease = 0.4;
  else if (weightLb <= 600) ease = 0.2;
  else ease = 0.05;
  if (shippingRestriction) ease = Math.max(0, ease - 0.25);
  return ease;
}

export function effectiveLogistics(lot: Lot, avgShipping: number): number {
  return lot.logistics ?? avgShipping;
}

export interface CostInputs {
  bid: number;
  house: HouseProfile;
  logistics: number;
  refurb: number;
  payWithCash: boolean;
  resaleCertificate: boolean;
  storageDays?: number;
}

export interface CostBreakdown {
  hammer: number;
  premium: number;
  fees: number;
  tax: number;
  cardFee: number;
  logistics: number;
  refurb: number;
  storage: number;
  total: number;
}

/** Custo Total de Aquisição (TAC). */
export function computeCost(i: CostInputs): CostBreakdown {
  const bpRate = i.house.buyersPremium - (i.payWithCash ? i.house.cashDiscount : 0);
  const premium = i.bid * bpRate;
  const fees = i.house.perLotFee + i.house.docFee;
  const taxable = i.bid + premium + fees;
  const tax = i.resaleCertificate ? 0 : taxable * i.house.salesTax;
  const cardFee = i.payWithCash ? 0 : (taxable + tax) * i.house.cardFee;
  const storage = (i.storageDays ?? 0) * i.house.storagePerDay;
  const total = taxable + tax + cardFee + i.logistics + i.refurb + storage;
  return {
    hammer: i.bid,
    premium,
    fees,
    tax,
    cardFee,
    logistics: i.logistics,
    refurb: i.refurb,
    storage,
    total,
  };
}

/** Receita líquida esperada, já descontando taxas do canal e o risco de item morto. */
export function netProceeds(
  salePrice: number,
  qty: number,
  channel: SaleChannel,
  condition: Condition,
  salvageValue: number,
): number {
  const perUnit = salePrice * (1 - channel.feePct) - channel.fixedFee - channel.outboundShipping;
  const doa = DOA_RATE[condition];
  return qty * (perUnit * (1 - doa) + salvageValue * doa);
}

/**
 * Inverte a fórmula de custo: qual lance produz exatamente a margem alvo.
 * margem = (receita - custo) / custo
 */
export function solveBidForMargin(
  targetMargin: number,
  revenue: number,
  base: Omit<CostInputs, 'bid'>,
): number {
  const targetTotal = revenue / (1 + targetMargin);
  const bpRate = base.house.buyersPremium - (base.payWithCash ? base.house.cashDiscount : 0);
  const taxRate = base.resaleCertificate ? 0 : base.house.salesTax;
  const cardRate = base.payWithCash ? 0 : base.house.cardFee;
  const storage = (base.storageDays ?? 0) * base.house.storagePerDay;

  const multiplier = (1 + taxRate) * (1 + cardRate);
  const fixedAfter = base.logistics + base.refurb + storage;
  const fees = base.house.perLotFee + base.house.docFee;

  const taxableTarget = (targetTotal - fixedAfter) / multiplier;
  const bid = (taxableTarget - fees) / (1 + bpRate);
  return Math.max(0, bid);
}

/** Arredonda para baixo até o incremento válido da casa de leilão. */
export function roundToIncrement(value: number, house: HouseProfile): number {
  if (value <= 0) return 0;
  const rule = house.increments.find((r) => value < r.upTo) ?? house.increments[house.increments.length - 1];
  return Math.floor(value / rule.step) * rule.step;
}

export function nextIncrement(value: number, house: HouseProfile): number {
  const rule = house.increments.find((r) => value < r.upTo) ?? house.increments[house.increments.length - 1];
  return rule.step;
}

export interface BidPlan {
  conservative: number;
  balanced: number;
  max: number;
  breakEven: number;
  revenue: number;
  /** Custo e resultado no lance atual do leilão. */
  cost: CostBreakdown;
  profit: number;
  roi: number;
  roiAnnual: number;
  /** Custo e resultado se você arrematar no lance sugerido (Balanced). */
  costAtBalanced: number;
  /** Premium + taxas + imposto + cartão pagos se arrematar no lance Balanced. */
  feesAtBalanced: number;
  profitAtBalanced: number;
  roiAtBalanced: number;
  /** Há um lance Balanced que dá lucro positivo. */
  viable: boolean;
  logistics: number;
  score: number;
  tier: Tier;
  perUnitBreakEvenSales: number;
}

export interface PlanOptions {
  channel: SaleChannel;
  payWithCash: boolean;
  resaleCertificate: boolean;
  /** Fator vindo do histórico real de vendas. 1 = sem ajuste. */
  calibration: number;
  /** Quantos lotes idênticos existem no mesmo evento. */
  duplicates: number;
  /** Frete médio das configurações globais, usado quando o lote não traz frete. */
  avgShipping: number;
  /** Preço usado como referência de venda; padrão p50 calibrado. */
  salePriceOverride?: number;
  bidOverride?: number;
  /** Sobrescritas usadas pela calculadora interativa. */
  logisticsOverride?: number;
  refurbOverride?: number;
}

export function buildPlan(lot: Lot, house: HouseProfile, o: PlanOptions): BidPlan {
  const saturation = Math.min(0.25, Math.max(0, o.duplicates - 1) * 0.06);
  const salePrice = (o.salePriceOverride ?? lot.market.p50 * o.calibration) * (1 - saturation);
  const logistics = o.logisticsOverride ?? effectiveLogistics(lot, o.avgShipping);
  const refurb = o.refurbOverride ?? lot.refurbCost;

  const revenue = netProceeds(salePrice, lot.quantity, o.channel, lot.condition, lot.salvageValue);
  const base = {
    house,
    logistics,
    refurb,
    payWithCash: o.payWithCash,
    resaleCertificate: o.resaleCertificate,
  };

  const conservative = roundToIncrement(solveBidForMargin(0.4, revenue, base), house);
  const balanced = roundToIncrement(solveBidForMargin(0.27, revenue, base), house);
  const max = roundToIncrement(solveBidForMargin(0.15, revenue, base), house);
  const breakEven = roundToIncrement(solveBidForMargin(0, revenue, base), house);

  const bid = o.bidOverride ?? Math.max(lot.currentBid, 0);
  const cost = computeCost({ ...base, bid });
  const profit = revenue - cost.total;
  const roi = cost.total > 0 ? profit / cost.total : 0;
  const holdDays = Math.max(7, lot.market.daysToSell + house.pickupWindowDays);
  // Anualização simples: capital de giro não se recompõe sem limite, então juros compostos enganam.
  const roiAnnual = (roi * 365) / holdDays;

  const balancedCost = computeCost({ ...base, bid: balanced });
  const costAtBalanced = balancedCost.total;
  const feesAtBalanced = balancedCost.premium + balancedCost.fees + balancedCost.tax + balancedCost.cardFee;
  const profitAtBalanced = revenue - costAtBalanced;
  const roiAtBalanced = costAtBalanced > 0 ? profitAtBalanced / costAtBalanced : 0;

  const score = opportunityScore(lot, roi, o.duplicates);
  const perUnitNet = netProceeds(salePrice, 1, o.channel, lot.condition, lot.salvageValue);

  return {
    conservative,
    balanced,
    max,
    breakEven,
    revenue,
    cost,
    profit,
    roi,
    roiAnnual,
    costAtBalanced,
    feesAtBalanced,
    profitAtBalanced,
    roiAtBalanced,
    viable: balanced > 0 && profitAtBalanced > 0,
    logistics,
    score,
    tier: tierFor(score),
    perUnitBreakEvenSales: perUnitNet > 0 ? Math.ceil(cost.total / perUnitNet) : lot.quantity,
  };
}

const SPEED_WEIGHT: Record<SellSpeed, number> = { Fast: 1, Medium: 0.6, Slow: 0.2 };

const CONDITION_WEIGHT: Record<Condition, number> = {
  'Brand New': 1,
  'Open Box': 0.9,
  'Used - Tested': 0.78,
  'Used - Untested / As-Is': 0.45,
  'For Parts / Repair': 0.2,
};

/**
 * Opportunity Score de 0 a 100, com os pesos do manual:
 * margem 40% + velocidade de venda 30% + condição 20% + facilidade de transporte 10%.
 * Duas penalidades extras: lotes repetidos no mesmo evento e baixa confiança nos comparáveis.
 */
export function opportunityScore(lot: Lot, roi: number, duplicates: number): number {
  const margin = clamp01(roi / 1.2) * 40;
  const liquidity = SPEED_WEIGHT[lot.market.sellSpeed] * 30;
  const condition = CONDITION_WEIGHT[lot.condition] * 20;
  const transport = transportEase(lot.weightLb, lot.shippingRestriction) * 10;
  const duplicatePenalty = Math.max(0, duplicates - 1) * 5;
  const confidencePenalty = Math.max(0, 0.5 - lot.market.confidence) * 20;
  return Math.round(
    clamp(margin + liquidity + condition + transport - duplicatePenalty - confidencePenalty, 0, 100),
  );
}

export function tierFor(score: number): Tier {
  if (score >= 80) return 'STRONG BUY';
  if (score >= 65) return 'GOOD FLIP';
  if (score >= 50) return 'MODERATE';
  return 'HIGH RISK / AVOID';
}

export const TIERS: Tier[] = ['STRONG BUY', 'GOOD FLIP', 'MODERATE', 'HIGH RISK / AVOID'];

/** Esmeralda, ciano, âmbar e vermelho, como no manual. */
export const TIER_COLOR: Record<Tier, string> = {
  'STRONG BUY': 'var(--go)',
  'GOOD FLIP': 'var(--cyan)',
  MODERATE: 'var(--amber)',
  'HIGH RISK / AVOID': 'var(--stop)',
};

/** O Conservative Bid é o indicado para itens que exigem teste ou têm risco de peças faltantes. */
export function conservativeRecommended(lot: Lot): boolean {
  if (lot.condition === 'Used - Untested / As-Is' || lot.condition === 'For Parts / Repair') return true;
  return lot.risks.some((r) => /missing|no (power|psu|cable|rails|battery)|untested|calibrat|without/i.test(r));
}

export function isCriticalCondition(lot: Lot): boolean {
  return lot.condition === 'Used - Untested / As-Is' || lot.condition === 'For Parts / Repair';
}

/**
 * Alocação de orçamento (mochila 0/1 com DP).
 * Retorna os lotes que maximizam lucro esperado dentro do capital disponível.
 */
export function allocateBudget(
  items: { id: string; cost: number; profit: number }[],
  budget: number,
): { picked: string[]; spend: number; profit: number } {
  const unit = 5;
  const cap = Math.max(0, Math.floor(budget / unit));
  const rows = items.filter((i) => i.cost > 0 && i.profit > 0);
  const table: number[][] = Array.from({ length: rows.length + 1 }, () => new Array(cap + 1).fill(0));

  for (let i = 1; i <= rows.length; i++) {
    const w = Math.ceil(rows[i - 1].cost / unit);
    const v = rows[i - 1].profit;
    for (let c = 0; c <= cap; c++) {
      table[i][c] = table[i - 1][c];
      if (w <= c) table[i][c] = Math.max(table[i][c], table[i - 1][c - w] + v);
    }
  }

  const picked: string[] = [];
  let c = cap;
  for (let i = rows.length; i > 0; i--) {
    if (table[i][c] !== table[i - 1][c]) {
      picked.push(rows[i - 1].id);
      c -= Math.ceil(rows[i - 1].cost / unit);
    }
  }
  const chosen = rows.filter((r) => picked.includes(r.id));
  return {
    picked,
    spend: chosen.reduce((s, r) => s + r.cost, 0),
    profit: chosen.reduce((s, r) => s + r.profit, 0),
  };
}

/**
 * Probabilidade estimada de vencer o lote a um dado preço.
 * Heurística até existir histórico real: assume que o martelo fecha perto de 40% do
 * valor de mercado TOTAL do lote (p50 por peça × quantidade), nunca abaixo do lance atual.
 */
export function winProbability(bid: number, lot: Lot): number {
  const totalMarket = lot.market.p50 * lot.quantity;
  const expectedHammer = Math.max(lot.currentBid * 1.1, totalMarket * 0.4);
  const spread = Math.max(expectedHammer * 0.3, 20);
  return clamp01(1 / (1 + Math.exp(-(bid - expectedHammer) / spread)));
}

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const moneyPrecise = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/** Percentual com teto de exibição, para números anualizados que perdem sentido acima de 999%. */
export const pctCap = (n: number, cap = 9.99) =>
  n > cap ? `${cap * 100}%+` : n < -cap ? `-${cap * 100}%` : pct(n);

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function clamp01(n: number) {
  return clamp(n, 0, 1);
}
