import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlayCircle, ScanSearch, Search } from 'lucide-react';
import type { Catalog, GlobalDefaults, HouseProfile, Lot, Tier, WatchEntry } from './types';
import { DEFAULT_GLOBALS, DEFAULT_HOUSES, hydrateHouses } from './lib/houses';
import { buildCalibration, calibrationFor, usePersisted, useOnline } from './lib/store';
import { computeRows, DEFAULT_PREFS, summarize } from './lib/derive';
import type { Prefs } from './lib/derive';
import { buildAlerts } from './lib/alerts';
import { TIERS } from './lib/pricing';
import { fetchHealth, listDemoCatalogs, loadDemoCatalog } from './lib/api';
import type { Health, ScanResult } from './lib/api';
import Header from './components/Header';
import SummaryBar from './components/SummaryBar';
import ProductCard from './components/ProductCard';
import CalculatorModal from './components/CalculatorModal';
import MarketModal from './components/MarketModal';
import ScanModal from './components/ScanModal';
import WatchlistDrawer from './components/WatchlistDrawer';
import AlertsPanel from './components/AlertsPanel';
import SettingsModal from './components/SettingsModal';
import BudgetPanel from './components/BudgetPanel';
import LiveMode from './components/LiveMode';

type SortKey = 'score' | 'profit' | 'roi' | 'lot';
type Panel = null | 'scan' | 'watch' | 'alerts' | 'settings';
const PAGE = 48;

function looksLikeLot(x: any): x is Lot {
  return Boolean(x) && typeof x.id === 'string' && typeof x.title === 'string' && x.market && typeof x.market.p50 === 'number' && typeof x.currentBid === 'number';
}

