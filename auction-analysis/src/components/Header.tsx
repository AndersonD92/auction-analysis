import { Bell, Gauge, Radio, ScanSearch, Settings, Star, Wifi, WifiOff } from 'lucide-react';
import type { Catalog } from '../types';

export default function Header({
  catalogs,
  activeId,
  onActive,
  online,
  watchCount,
  alertCount,
  canLive,
  onScan,
  onWatch,
  onAlerts,
  onLive,
  onSettings,
}: {
  catalogs: Catalog[];
  activeId: string;
  onActive: (id: string) => void;
  online: boolean;
  watchCount: number;
  alertCount: number;
  canLive: boolean;
  onScan: () => void;
  onWatch: () => void;
  onAlerts: () => void;
  onLive: () => void;
  onSettings: () => void;
}) {
  const badge = (n: number, color: string) =>
    n > 0 ? (
      <span className="num absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.65rem] font-bold" style={{ background: color, color: '#04141c' }}>
        {n > 99 ? '99+' : n}
      </span>
    ) : null;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--cyan) 16%, transparent)', color: 'var(--cyan)' }}>
            <Gauge size={20} />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="display m-0 text-lg font-extrabold">Auction Analysis</h1>
            {catalogs.length <= 1 ? (
              <p className="m-0 max-w-[46vw] truncate text-xs text-mute sm:max-w-[320px]">{catalogs[0]?.name ?? 'No catalog open'}</p>
            ) : (
              <select aria-label="Active catalog" className="m-0 max-w-[46vw] cursor-pointer truncate border-0 bg-transparent p-0 text-xs text-mute sm:max-w-[320px]" value={activeId} onChange={(e) => onActive(e.target.value)}>
                {catalogs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="chip hidden sm:inline-flex" title={online ? 'Connected' : 'No connection: saved data still works'} style={{ color: online ? 'var(--go)' : 'var(--amber)' }}>
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {online ? 'Online' : 'Offline'}
          </span>
          {!online && <WifiOff size={18} className="text-amber sm:hidden" aria-label="Offline" />}
          <button className="btn btn-primary" onClick={onScan}>
            <ScanSearch size={16} /> <span className="hidden sm:inline">Scan New Auction</span><span className="sm:hidden">Scan</span>
          </button>
          <button className="btn btn-icon relative" onClick={onWatch} aria-label={`Watchlist, ${watchCount} lots`}>
            <Star size={18} />
            {badge(watchCount, 'var(--amber)')}
          </button>
          <button className="btn btn-icon relative" onClick={onAlerts} aria-label={`Alerts, ${alertCount}`}>
            <Bell size={18} />
            {badge(alertCount, 'var(--stop)')}
          </button>
          <button className="btn btn-icon" onClick={onLive} disabled={!canLive} aria-label="Live auction mode" title={canLive ? 'Live auction mode' : 'Add a lot to the watchlist first'}>
            <Radio size={18} />
          </button>
          <button className="btn btn-icon" onClick={onSettings} aria-label="Settings">
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
