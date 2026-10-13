import type { BidIncrement, GlobalDefaults, HouseProfile } from '../types';

/** Valores iniciais do manual: premium 15%, imposto 8.25%, frete médio US$ 25. */
export const DEFAULT_GLOBALS: GlobalDefaults = {
  buyersPremium: 0.15,
  salesTax: 0.0825,
  avgShipping: 25,
};

export const standardIncrements: BidIncrement[] = [
  { upTo: 100, step: 5 },
  { upTo: 500, step: 10 },
  { upTo: 1000, step: 25 },
  { upTo: 5000, step: 50 },
  { upTo: Infinity, step: 100 },
];

export const DEFAULT_HOUSE_ID = 'default';

/** Perfil usado por todo catálogo sem leiloeiro conhecido. Segue as configurações globais. */
export function makeDefaultHouse(g: GlobalDefaults): HouseProfile {
  return {
    id: DEFAULT_HOUSE_ID,
    name: 'Default (global settings)',
    buyersPremium: g.buyersPremium,
    cashDiscount: 0,
    cardFee: 0.03,
    salesTax: g.salesTax,
    perLotFee: 0,
    docFee: 0,
    increments: standardIncrements,
    pickupWindowDays: 5,
    storagePerDay: 0,
    notes: 'Used for any auction without its own profile. Edit it in Global Settings.',
  };
}

/** Perfis editáveis de casas de leilão conhecidas. Confira sempre o termo de cada evento. */
export const DEFAULT_HOUSES: HouseProfile[] = [
  {
    id: '4less',
    name: '4Less Auctions',
    buyersPremium: 0.18,
    cashDiscount: 0.03,
    cardFee: 0.03,
    salesTax: 0.0775,
    perLotFee: 3,
    docFee: 0,
    increments: standardIncrements,
    pickupWindowDays: 3,
    storagePerDay: 5,
    notes: '3 business days to pick up. No loading help, bring a helper.',
  },
  {
    id: 'hibid',
    name: 'HiBid (generic)',
    buyersPremium: 0.15,
    cashDiscount: 0,
    cardFee: 0.035,
    salesTax: 0.0775,
    perLotFee: 0,
    docFee: 0,
    increments: standardIncrements,
    pickupWindowDays: 5,
    storagePerDay: 0,
    notes: 'Fees vary by auctioneer. Check the terms of the event.',
  },
  {
    id: 'govdeals',
    name: 'GovDeals',
    buyersPremium: 0.125,
    cashDiscount: 0,
    cardFee: 0,
    salesTax: 0.0775,
    perLotFee: 0,
    docFee: 15,
    increments: [
      { upTo: 500, step: 25 },
      { upTo: 2500, step: 50 },
      { upTo: Infinity, step: 100 },
    ],
    pickupWindowDays: 10,
    storagePerDay: 0,
    notes: 'Payment due in 5 days. Title paperwork is required for vehicles.',
  },
  {
    id: 'proxibid',
    name: 'Proxibid',
    buyersPremium: 0.18,
    cashDiscount: 0,
    cardFee: 0.03,
    salesTax: 0.0775,
    perLotFee: 0,
    docFee: 0,
    increments: standardIncrements,
    pickupWindowDays: 7,
    storagePerDay: 10,
    notes: 'Storage is charged after the pickup window closes.',
  },
  {
    id: 'publicsurplus',
    name: 'Public Surplus',
    buyersPremium: 0.1,
    cashDiscount: 0,
    cardFee: 0.025,
    salesTax: 0,
    perLotFee: 0,
    docFee: 0,
    increments: standardIncrements,
    pickupWindowDays: 10,
    storagePerDay: 0,
    notes: 'Public agencies often accept a resale certificate.',
  },
];

/** Lista efetiva: o perfil Default (derivado das configurações globais) mais os editáveis. */
export function allHouses(globals: GlobalDefaults, custom: HouseProfile[]): HouseProfile[] {
  return [makeDefaultHouse(globals), ...custom];
}

export function houseFor(houses: HouseProfile[], id: string): HouseProfile {
  return houses.find((h) => h.id === id) ?? houses[0];
}

/** O JSON troca Infinity por null: ao ler do armazenamento, devolvemos o "sem limite". */
export function hydrateHouses(list: HouseProfile[]): HouseProfile[] {
  return list.map((h) => ({
    ...h,
    increments: (h.increments?.length ? h.increments : standardIncrements).map((r) => ({
      step: r.step > 0 ? r.step : 5,
      upTo: r.upTo === null || r.upTo === undefined || !Number.isFinite(r.upTo) ? Infinity : r.upTo,
    })),
  }));
}

export function incrementsToText(list: BidIncrement[]): string {
  return list.map((r) => `${Number.isFinite(r.upTo) ? r.upTo : '*'}:${r.step}`).join(', ');
}

/** "100:5, 500:10, *:100" -> lista de incrementos. Devolve null se o texto for inválido. */
export function parseIncrements(text: string): BidIncrement[] | null {
  const parts = text.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const out: BidIncrement[] = [];
  for (const p of parts) {
    const m = p.match(/^(\*|\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const upTo = m[1] === '*' ? Infinity : Number(m[1]);
    const step = Number(m[2]);
    if (!(step > 0) || (Number.isFinite(upTo) && upTo <= 0)) return null;
    out.push({ upTo, step });
  }
  out.sort((a, b) => a.upTo - b.upTo);
  if (Number.isFinite(out[out.length - 1].upTo)) out.push({ upTo: Infinity, step: out[out.length - 1].step });
  return out;
}
