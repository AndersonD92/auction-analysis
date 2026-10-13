import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { AppAlert } from '../lib/alerts';
import { Drawer, EmptyNote } from './ui';

const ICON = {
  danger: <AlertOctagon size={18} className="text-stop" />,
  warn: <AlertTriangle size={18} className="text-amber" />,
  good: <CheckCircle2 size={18} className="text-go" />,
  info: <Info size={18} className="text-cyan" />,
};

export default function AlertsPanel({ alerts, onOpen, onClose }: { alerts: AppAlert[]; onOpen: (lotId: string) => void; onClose: () => void }) {
  return (
    <Drawer title={`Alerts (${alerts.length})`} onClose={onClose}>
      {alerts.length === 0 ? (
        <EmptyNote>Nothing needs your attention. Alerts appear when a watched lot nears your ceiling, is about to close, or when a strong buy is not on your list.</EmptyNote>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {alerts.map((a) => (
            <li key={a.id}>
              <button className="btn !h-auto w-full !items-start justify-start gap-3 !py-3 text-left" onClick={() => { onOpen(a.lotId); onClose(); }}>
                <span className="mt-0.5">{ICON[a.kind]}</span>
                <span className="min-w-0 whitespace-normal">
                  <span className="block text-sm font-semibold">{a.title}</span>
                  <span className="block text-xs font-normal text-mute">{a.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
