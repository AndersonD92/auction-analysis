import { useRef, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import type { GlobalDefaults, HouseProfile } from '../types';
import { DEFAULT_HOUSES, incrementsToText, parseIncrements, standardIncrements } from '../lib/houses';
import { CHANNELS } from '../lib/pricing';
import type { Prefs } from '../lib/derive';
import { Modal, NumberField, Toggle } from './ui';

export default function SettingsModal({
  globals,
  houses,
  prefs,
  onGlobals,
  onHouses,
  onPrefs,
  onExport,
  onImport,
  onRemoveCatalog,
  onReset,
  hasCatalog,
  onClose,
}: {
  globals: GlobalDefaults;
  houses: HouseProfile[];
  prefs: Prefs;
  onGlobals: (g: GlobalDefaults) => void;
  onHouses: (h: HouseProfile[]) => void;
  onPrefs: (p: Prefs) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onRemoveCatalog: () => void;
  onReset: () => void;
  hasCatalog: boolean;
  onClose: () => void;
}) {
  const [selId, setSelId] = useState(houses[0]?.id ?? '');
  const sel = houses.find((h) => h.id === selId);
  const [incText, setIncText] = useState(sel ? incrementsToText(sel.increments) : '');
  const [incError, setIncError] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (id: string) => {
    setSelId(id);
    const h = houses.find((x) => x.id === id);
    setIncText(h ? incrementsToText(h.increments) : '');
    setIncError(false);
  };
  const patch = (p: Partial<HouseProfile>) => onHouses(houses.map((h) => (h.id === selId ? { ...h, ...p } : h)));
  const pct = (v: number) => Math.round(v * 10000) / 100;

  const addHouse = () => {
    const id = `custom-${Date.now().toString(36)}`;
    const h: HouseProfile = {
      id,
      name: 'New auction house',
      buyersPremium: 0.15,
      cashDiscount: 0,
      cardFee: 0.03,
      salesTax: globals.salesTax,
      perLotFee: 0,
      docFee: 0,
      increments: standardIncrements,
      pickupWindowDays: 5,
      storagePerDay: 0,
      notes: '',
    };
    onHouses([...houses, h]);
    pick(id);
  };

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <section>
        <h3 className="display m-0 mb-2 text-base font-bold">Global defaults</h3>
        <p className="m-0 mb-3 text-sm text-mute">Used by the Default profile, for any auction that has no profile of its own.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField label="Buyer's premium" value={pct(globals.buyersPremium)} onChange={(n) => onGlobals({ ...globals, buyersPremium: n / 100 })} suffix="%" step={0.25} />
          <NumberField label="Sales tax" value={pct(globals.salesTax)} onChange={(n) => onGlobals({ ...globals, salesTax: n / 100 })} suffix="%" step={0.25} />
          <NumberField label="Average shipping per lot" value={globals.avgShipping} onChange={(n) => onGlobals({ ...globals, avgShipping: n })} prefix="$" />
        </div>
      </section>

      <section className="mt-6">
        <h3 className="display m-0 mb-2 text-base font-bold">How you buy and sell</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="set-channel">Main resale channel</label>
            <select id="set-channel" className="field" value={prefs.channelId} onChange={(e) => onPrefs({ ...prefs, channelId: e.target.value })}>
              {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="pt-1">
            <Toggle checked={prefs.payWithCash} onChange={(b) => onPrefs({ ...prefs, payWithCash: b })} label="I pay with cash/ACH (no card fee)" />
            <Toggle checked={prefs.resaleCertificate} onChange={(b) => onPrefs({ ...prefs, resaleCertificate: b })} label="I have a resale certificate (no sales tax)" />
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h3 className="display m-0 mb-2 text-base font-bold">Auction house profiles</h3>
        <p className="m-0 mb-3 text-sm text-mute">Fees differ for every auctioneer. The values below are starting points: check the terms of each event.</p>
        <div className="flex gap-2">
          <select aria-label="House profile" className="field" value={selId} onChange={(e) => pick(e.target.value)}>
            {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <button className="btn" onClick={addHouse}><Plus size={16} /> Add</button>
        </div>

        {sel && (
          <div className="mt-3 space-y-3 rounded-xl border border-line bg-bg p-3">
            <div>
              <label className="label" htmlFor="h-name">Name</label>
              <input id="h-name" className="field" value={sel.name} onChange={(e) => patch({ name: e.target.value.slice(0, 60) })} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumberField label="Buyer's premium" value={pct(sel.buyersPremium)} onChange={(n) => patch({ buyersPremium: n / 100 })} suffix="%" step={0.25} />
              <NumberField label="Cash discount" value={pct(sel.cashDiscount)} onChange={(n) => patch({ cashDiscount: n / 100 })} suffix="%" step={0.25} hint="off the premium" />
              <NumberField label="Card fee" value={pct(sel.cardFee)} onChange={(n) => patch({ cardFee: n / 100 })} suffix="%" step={0.25} />
              <NumberField label="Sales tax" value={pct(sel.salesTax)} onChange={(n) => patch({ salesTax: n / 100 })} suffix="%" step={0.25} />
              <NumberField label="Per-lot fee" value={sel.perLotFee} onChange={(n) => patch({ perLotFee: n })} prefix="$" />
              <NumberField label="Document fee" value={sel.docFee} onChange={(n) => patch({ docFee: n })} prefix="$" />
              <NumberField label="Pickup window" value={sel.pickupWindowDays} onChange={(n) => patch({ pickupWindowDays: n })} suffix="d" />
              <NumberField label="Storage per day" value={sel.storagePerDay} onChange={(n) => patch({ storagePerDay: n })} prefix="$" />
            </div>
            <div>
              <label className="label" htmlFor="h-inc">Bid increments (up to : step)</label>
              <input
                id="h-inc"
                className="field num"
                value={incText}
                aria-invalid={incError}
                onChange={(e) => {
                  setIncText(e.target.value);
                  const parsed = parseIncrements(e.target.value);
                  setIncError(!parsed);
                  if (parsed) patch({ increments: parsed });
                }}
              />
              <p className="m-0 mt-1 text-xs" style={{ color: incError ? 'var(--stop)' : 'var(--faint)' }}>
                {incError ? 'Use the format 100:5, 500:10, *:100 (the * means no upper limit).' : 'Example: 100:5, 500:10, *:100 means $5 steps up to $100, $10 up to $500, then $100.'}
              </p>
            </div>
            <div>
              <label className="label" htmlFor="h-notes">Notes</label>
              <input id="h-notes" className="field" value={sel.notes} onChange={(e) => patch({ notes: e.target.value.slice(0, 200) })} />
            </div>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_HOUSES.some((d) => d.id === sel.id) && (
                <button className="btn btn-sm" onClick={() => { const d = DEFAULT_HOUSES.find((x) => x.id === sel.id)!; onHouses(houses.map((h) => (h.id === sel.id ? d : h))); setIncText(incrementsToText(d.increments)); setIncError(false); }}>
                  Restore original values
                </button>
              )}
              {houses.length > 0 && (
                <button className="btn btn-sm" onClick={() => { const rest = houses.filter((h) => h.id !== sel.id); onHouses(rest); pick(rest[0]?.id ?? ''); }}>
                  <Trash2 size={14} /> Delete profile
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h3 className="display m-0 mb-2 text-base font-bold">Your data</h3>
        <p className="m-0 mb-3 text-sm text-mute">Everything is stored only in this browser. Export a backup if you switch devices.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={onExport}><Download size={16} /> Export backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
          {hasCatalog && <button className="btn" onClick={onRemoveCatalog}><Trash2 size={16} /> Remove current catalog</button>}
          {confirmReset ? (
            <button className="btn" style={{ borderColor: 'var(--stop)', color: 'var(--stop)' }} onClick={onReset}>Yes, erase everything</button>
          ) : (
            <button className="btn" onClick={() => setConfirmReset(true)}>Reset all data</button>
          )}
        </div>
      </section>
    </Modal>
  );
}
