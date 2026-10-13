import { useEffect, useState } from 'react';
import type { CalibrationRecord, Lot, WatchEntry } from '../types';

export function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`auctionanalysis.${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`auctionanalysis.${key}`, JSON.stringify(value));
    } catch {
      /* cota cheia ou modo privado: seguimos em memória */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Indicador de conexão do navegador, atualizado em tempo real. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/**
 * Compara o que você realmente recebeu na revenda do lote inteiro com o valor de mercado
 * estimado do lote inteiro (p50 por peça × quantidade) e devolve um multiplicador por categoria.
 * Precisa de pelo menos 2 amostras para valer.
 */
export function buildCalibration(entries: WatchEntry[], lots: Lot[]): CalibrationRecord[] {
  const byCategory = new Map<string, number[]>();
  for (const e of entries) {
    if (!e.actualResale || e.actualResale <= 0) continue;
    const lot = lots.find((l) => l.id === e.lotId);
    const expected = lot ? lot.market.p50 * lot.quantity : 0;
    if (!lot || expected <= 0) continue;
    const list = byCategory.get(lot.category) ?? [];
    list.push(e.actualResale / expected);
    byCategory.set(lot.category, list);
  }
  return [...byCategory.entries()].map(([category, ratios]) => ({
    category,
    factor: ratios.reduce((a, b) => a + b, 0) / ratios.length,
    samples: ratios.length,
  }));
}

export function calibrationFor(records: CalibrationRecord[], category: string): number {
  const hit = records.find((r) => r.category === category);
  if (!hit || hit.samples < 2) return 1;
  return Math.min(1.5, Math.max(0.5, hit.factor));
}

export function countDuplicates(lots: Lot[], lot: Lot): number {
  return lots.filter((l) => l.make === lot.make && l.model === lot.model).length;
}
