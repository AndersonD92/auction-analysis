import type { Lot, RawLot } from '../types';
import { DEMO_CATALOGS, demoCatalog } from './demoData';
import type { DemoCatalog } from './demoData';
import { detectPlatform, getDirectAuctionLotUrl, houseIdForPlatform } from '../utils/auctionLinks';

/**
 * Cliente da API. Por padrão o app chama o Worker (e a IA). Com VITE_USE_MOCK=true
 * (npm run dev:demo) só os catálogos de exemplo funcionam e nada sai do navegador.
 */
export const isMockMode = import.meta.env.VITE_USE_MOCK === 'true';

export const MAX_PAGES = 10;
export const ENRICH_CHUNK = 6;

export class ApiError extends Error {
  constructor(
    message: string,
    public code = 'error',
    public status = 0,
  ) {
    super(message);
  }
}

export interface Health {
  ok: boolean;
  ai: boolean;
  model: string;
}

export interface ScanProgress {
  stage: 'reading' | 'analyzing';
  done: number;
  total: number;
  message: string;
}

export interface ScanResult {
  name: string;
  catalogUrl: string;
  lots: Lot[];
  warnings: string[];
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('Cancelled.', 'aborted');
    throw new ApiError('Could not reach the server. Check your connection.', 'network');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* corpo não é JSON */
  }
  if (!res.ok) {
    throw new ApiError(data?.error?.message ?? `The server answered with an error (HTTP ${res.status}).`, data?.error?.code ?? 'error', res.status);
  }
  return data as T;
}

export async function fetchHealth(): Promise<Health | null> {
  if (isMockMode) return null;
  try {
    const r = await fetch('/api/health');
    return r.ok ? ((await r.json()) as Health) : null;
  } catch {
    return null;
  }
}

export function listDemoCatalogs(): Pick<DemoCatalog, 'slug' | 'name' | 'description'>[] {
  return DEMO_CATALOGS.map(({ slug, name, description }) => ({ slug, name, description }));
}