export default function App() {
  const [catalogs, setCatalogs] = usePersisted<Catalog[]>('catalogs', []);
  const [activeId, setActiveId] = usePersisted<string>('active', '');
  const [globals, setGlobals] = usePersisted<GlobalDefaults>('globals', DEFAULT_GLOBALS);
  const [rawHouses, setHouses] = usePersisted<HouseProfile[]>('houses', DEFAULT_HOUSES);
  const [prefs, setPrefs] = usePersisted<Prefs>('prefs', DEFAULT_PREFS);
  const [watch, setWatch] = usePersisted<WatchEntry[]>('watch', []);
  const [budget, setBudget] = usePersisted<number>('budget', 2000);

  const [panel, setPanel] = useState<Panel>(null);
  const [calcId, setCalcId] = useState<string | null>(null);
  const [marketId, setMarketId] = useState<string | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  const [notice, setNotice] = useState('');

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [tier, setTier] = useState<Tier | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortKey>('score');
  const [shown, setShown] = useState(PAGE);

  const online = useOnline();
  useEffect(() => {
    void fetchHealth().then((h) => setHealth(h));
  }, []);

  const houses = useMemo(() => hydrateHouses(rawHouses), [rawHouses]);
  const active = catalogs.find((c) => c.id === activeId) ?? catalogs[0];
  const allLots = useMemo(() => catalogs.flatMap((c) => c.lots), [catalogs]);
  const calibration = useMemo(() => buildCalibration(watch, allLots), [watch, allLots]);

  const rows = useMemo(
    () => (active ? computeRows(active.lots, globals, houses, prefs, calibration) : []),
    [active, globals, houses, prefs, calibration],
  );
  const summary = useMemo(() => summarize(rows), [rows]);
  const alerts = useMemo(() => buildAlerts(rows, watch), [rows, watch]);
  const watchSet = useMemo(() => new Set(watch.map((w) => w.lotId)), [watch]);
  const activeWatch = useMemo(() => watch.filter((w) => rows.some((r) => r.lot.id === w.lotId)), [watch, rows]);
  const liveRows = useMemo(
    () => rows.filter((r) => watch.some((w) => w.lotId === r.lot.id && w.status !== 'Won' && w.status !== 'Lost')),
    [rows, watch],
  );

  const tierCounts = useMemo(() => {
    const c = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
    for (const r of rows) c[r.plan.tier]++;
    return c;
  }, [rows]);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.lot.category))].sort(), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (tier !== 'ALL' && r.plan.tier !== tier) return false;
      if (category !== 'ALL' && r.lot.category !== category) return false;
      if (!q) return true;
      return `${r.lot.title} ${r.lot.make} ${r.lot.model} ${r.lot.category} ${r.lot.lotNumber}`.toLowerCase().includes(q);
    });
    const num = (s: string) => Number(s.replace(/\D/g, '')) || 0;
    const cmp: Record<SortKey, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
      score: (a, b) => b.plan.score - a.plan.score,
      profit: (a, b) => b.plan.profitAtBalanced - a.plan.profitAtBalanced,
      roi: (a, b) => b.plan.roiAtBalanced - a.plan.roiAtBalanced,
      lot: (a, b) => num(a.lot.lotNumber) - num(b.lot.lotNumber),
    };
    return [...list].sort(cmp[sort]);
  }, [rows, query, category, tier, sort]);

  useEffect(() => setShown(PAGE), [query, category, tier, sort, activeId]);

  /* ---------- ações ---------- */

  const flash = (m: string) => {
    setNotice(m);
    window.setTimeout(() => setNotice(''), 5000);
  };

  const onResult = (r: ScanResult) => {
    const cat: Catalog = {
      id: `cat-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.lots.length}`,
      name: r.name,
      catalogUrl: r.catalogUrl,
      lots: r.lots,
      scannedAt: new Date().toISOString(),
    };
    setCatalogs((prev) => [cat, ...prev.filter((c) => c.name !== cat.name)].slice(0, 8));
    setActiveId(cat.id);
    setPanel(null);
    setTier('ALL');
    setCategory('ALL');
    setQuery('');
    if (r.warnings.length) flash(r.warnings.slice(0, 2).join(' '));
  };

  const updateLot = useCallback(
    (lotId: string, patch: Partial<Lot>) =>
      setCatalogs((prev) => prev.map((c) => ({ ...c, lots: c.lots.map((l) => (l.id === lotId ? { ...l, ...patch } : l)) }))),
    [setCatalogs],
  );

  const toggleWatch = (lotId: string) => {
    const row = rows.find((r) => r.lot.id === lotId);
    setWatch((prev) =>
      prev.some((w) => w.lotId === lotId)
        ? prev.filter((w) => w.lotId !== lotId)
        : [...prev, { lotId, status: 'Monitoring', myMaxBid: row ? row.plan.balanced : 0 }],
    );
  };

  const patchWatch = (lotId: string, p: Partial<WatchEntry>) =>
    setWatch((prev) => prev.map((w) => (w.lotId === lotId ? { ...w, ...p } : w)));

  const openLot = (lotId: string) => {
    setTier('ALL');
    setCategory('ALL');
    setQuery('');
    setShown(10_000);
    window.setTimeout(() => {
      const el = document.getElementById(`lot-${lotId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.animate([{ outline: '2px solid var(--cyan)' }, { outline: '2px solid transparent' }], { duration: 1800 });
    }, 60);
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'auction-analysis', version: 1, catalogs, globals, houses: rawHouses, prefs, watch, budget }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `auction-analysis-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importData = async (file: File) => {
    try {
      if (file.size > 20_000_000) throw new Error('too big');
      const d = JSON.parse(await file.text());
      if (d?.app !== 'auction-analysis') throw new Error('wrong file');
      const cats: Catalog[] = Array.isArray(d.catalogs)
        ? d.catalogs
            .filter((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.lots))
            .map((c: any) => ({ ...c, lots: c.lots.filter(looksLikeLot) }))
        : [];
      setCatalogs(cats);
      setActiveId(cats[0]?.id ?? '');
      if (d.globals && typeof d.globals.buyersPremium === 'number') setGlobals(d.globals);
      if (Array.isArray(d.houses)) setHouses(hydrateHouses(d.houses));
      if (d.prefs && typeof d.prefs.channelId === 'string') setPrefs(d.prefs);
      if (Array.isArray(d.watch)) setWatch(d.watch.filter((w: any) => w && typeof w.lotId === 'string'));
      if (typeof d.budget === 'number') setBudget(d.budget);
      flash('Backup restored.');
    } catch {
      flash('That file is not a valid Auction Analysis backup.');
    }
  };

  const resetAll = () => {
    setCatalogs([]);
    setActiveId('');
    setGlobals(DEFAULT_GLOBALS);
    setHouses(DEFAULT_HOUSES);
    setPrefs(DEFAULT_PREFS);
    setWatch([]);
    setBudget(2000);
    setPanel(null);
  };

  const removeCatalog = () => {
    if (!active) return;
    const ids = new Set(active.lots.map((l) => l.id));
    setCatalogs((prev) => prev.filter((c) => c.id !== active.id));
    setWatch((prev) => prev.filter((w) => !ids.has(w.lotId)));
    setActiveId('');
    setPanel(null);
  };

  const calcRow = rows.find((r) => r.lot.id === calcId);
  const marketRow = rows.find((r) => r.lot.id === marketId);

  return (
    <div className="min-h-dvh">
      <Header
        catalogs={catalogs}
        activeId={active?.id ?? ''}
        onActive={setActiveId}
        online={online}
        watchCount={activeWatch.length}
        alertCount={alerts.filter((a) => a.kind === 'danger' || a.kind === 'warn').length}
        canLive={liveRows.length > 0}
        onScan={() => setPanel('scan')}
        onWatch={() => setPanel('watch')}
        onAlerts={() => setPanel('alerts')}
        onLive={() => setLiveId(liveRows[0]?.lot.id ?? null)}
        onSettings={() => setPanel('settings')}
      />

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 pb-16 pt-5">
        {notice && (
          <p className="m-0 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber" role="status">{notice}</p>
        )}

        {!active ? (
          <section className="panel mx-auto mt-6 max-w-2xl p-6 text-center">
            <h2 className="display m-0 text-2xl font-extrabold">Know your real cost before you bid</h2>
            <p className="mx-auto mb-5 mt-2 max-w-md text-mute">
              Scan an auction catalog and get the true cost of each lot, the highest bid that still leaves a profit, and how fast it should resell.
            </p>
            <button className="btn btn-primary mx-auto" onClick={() => setPanel('scan')}>
              <ScanSearch size={16} /> Scan New Auction
            </button>
            <div className="mt-6 text-left">
              <div className="label">Or try a demo catalog (fictional data)</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {listDemoCatalogs().map((d) => (
                  <button key={d.slug} className="btn !h-auto flex-col !items-start gap-0.5 !py-3 text-left" onClick={() => onResult(loadDemoCatalog(d.slug))}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><PlayCircle size={14} className="text-cyan" /> {d.name}</span>
                    <span className="whitespace-normal text-xs font-normal text-mute">{d.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <>
            <SummaryBar summary={summary} tierCounts={tierCounts} tier={tier} onTier={setTier} />
            <BudgetPanel rows={rows} budget={budget} onBudget={setBudget} onWatchAll={(ids) => setWatch((prev) => [...prev, ...ids.filter((id) => !prev.some((w) => w.lotId === id)).map((id) => ({ lotId: id, status: 'Monitoring' as const, myMaxBid: rows.find((r) => r.lot.id === id)?.plan.balanced ?? 0 }))])} />

            <div className="grid gap-3 sm:grid-cols-[1fr_200px_200px]">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input className="field" style={{ paddingLeft: '2.2rem' }} placeholder="Search lots, brands, models" aria-label="Search lots" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="field" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="ALL">All categories</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select className="field" aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="score">Sort: Opportunity score</option>
                <option value="profit">Sort: Net profit</option>
                <option value="roi">Sort: ROI</option>
                <option value="lot">Sort: Lot number</option>
              </select>
            </div>

            {visible.length === 0 ? (
              <p className="panel m-0 p-6 text-center text-mute">No lots match these filters.</p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {visible.slice(0, shown).map((r) => (
                    <ProductCard
                      key={r.lot.id}
                      row={r}
                      watched={watchSet.has(r.lot.id)}
                      onToggleWatch={() => toggleWatch(r.lot.id)}
                      onCalc={() => setCalcId(r.lot.id)}
                      onMarket={() => setMarketId(r.lot.id)}
                    />
                  ))}
                </div>
                {visible.length > shown && (
                  <div className="text-center">
                    <button className="btn" onClick={() => setShown((s) => s + PAGE)}>Show more ({visible.length - shown} left)</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <footer className="pt-6 text-center text-xs text-faint">
          Estimates only, not financial advice. Always check the fees, terms and condition report on the auction page before you bid.
          {active && catalogs.length > 0 && ' Demo lots use fictional data.'}
        </footer>
      </main>

      {panel === 'scan' && <ScanModal health={health} globals={globals} onGlobals={setGlobals} onResult={onResult} onClose={() => setPanel(null)} />}
      {panel === 'watch' && (
        <WatchlistDrawer rows={rows} watch={activeWatch} calibration={calibration} onChange={patchWatch} onRemove={toggleWatch} onLive={(id) => { setPanel(null); setLiveId(id); }} onClose={() => setPanel(null)} />
      )}
      {panel === 'alerts' && <AlertsPanel alerts={alerts} onOpen={openLot} onClose={() => setPanel(null)} />}
      {panel === 'settings' && (
        <SettingsModal
          globals={globals}
          houses={houses}
          prefs={prefs}
          onGlobals={setGlobals}
          onHouses={setHouses}
          onPrefs={setPrefs}
          onExport={exportData}
          onImport={(f) => void importData(f)}
          onRemoveCatalog={removeCatalog}
          onReset={resetAll}
          hasCatalog={Boolean(active)}
          onClose={() => setPanel(null)}
        />
      )}
      {calcRow && (
        <CalculatorModal
          row={calcRow}
          globals={globals}
          customHouses={houses}
          prefs={prefs}
          calibration={calibrationFor(calibration, calcRow.lot.category)}
          onClose={() => setCalcId(null)}
          onHouse={(houseId) => updateLot(calcRow.lot.id, { houseId })}
          onSaveBid={(bid) => updateLot(calcRow.lot.id, { currentBid: bid })}
        />
      )}
      {marketRow && <MarketModal lot={marketRow.lot} calibration={calibrationFor(calibration, marketRow.lot.category)} onClose={() => setMarketId(null)} />}
      {liveId && liveRows.length > 0 && (
        <LiveMode rows={liveRows} lotId={liveId} onSelect={setLiveId} onBid={(id, bid) => updateLot(id, { currentBid: bid })} onClose={() => setLiveId(null)} />
      )}
    </div>
  );
}
