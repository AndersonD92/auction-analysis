import type { Comparable, Condition, Lot, MarketEstimate } from '../types';
import { sellSpeedFromDays } from './pricing';

/**
 * DADOS FICTÍCIOS. Preços, comparáveis, taxas e links existem só para demonstrar o fluxo.
 * Nenhum desses lotes existe em leilão algum.
 */

export interface DemoCatalog {
  slug: string;
  name: string;
  description: string;
  catalogUrl: string;
  lots: Lot[];
}

const SOURCES: Comparable['source'][] = ['eBay', 'eBay', 'Marketplace'];
const DATES = ['2026-09-22', '2026-09-14', '2026-09-03', '2026-08-27'];

function placeholder(make: string, model: string, tag: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e293b"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
<rect width="640" height="480" fill="url(#g)"/>
<rect x="24" y="24" width="592" height="432" fill="none" stroke="#334155" stroke-dasharray="6 8"/>
<text x="320" y="225" text-anchor="middle" font-family="Arial,sans-serif" font-size="46" font-weight="700" fill="#e2e8f0">${esc(make)}</text>
<text x="320" y="285" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" fill="#94a3b8">${esc(model.slice(0, 26))}</text>
<text x="320" y="430" text-anchor="middle" font-family="monospace" font-size="16" letter-spacing="4" fill="#64748b">${esc(tag)} · DEMO PHOTO</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function market(
  p50: number,
  days: number,
  confidence: number,
  compTitles: string[],
  localRatio = 0.72,
): MarketEstimate {
  const comps: Comparable[] = compTitles.map((title, i) => ({
    title,
    price: Math.round(p50 * [1.04, 0.96, 1.01, 0.93][i % 4]),
    soldAt: DATES[i % DATES.length],
    source: SOURCES[i % SOURCES.length],
  }));
  return {
    low: Math.round(p50 * 0.74),
    p25: Math.round(p50 * 0.88),
    p50,
    p75: Math.round(p50 * 1.13),
    high: Math.round(p50 * 1.32),
    localQuick: Math.round(p50 * localRatio),
    confidence,
    comps,
    sellSpeed: sellSpeedFromDays(days),
    daysToSell: days,
  };
}

interface LotSpec {
  n: string;
  title: string;
  make: string;
  model: string;
  category: string;
  condition: Condition;
  bid: number;
  qty?: number;
  lb: number;
  ship: number | null;
  refurb?: number;
  salvage?: number;
  p50: number;
  days: number;
  conf: number;
  comps: string[];
  local?: number;
  partOut?: number;
  restriction?: string;
  risks: string[];
  thesis: string;
}

function build(slug: string, auction: string, catalogUrl: string, specs: LotSpec[]): DemoCatalog['lots'] {
  return specs.map((s, i) => ({
    id: `${slug}-${s.n}`,
    lotNumber: s.n,
    houseId: 'default',
    auctionName: auction,
    directUrl: '',
    catalogUrl,
    imageUrl: placeholder(s.make, s.model, `LOT ${s.n}`),
    title: s.title,
    make: s.make,
    model: s.model,
    category: s.category,
    condition: s.condition,
    currentBid: s.bid,
    quantity: s.qty ?? 1,
    weightLb: s.lb,
    logistics: s.ship,
    refurbCost: s.refurb ?? 0,
    salvageValue: s.salvage ?? 0,
    market: market(s.p50, s.days, s.conf, s.comps, s.local),
    risks: s.risks,
    rationale: s.thesis,
    partOutValue: s.partOut,
    shippingRestriction: s.restriction,
    closesAt: `2026-10-${16 + Math.floor(i / 3)}T${18 + (i % 3)}:00:00Z`,
  }));
}

const IT_URL = 'https://4lessauctions.hibid.com/catalog/512408/enterprise-it-networking-surplus';
const LAB_URL = 'https://www.proxibid.com/Industrial-Lab-Equipment-Liquidation/auction-house/1048822';
const CE_URL = 'https://consumerliquidation.hibid.com/catalog/498120/consumer-electronics-audio-liquidation';

const IT = build('it', 'Enterprise IT & Networking Surplus', IT_URL, [
  {
    n: '104',
    title: 'Dell PowerEdge R740 2U Server, 2x Xeon Gold 6132, 256GB RAM',
    make: 'Dell',
    model: 'PowerEdge R740',
    category: 'IT Equipment',
    condition: 'Used - Tested',
    bid: 210,
    lb: 68,
    ship: 45,
    refurb: 20,
    salvage: 60,
    p50: 890,
    days: 16,
    conf: 0.86,
    comps: ['R740 2x Gold 6132 256GB no HDD', 'PowerEdge R740 2U 256GB', 'R740 similar config, rails incl.'],
    partOut: 1180,
    risks: ['No HDDs or caddies included', 'Rails not included', 'Heavy freight: 68 lb'],
    thesis:
      'The two CPUs carry real standalone value, so the chassis is worth more parted out than whole if it sits unsold for a month. Strong comps and a steady buyer pool in refurbished enterprise gear.',
  },
  {
    n: '117',
    title: 'Pallet of 14x Cisco Catalyst 2960X-48FPS-L PoE Switches',
    make: 'Cisco',
    model: 'WS-C2960X-48FPS-L',
    category: 'Networking',
    condition: 'Used - Untested / As-Is',
    bid: 380,
    qty: 14,
    lb: 210,
    ship: 120,
    refurb: 40,
    salvage: 12,
    p50: 128,
    days: 24,
    conf: 0.72,
    comps: ['2960X-48FPS-L tested', '2960X-48FPS lot of 2'],
    risks: ['14 units, none tested', 'Model is end-of-support at Cisco', 'Saturated market, units sell one at a time'],
    thesis:
      'Per-unit price is what matters. Selling about five of the fourteen covers the whole outlay, the rest is margin. The risk is the untested batch, so keep the bid conservative.',
  },
  {
    n: '123',
    title: 'NetApp DS2246 24-Bay SAS Disk Shelf with 2x IOM6',
    make: 'NetApp',
    model: 'DS2246',
    category: 'Storage',
    condition: 'Used - Tested',
    bid: 150,
    lb: 95,
    ship: 70,
    salvage: 30,
    p50: 420,
    days: 20,
    conf: 0.7,
    comps: ['DS2246 24x2.5 shelf 2x IOM6', 'DS2246 shelf no caddies'],
    risks: ['No drives or caddies', 'Needs a SAS HBA to verify', 'Freight-only shipping'],
    thesis:
      'Homelab and small-business buyers keep demand steady for these shelves. Margin holds as long as freight stays under control.',
  },
  {
    n: '132',
    title: 'APC Smart-UPS SRT 5000VA RM, batteries not included',
    make: 'APC',
    model: 'SRT5KRMXLT',
    category: 'Power',
    condition: 'Used - Untested / As-Is',
    bid: 145,
    lb: 165,
    ship: 180,
    refurb: 420,
    salvage: 55,
    p50: 1150,
    days: 45,
    conf: 0.6,
    comps: ['SRT5KRMXLT with new batteries'],
    restriction: 'Lead-acid batteries: ground shipping only (Class 8)',
    risks: ['Battery bank costs about $420 to replace', 'Freight on a 165 lb pallet', 'Slow category, capital sits for weeks'],
    thesis:
      'The margin looks fine on paper and disappears once refurb and freight are counted. Only worth it for a local cash sale.',
  },
  {
    n: '141',
    title: 'Lot of 8x Dell Latitude 7420 Laptops, i7 11th Gen, 16GB / 512GB',
    make: 'Dell',
    model: 'Latitude 7420',
    category: 'IT Equipment',
    condition: 'Used - Tested',
    bid: 640,
    qty: 8,
    lb: 32,
    ship: 25,
    refurb: 80,
    salvage: 25,
    p50: 315,
    days: 6,
    conf: 0.91,
    comps: ['Latitude 7420 i7 16/512', 'Latitude 7420 i7 grade A', 'Latitude 7420 i7 16GB'],
    risks: ['No power adapters', 'Asset tags stuck on lids'],
    thesis:
      'Fast turnover and plentiful comps. This is the kind of lot that pays for the whole day even against competing bidders.',
  },
  {
    n: '148',
    title: 'Lot of 12x Dell U2419H 24" IPS Monitors',
    make: 'Dell',
    model: 'U2419H',
    category: 'Monitors',
    condition: 'Used - Tested',
    bid: 190,
    qty: 12,
    lb: 130,
    ship: 60,
    salvage: 8,
    p50: 88,
    days: 18,
    conf: 0.83,
    comps: ['U2419H with stand', 'U2419H no stand'],
    risks: ['Monitors break easily when shipped', '3 identical lots in this same event'],
    thesis: 'A good local-pickup item and a poor shipping item. Sell at the door and skip freight.',
  },
  {
    n: '152',
    title: 'Lot of 12x Dell U2419H 24" IPS Monitors (second lot)',
    make: 'Dell',
    model: 'U2419H',
    category: 'Monitors',
    condition: 'Used - Tested',
    bid: 165,
    qty: 12,
    lb: 130,
    ship: 60,
    salvage: 8,
    p50: 88,
    days: 18,
    conf: 0.83,
    comps: ['U2419H with stand'],
    risks: ['Saturation: identical model repeated in the same event'],
    thesis: 'Identical to lot 148. Buy one of the two, not both, or you will be selling against yourself.',
  },
  {
    n: '160',
    title: 'Lot of 6x Ubiquiti UniFi USW-Pro-48-PoE Switches, open box',
    make: 'Ubiquiti',
    model: 'USW-Pro-48-PoE',
    category: 'Networking',
    condition: 'Open Box',
    bid: 520,
    qty: 6,
    lb: 60,
    ship: 55,
    salvage: 90,
    p50: 480,
    days: 9,
    conf: 0.84,
    comps: ['USW-Pro-48-PoE open box', 'USW-Pro-48-PoE new sealed', 'UniFi Pro 48 PoE used'],
    risks: ['Confirm units are not adopted to a locked controller'],
    thesis:
      'Open-box network gear from a managed brand moves fast with installers. Check that none are locked to a previous owner before bidding to the ceiling.',
  },
]);

const LAB = build('lab', 'Industrial & Lab Equipment Liquidation', LAB_URL, [
  {
    n: '12',
    title: 'Keysight DSOX1204G 4-Channel 70 MHz Oscilloscope',
    make: 'Keysight',
    model: 'DSOX1204G',
    category: 'Test & Measurement',
    condition: 'Used - Tested',
    bid: 520,
    lb: 16,
    ship: 28,
    salvage: 150,
    p50: 1250,
    days: 8,
    conf: 0.85,
    comps: ['DSOX1204G 70MHz 4ch', 'DSOX1204G with probes', 'DSOX1204G no accessories'],
    risks: ['Probes are not shown in the photos', 'Check the calibration sticker date'],
    thesis:
      'Keysight scopes hold value and the engineer and hobbyist market is deep. Margin depends on whether probes are included, so confirm at the preview.',
  },
  {
    n: '15',
    title: 'Lot of 6x Fluke 87V True-RMS Multimeters',
    make: 'Fluke',
    model: '87V',
    category: 'Test & Measurement',
    condition: 'Used - Tested',
    bid: 300,
    qty: 6,
    lb: 9,
    ship: 20,
    salvage: 40,
    p50: 215,
    days: 5,
    conf: 0.9,
    comps: ['Fluke 87V used', 'Fluke 87V with leads', 'Fluke 87V lot of 2'],
    risks: ['Leads and holsters may be missing'],
    thesis: 'A brand with its own market and quick sales. Light and cheap to ship, which protects the margin.',
  },
  {
    n: '19',
    title: 'Tektronix TDS2024C 4-Channel 200 MHz Digital Oscilloscope',
    make: 'Tektronix',
    model: 'TDS2024C',
    category: 'Test & Measurement',
    condition: 'Used - Tested',
    bid: 410,
    lb: 14,
    ship: 28,
    salvage: 100,
    p50: 880,
    days: 14,
    conf: 0.8,
    comps: ['TDS2024C 200MHz', 'TDS2024C with probes'],
    risks: ['Missing power cord', 'CompactFlash module not included'],
    thesis: 'Solid used-scope demand at a price point that suits schools and small labs.',
  },
  {
    n: '23',
    title: 'Keysight E36312A Triple-Output DC Power Supply',
    make: 'Keysight',
    model: 'E36312A',
    category: 'Test & Measurement',
    condition: 'Used - Tested',
    bid: 380,
    lb: 18,
    ship: 30,
    salvage: 90,
    p50: 740,
    days: 10,
    conf: 0.78,
    comps: ['E36312A triple output', 'E36312A used tested'],
    risks: ['Needs calibration for lab use', 'Power cord not shown'],
    thesis: 'Bench supplies with three outputs sell steadily. Margin is healthy at a balanced bid.',
  },
  {
    n: '27',
    title: 'Lot of 3x Rigol DP832 Programmable DC Power Supplies, not tested',
    make: 'Rigol',
    model: 'DP832',
    category: 'Test & Measurement',
    condition: 'Used - Untested / As-Is',
    bid: 260,
    qty: 3,
    lb: 30,
    ship: 40,
    salvage: 45,
    p50: 330,
    days: 12,
    conf: 0.72,
    comps: ['DP832 used working', 'DP832 lot of 2'],
    risks: ['None of the three has been powered on', 'Output channels can fail under load'],
    thesis: 'Likely worth bidding only at the conservative level. One dead channel on each unit would erase the margin.',
  },
  {
    n: '31',
    title: 'Lot of 4x Agilent 34401A 6.5-Digit Bench Multimeters',
    make: 'Agilent',
    model: '34401A',
    category: 'Test & Measurement',
    condition: 'Used - Tested',
    bid: 210,
    qty: 4,
    lb: 36,
    ship: 45,
    salvage: 25,
    p50: 270,
    days: 15,
    conf: 0.82,
    comps: ['34401A 6.5 digit', '34401A used working', '34401A lot of 2'],
    risks: ['Old units, calibration is likely overdue', 'Front-panel wear'],
    thesis: 'A long-lived workhorse that buyers still ask for. Sold singly it beats the lot price comfortably.',
  },
  {
    n: '36',
    title: 'Lot of 10x Hakko FX-951 Soldering Stations',
    make: 'Hakko',
    model: 'FX-951',
    category: 'Tools',
    condition: 'Used - Tested',
    bid: 250,
    qty: 10,
    lb: 48,
    ship: 55,
    salvage: 10,
    p50: 95,
    days: 6,
    conf: 0.88,
    comps: ['FX-951 station with handle', 'FX-951 base only', 'FX-951 used'],
    risks: ['Handles and tips may be missing', 'Mixed wear across 10 units'],
    thesis: 'Repair shops buy these constantly. Sell as stations and as separate handles to lift the average.',
  },
  {
    n: '40',
    title: 'Keysight N9010A EXA Spectrum Analyzer, for parts or repair',
    make: 'Keysight',
    model: 'N9010A',
    category: 'Test & Measurement',
    condition: 'For Parts / Repair',
    bid: 900,
    lb: 55,
    ship: 110,
    refurb: 600,
    salvage: 450,
    p50: 4500,
    days: 40,
    conf: 0.5,
    comps: ['N9010A working 26.5GHz'],
    restriction: 'Export-controlled instrument: check buyer eligibility',
    risks: ['Listed for parts: failure mode unknown', 'Options and licences may not transfer', 'Repair cost can exceed the resale gap'],
    thesis:
      'The spread between a working and a dead unit is huge, and so is the risk. Treat it as a lottery ticket, not a flip.',
  },
]);

const CE = build('ce', 'Consumer Electronics & Audio Liquidation', CE_URL, [
  {
    n: '201',
    title: 'Lot of 10x Sony WH-1000XM5 Wireless Noise-Cancelling Headphones, open box',
    make: 'Sony',
    model: 'WH-1000XM5',
    category: 'Audio',
    condition: 'Open Box',
    bid: 420,
    qty: 10,
    lb: 14,
    ship: null,
    salvage: 60,
    p50: 215,
    days: 6,
    conf: 0.9,
    comps: ['WH-1000XM5 open box', 'WH-1000XM5 like new', 'WH-1000XM5 used'],
    risks: ['Some units may be missing the carry case'],
    thesis: 'Premium headphones with deep demand and quick turns. A confident entry at the balanced bid.',
  },
  {
    n: '205',
    title: 'Lot of 12x JBL Charge 5 Portable Bluetooth Speakers, brand new',
    make: 'JBL',
    model: 'Charge 5',
    category: 'Audio',
    condition: 'Brand New',
    bid: 480,
    qty: 12,
    lb: 24,
    ship: null,
    salvage: 0,
    p50: 118,
    days: 5,
    conf: 0.92,
    comps: ['JBL Charge 5 new', 'JBL Charge 5 sealed', 'JBL Charge 5 new in box'],
    risks: ['Retail clearance prices compress the resale spread'],
    thesis: 'Sealed stock with a strong comp base. The margin is thinner but the turnover is the fastest in the event.',
  },
  {
    n: '209',
    title: 'Sony Alpha A7 III Mirrorless Camera Body',
    make: 'Sony',
    model: 'A7 III',
    category: 'Cameras',
    condition: 'Used - Tested',
    bid: 780,
    lb: 3,
    ship: null,
    salvage: 250,
    p50: 1050,
    days: 9,
    conf: 0.85,
    comps: ['A7 III body low shutter count', 'A7 III body used', 'A7 III body with battery'],
    risks: ['Shutter count unknown', 'No battery charger shown'],
    thesis: 'Used full-frame bodies hold their price. Ask for the shutter count at the preview, it moves the value by $100 or more.',
  },
  {
    n: '214',
    title: 'Lot of 4x Sonos Beam Gen 2 Soundbars, open box',
    make: 'Sonos',
    model: 'Beam Gen 2',
    category: 'Audio',
    condition: 'Open Box',
    bid: 360,
    qty: 4,
    lb: 30,
    ship: null,
    salvage: 80,
    p50: 330,
    days: 8,
    conf: 0.8,
    comps: ['Sonos Beam Gen 2 open box', 'Sonos Beam Gen 2 used', 'Sonos Beam Gen 2 new'],
    risks: ['Units may still be tied to a previous Sonos account'],
    thesis: 'Sonos has a loyal secondary market. Verify none are account-locked before going for the ceiling.',
  },
  {
    n: '218',
    title: 'Lot of 20x Apple AirPods Pro (2nd Gen), customer returns, untested',
    make: 'Apple',
    model: 'AirPods Pro 2',
    category: 'Audio',
    condition: 'Used - Untested / As-Is',
    bid: 650,
    qty: 20,
    lb: 6,
    ship: null,
    salvage: 20,
    p50: 140,
    days: 10,
    conf: 0.55,
    comps: ['AirPods Pro 2 used working', 'AirPods Pro 2 open box'],
    risks: [
      'Some units may be locked to a previous Apple ID',
      'Counterfeits are common in mixed return lots',
      'Ear tips and cases are hygiene items',
    ],
    thesis: 'High volume and high headline price, but untested returns carry real counterfeit and lock risk. Stay at the conservative bid.',
  },
  {
    n: '223',
    title: 'Lot of 6x GoPro HERO12 Black Action Cameras',
    make: 'GoPro',
    model: 'HERO12 Black',
    category: 'Cameras',
    condition: 'Used - Tested',
    bid: 540,
    qty: 6,
    lb: 5,
    ship: null,
    salvage: 40,
    p50: 215,
    days: 7,
    conf: 0.85,
    comps: ['HERO12 Black used', 'HERO12 Black with accessories', 'HERO12 Black body only'],
    risks: ['Batteries and mounts may be missing'],
    thesis: 'Light, small and in constant demand. Shipping costs almost nothing, which protects the margin.',
  },
  {
    n: '227',
    title: 'Lot of 4x Marshall Stanmore III Bluetooth Speakers, open box',
    make: 'Marshall',
    model: 'Stanmore III',
    category: 'Audio',
    condition: 'Open Box',
    bid: 310,
    qty: 4,
    lb: 40,
    ship: null,
    salvage: 70,
    p50: 265,
    days: 11,
    conf: 0.78,
    comps: ['Stanmore III open box', 'Stanmore III used'],
    risks: ['Bulky: 40 lb for the lot', 'Fabric grille scuffs are common'],
    thesis: 'A recognizable brand with steady local demand. Sell in person to skip the shipping cost.',
  },
]);

export const DEMO_CATALOGS: DemoCatalog[] = [
  {
    slug: 'industrial-lab',
    name: 'Industrial & Lab Equipment Liquidation',
    description: 'Oscilloscopes, multimeters, power supplies, bench tools.',
    catalogUrl: LAB_URL,
    lots: LAB,
  },
  {
    slug: 'enterprise-it',
    name: 'Enterprise IT & Networking Surplus',
    description: 'Cisco switches, Dell servers, storage shelves, laptops.',
    catalogUrl: IT_URL,
    lots: IT,
  },
  {
    slug: 'consumer-audio',
    name: 'Consumer Electronics & Audio Liquidation',
    description: 'Headphones, speakers, cameras.',
    catalogUrl: CE_URL,
    lots: CE,
  },
];

export function demoCatalog(slug: string): DemoCatalog | undefined {
  const c = DEMO_CATALOGS.find((d) => d.slug === slug);
  return c ? structuredClone(c) : undefined;
}
