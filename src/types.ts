export type Condition =
  | 'Brand New'
  | 'Open Box'
  | 'Used - Tested'
  | 'Used - Untested / As-Is'
  | 'For Parts / Repair';

export const CONDITIONS: Condition[] = [
  'Brand New',
  'Open Box',
  'Used - Tested',
  'Used - Untested / As-Is',
  'For Parts / Repair',
];

export type SellSpeed = 'Fast' | 'Medium' | 'Slow';

export type Tier = 'STRONG BUY' | 'GOOD FLIP' | 'MODERATE' | 'HIGH RISK / AVOID';

export interface BidIncrement {
  /** Aplica-se enquanto o lance for menor que este valor. */
  upTo: number;
  step: number;
}

export interface HouseProfile {
  id: string;
  name: string;
  /** 0.18 = 18% */
  buyersPremium: number;
  /** Desconto no premium quando o pagamento é em dinheiro/ACH. */
  cashDiscount: number;
  cardFee: number;
  salesTax: number;
  perLotFee: number;
  docFee: number;
  increments: BidIncrement[];
  pickupWindowDays: number;
  storagePerDay: number;
  notes: string;
}

export interface Comparable {
  title: string;
  price: number;
  soldAt: string;
  source: 'eBay' | 'Marketplace' | 'Reverb' | 'Google Shopping' | 'Other';
}

export interface MarketEstimate {
  /** Menor e maior preço vendido encontrados. */
  low: number;
  p25: number;
  p50: number;
  p75: number;
  high: number;
  /** Faixa para venda local rápida (Facebook Marketplace). */
  localQuick: number;
  /** 0–1: quão bem os comparáveis sustentam a estimativa. */
  confidence: number;
  comps: Comparable[];
  sellSpeed: SellSpeed;
  daysToSell: number;
}

export interface Lot {
  id: string;
  lotNumber: string;
  houseId: string;
  auctionName: string;
  /** Link do lote extraído da página do leiloeiro (preferido quando existe). */
  directUrl: string;
  /** URL do catálogo, usada pelo resolvedor de links quando directUrl falta. */
  catalogUrl?: string;
  /** Identificador do lote na plataforma, quando conhecido. */
  platformLotId?: string;
  imageUrl: string;
  title: string;
  make: string;
  model: string;
  category: string;
  condition: Condition;
  currentBid: number;
  /** Quantidade de peças dentro do lote (box lot / pallet). */
  quantity: number;
  weightLb: number;
  /** Frete/retirada estimado. null = usar o frete médio das configurações globais. */
  logistics: number | null;
  refurbCost: number;
  salvageValue: number;
  market: MarketEstimate;
  risks: string[];
  /** "AI Investment Thesis". */
  rationale: string;
  partOutValue?: number;
  shippingRestriction?: string;
  closesAt: string;
}

/** Item bruto extraído da página/arquivo, antes da análise por IA. */
export interface RawLot {
  lotNumber: string;
  title: string;
  currentBid: number;
  directUrl: string;
  imageUrl: string;
  description: string;
  condition?: string;
  platformLotId?: string;
}

export interface GlobalDefaults {
  /** 0.15 = 15% */
  buyersPremium: number;
  /** 0.0825 = 8.25% */
  salesTax: number;
  /** Frete médio estimado por lote, em dólares. */
  avgShipping: number;
}

export type WatchStatus = 'Monitoring' | 'Bid Placed' | 'Won' | 'Lost';

export interface WatchEntry {
  lotId: string;
  status: WatchStatus;
  myMaxBid: number;
  /** Total realmente pago pelo lote (martelo + taxas + imposto). */
  finalPricePaid?: number;
  /** Total realmente recebido na revenda do lote inteiro. */
  actualResale?: number;
  note?: string;
}

export interface CalibrationRecord {
  category: string;
  /** média de (revenda real / valor de mercado total estimado) */
  factor: number;
  samples: number;
}

/** Um catálogo aberto no app (escaneado ou de demonstração). */
export interface Catalog {
  id: string;
  name: string;
  catalogUrl: string;
  lots: Lot[];
  scannedAt: string;
}