export function loadDemoCatalog(slug: string): ScanResult {
  const c = demoCatalog(slug);
  if (!c) throw new ApiError('Demo catalog not found.', 'not_found');
  const houseId = houseIdForPlatform(detectPlatform(c.catalogUrl));
  const lots = c.lots.map((l) => ({ ...l, houseId, directUrl: getDirectAuctionLotUrl(l) }));
  return { name: c.name, catalogUrl: c.catalogUrl, lots, warnings: [] };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Aplica perfil de taxas, link direto e id único aos lotes devolvidos pela IA. */
export function finalizeLots(lots: Lot[], catalogUrl: string, scanId: string, name: string): Lot[] {
  const houseId = houseIdForPlatform(detectPlatform(catalogUrl));
  return lots.map((l) => {
    const withCatalog = { ...l, catalogUrl: catalogUrl || l.catalogUrl, auctionName: name || l.auctionName };
    return {
      ...withCatalog,
      id: `${scanId}-${l.lotNumber}`,
      houseId,
      directUrl: getDirectAuctionLotUrl(withCatalog),
    };
  });
}

/** Analisa lotes brutos com a IA, em pedaços pequenos para caber no tempo do plano gratuito. */
export async function enrichRaw(
  raws: RawLot[],
  ctx: { catalogUrl: string; name: string },
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<{ lots: Lot[]; warnings: string[] }> {
  const lots: Lot[] = [];
  const warnings: string[] = [];
  const parts = chunk(raws, ENRICH_CHUNK);
  const scanId = `s${Date.now().toString(36)}`;
  for (let i = 0; i < parts.length; i++) {
    onProgress?.({
      stage: 'analyzing',
      done: i * ENRICH_CHUNK,
      total: raws.length,
      message: `Researching market prices (${Math.min(raws.length, i * ENRICH_CHUNK + parts[i].length)} of ${raws.length})`,
    });
    try {
      const r = await post<{ lots: Lot[]; warnings: string[] }>(
        '/api/enrich',
        { lots: parts[i], catalogUrl: ctx.catalogUrl, auctionName: ctx.name },
        signal,
      );
      lots.push(...finalizeLots(r.lots, ctx.catalogUrl, scanId, ctx.name));
      warnings.push(...r.warnings);
    } catch (e) {
      // Se a IA não está configurada ou a chave é inválida não adianta tentar os próximos pedaços.
      if (e instanceof ApiError && ['no_key', 'bad_key', 'bad_model', 'aborted'].includes(e.code)) throw e;
      warnings.push(`Lots ${parts[i][0].lotNumber}–${parts[i][parts[i].length - 1].lotNumber} failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }
  if (lots.length === 0 && raws.length > 0) {
    throw new ApiError(warnings[0] ?? 'The AI could not analyze any lot.', 'no_result');
  }
  return { lots, warnings };
}

export type ScanSource =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string; catalogUrl?: string }
  | { kind: 'file'; mimeType: string; data: string; name: string; catalogUrl?: string };

function hostName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Auction';
  }
}

export async function scanSource(
  source: ScanSource,
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<ScanResult> {
  if (isMockMode) {
    throw new ApiError('Live scanning is off in demo mode. Load one of the demo catalogs instead.', 'mock');
  }
  let raws: RawLot[] = [];
  const warnings: string[] = [];
  let catalogUrl = '';
  let name = 'Scanned auction';

  if (source.kind === 'url') {
    catalogUrl = source.url;
    name = `${hostName(source.url)} catalog`;
    let state: unknown = undefined;
    for (let page = 0; page < MAX_PAGES + 2; page++) {
      onProgress?.({ stage: 'reading', done: raws.length, total: 0, message: `Reading catalog pages (${raws.length} lots found)` });
      const r = await post<{ lots: RawLot[]; state: unknown; done: boolean; warnings: string[] }>(
        '/api/crawl',
        { url: source.url, state },
        signal,
      );
      raws.push(...r.lots);
      warnings.push(...r.warnings);
      state = r.state;
      if (r.done) break;
    }
    if (raws.length === 0) {
      const why = warnings.length ? ` Details: ${warnings.slice(0, 2).join(' ')}` : '';
      throw new ApiError(
        `No lots were found on that page.${why} Some sites load their lots with JavaScript or block automatic readers, so try pasting the text or uploading a PDF instead.`,
        'no_lots',
      );
    }
  } else if (source.kind === 'text') {
    catalogUrl = source.catalogUrl ?? '';
    name = catalogUrl ? `${hostName(catalogUrl)} (pasted)` : 'Pasted lots';
    onProgress?.({ stage: 'reading', done: 0, total: 0, message: 'Reading the pasted text' });
    const r = await post<{ lots: RawLot[]; warnings: string[] }>('/api/extract', { text: source.text }, signal);
    raws = r.lots;
    warnings.push(...r.warnings);
  } else {
    catalogUrl = source.catalogUrl ?? '';
    name = source.name;
    onProgress?.({ stage: 'reading', done: 0, total: 0, message: 'Reading the file' });
    const r = await post<{ lots: RawLot[]; warnings: string[] }>(
      '/api/extract',
      { mimeType: source.mimeType, data: source.data },
      signal,
    );
    raws = r.lots;
    warnings.push(...r.warnings);
  }
  if (raws.length === 0) throw new ApiError(warnings[0] ?? 'No lots were found.', 'no_lots');

  // Remove duplicatas por número+título antes de gastar chamadas de IA.
  const seen = new Set<string>();
  raws = raws.filter((r) => {
    const k = `${r.lotNumber}|${r.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const e = await enrichRaw(raws, { catalogUrl, name }, onProgress, signal);
  return { name, catalogUrl, lots: e.lots, warnings: [...warnings, ...e.warnings] };
}
