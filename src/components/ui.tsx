import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Tier } from '../types';
import { TIER_COLOR } from '../lib/pricing';

export function Modal({
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className="display m-0 text-lg font-bold">
            {title}
          </h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="display m-0 text-lg font-bold">{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </>
  );
}

export function TierBadge({ tier, score }: { tier: Tier; score?: number }) {
  return (
    <span className="tier" style={{ ['--tc' as string]: TIER_COLOR[tier] }}>
      {tier}
      {score !== undefined && <span className="num">{score}</span>}
    </span>
  );
}

/** Campo numérico que aceita o campo vazio durante a digitação. */
export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  prefix,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const last = useRef(value);
  useEffect(() => {
    if (last.current !== value) {
      last.current = value;
      setText(String(value));
    }
  }, [value]);
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        {prefix && <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">{prefix}</span>}
        <input
          id={id}
          className="field num"
          style={{ paddingLeft: prefix ? '1.6rem' : undefined, paddingRight: suffix ? '2.4rem' : undefined }}
          inputMode="decimal"
          value={text}
          step={step}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(/,/g, ''));
            if (e.target.value.trim() !== '' && Number.isFinite(n)) {
              const v = Math.max(min, n);
              last.current = v;
              onChange(v);
            }
          }}
          onBlur={() => setText(String(value))}
        />
        {suffix && <span className="num pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint">{suffix}</span>}
      </div>
      {hint && <p className="m-0 mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div className="num truncate text-lg font-semibold" style={{ color: tone }}>
        {value}
      </div>
      {sub && <div className="text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[var(--cyan)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-xl border border-dashed border-line p-4 text-center text-sm text-mute">{children}</p>;
}
