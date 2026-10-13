import { useMemo, useState } from 'react';
import type { GlobalDefaults, HouseProfile } from '../types';
import { allHouses, houseFor } from '../lib/houses';
import { buildPlan, CHANNELS, money, moneyPrecise, pct, pctCap } from '../lib/pricing';
import type { Row, Prefs } from '../lib/derive';
import { channelOf } from '../lib/derive';
import { Modal, NumberField, Stat, Toggle } from './ui';

const round2 = (n: number) => Math.round(n * 10000) / 100;

export default function CalculatorModal({
  row,
  globals,
  customHouses,
  prefs,
  calibration,
  onClose,
  onHouse,
  onSaveBid,
}: {
  row: Row;
  globals: GlobalDefaults;
  customHouses: HouseProfile[];
  prefs: Prefs;
  calibration: number;
  onClose: () => void;
  onHouse: (houseId: string) => void;
  onSaveBid: (bid: number) => void;
}) {
  const { lot } = row;
  const houses = allHouses(globals, customHouses);
  const baseHouse = houseFor(houses, lot.houseId);
  const [bid, setBid] = useState(lot.currentBid);
  const [channelId, setChannelId] = useState(prefs.channelId);
  const [cash, setCash] = useState(prefs.payWithCash);
  const [cert, setCert] = useState(prefs.resaleCertificate);
  const [logistics, setLogistics] = useState(row.plan.logistics);
  const [refurb, setRefurb] = useState(lot.refurbCost);
  // Começa no valor de mercado já reduzido pela saturação (lotes repetidos); depois é por sua conta.
  const saturation = Math.min(0.25, Math.max(0, row.duplicates - 1) * 0.06);
  const [salePrice, setSalePrice] = useState(Math.round(lot.market.p50 * calibration * (1 - saturation)));
  const [storageDays, setStorageDays] = useState(0);
  // Percentuais editáveis: começam no perfil da casa e podem ser testados à mão.
  const [premiumPct, setPremiumPct] = useState(round2(baseHouse.buyersPremium));
  const [taxPct, setTaxPct] = useState(round2(baseHouse.salesTax));
  const [cardPct, setCardPct] = useState(round2(baseHouse.cardFee));
  const [sellFeePct, setSellFeePct] = useState(round2(channelOf(prefs.channelId).feePct));

  const house = useMemo<HouseProfile>(
    () => ({ ...baseHouse, buyersPremium: premiumPct / 100, salesTax: taxPct / 100, cardFee: cardPct / 100 }),
    [baseHouse, premiumPct, taxPct, cardPct],
  );
  const channel = useMemo(() => ({ ...channelOf(channelId), feePct: sellFeePct / 100 }), [channelId, sellFeePct]);

  const plan = useMemo(
    () =>
      buildPlan(lot, house, {
        channel,
        payWithCash: cash,
        resaleCertificate: cert,
        calibration: 1,
        duplicates: 1,
        avgShipping: globals.avgShipping,
        salePriceOverride: salePrice,
        bidOverride: bid,
        logisticsOverride: logistics,
        refurbOverride: refurb,
      }),
    [lot, house, channel, cash, cert, globals.avgShipping, salePrice, bid, logistics, refurb],
  );

  const c = plan.cost;
  const storage = storageDays * house.storagePerDay;
  const totalCost = c.total + storage;
  const profit = plan.profit - storage;
  const tone = profit >= 0 ? 'var(--go)' : 'var(--stop)';
  const gross = salePrice * lot.quantity;

  // Para onde vai o dinheiro da revenda bruta.
  const slices = [
    { k: 'Auction (hammer)', v: c.hammer, color: '#64748b' },
    { k: "Premium & fees", v: c.premium + c.fees, color: '#8b5cf6' },
    { k: 'Tax & card', v: c.tax + c.cardFee, color: 'var(--amber)' },
    { k: 'Freight, parts, storage', v: c.logistics + c.refurb + storage, color: '#f97316' },
    { k: 'Selling fees & DOA loss', v: Math.max(0, gross - plan.revenue), color: '#ec4899' },
    { k: 'Profit', v: Math.max(0, profit), color: 'var(--go)' },
  ];
  const spent = slices.reduce((s, x) => s + x.v, 0) || 1;

  const sliderMax = Math.max(100, Math.ceil((plan.breakEven * 1.4 || lot.currentBid * 2 || 100) / 10) * 10);

  return (
    <Modal title={`Calculator · Lot ${lot.lotNumber}`} onClose={onClose} wide>
      <p className="m-0 mb-4 text-sm text-mute">{lot.title}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <NumberField label="Your bid (hammer)" value={bid} onChange={setBid} prefix="$" />
          <input
            type="range"
            aria-label="Bid slider"
            className="w-full accent-[var(--cyan)]"
            min={0}
            max={Math.max(sliderMax, bid)}
            step={5}
            value={bid}
            onChange={(e) => setBid(Number(e.target.value))}
          />
          <div>
            <label className="label" htmlFor="calc-house">Auction house profile</label>
            <select
              id="calc-house"
              className="field"
              value={lot.houseId}
              onChange={(e) => {
                const h = houseFor(houses, e.target.value);
                onHouse(h.id);
                setPremiumPct(round2(h.buyersPremium));
                setTaxPct(round2(h.salesTax));
                setCardPct(round2(h.cardFee));
              }}
            >
              {houses.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Buyer's premium" value={premiumPct} onChange={setPremiumPct} suffix="%" step={0.25} />
            <NumberField label="Sales tax" value={taxPct} onChange={setTaxPct} suffix="%" step={0.25} />
            <NumberField label="Card fee" value={cardPct} onChange={setCardPct} suffix="%" step={0.25} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="calc-channel">Where you will sell</label>
              <select
                id="calc-channel"
                className="field"
                value={channelId}
                onChange={(e) => {
                  setChannelId(e.target.value);
                  setSellFeePct(round2(channelOf(e.target.value).feePct));
                }}
              >
                {CHANNELS.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            </div>
            <NumberField label="Platform fee" value={sellFeePct} onChange={setSellFeePct} suffix="%" step={0.25} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Freight / pickup" value={logistics} onChange={setLogistics} prefix="$" />
            <NumberField label="Refurb / parts" value={refurb} onChange={setRefurb} prefix="$" />
            <NumberField label="Target resale / unit" value={salePrice} onChange={setSalePrice} prefix="$" hint={`Market median ${money(lot.market.p50)}${saturation > 0 ? ", reduced for repeated lots" : ""}`} />
            <NumberField label="Storage days" value={storageDays} onChange={setStorageDays} hint={house.storagePerDay ? `${money(house.storagePerDay)}/day` : 'No storage fee'} />
          </div>
          <Toggle checked={cash} onChange={setCash} label={`Pay with cash/ACH (no card fee${house.cashDiscount ? `, ${pct(house.cashDiscount)} off premium` : ''})`} />
          <Toggle checked={cert} onChange={setCert} label="I have a resale certificate (no sales tax)" />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-line bg-bg p-3 text-sm">
            <Line k="Hammer price" v={moneyPrecise(c.hammer)} />
            <Line k={`Buyer's premium (${pct(house.buyersPremium - (cash ? house.cashDiscount : 0))})`} v={moneyPrecise(c.premium)} />
            {c.fees > 0 && <Line k="Lot & document fees" v={moneyPrecise(c.fees)} />}
            <Line k={cert ? 'Sales tax (exempt)' : `Sales tax (${(house.salesTax * 100).toFixed(2)}%)`} v={moneyPrecise(c.tax)} />
            {!cash && <Line k={`Card fee (${(house.cardFee * 100).toFixed(1)}%)`} v={moneyPrecise(c.cardFee)} />}
            <Line k="Freight / pickup" v={moneyPrecise(c.logistics)} />
            {c.refurb > 0 && <Line k="Refurb / parts" v={moneyPrecise(c.refurb)} />}
            {storage > 0 && <Line k="Storage" v={moneyPrecise(storage)} />}
            <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold">
              <span>Total acquisition cost (TAC)</span>
              <span className="num">{moneyPrecise(totalCost)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Net resale" value={money(plan.revenue)} sub="after platform fees & DOA risk" />
            <Stat label="Net profit" value={money(profit)} tone={tone} />
            <Stat label="ROI" value={pct(profit / Math.max(1, totalCost))} tone={tone} />
            <Stat label="Annualized" value={pctCap(plan.roiAnnual)} sub="simple" />
          </div>

          <div>
            <div className="label">Where the resale money goes</div>
            <div className="flex h-5 overflow-hidden rounded-full border border-line" role="img" aria-label="Breakdown of the gross resale value">
              {slices.filter((x) => x.v > 0).map((x) => (
                <span key={x.k} title={`${x.k}: ${money(x.v)}`} style={{ width: `${(x.v / spent) * 100}%`, background: x.color }} />
              ))}
            </div>
            {profit < 0 && <p className="m-0 mt-1 text-xs text-stop">At this bid the lot loses {money(-profit)}.</p>}
            <ul className="m-0 mt-2 grid list-none grid-cols-2 gap-x-3 gap-y-1 p-0 text-xs text-mute">
              {slices.map((x) => (
                <li key={x.k} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: x.color }} />
                  <span className="min-w-0 flex-1 truncate">{x.k}</span>
                  <span className="num text-ink">{money(x.v)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="label">Bid ceilings at these inputs</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ['Conserv.', plan.conservative],
                ['Balanced', plan.balanced],
                ['Max', plan.max],
                ['Break-even', plan.breakEven],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg border border-line bg-bg p-2">
                  <div className="text-[0.62rem] uppercase tracking-wider text-mute">{k}</div>
                  <div className="num text-sm font-semibold">{money(v as number)}</div>
                </div>
              ))}
            </div>
          </div>

          <button className="btn w-full" onClick={() => { onSaveBid(bid); onClose(); }}>
            Save {money(bid)} as the lot's current bid
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-mute">
      <span>{k}</span>
      <span className="num text-ink">{v}</span>
    </div>
  );
}
