import type { RawLot } from '../src/types';

/**
 * Leitor para sites de leilão feitos na plataforma NextLot (ex.: bidfischer.com).
 *
 * Esses sites não trazem os lotes no HTML: a página abre vazia e o navegador busca a lista numa API
 * pública (api-frontend.nextlot.net). Em vez de tentar ler o HTML, o Worker chama essa mesma API,
 * que devolve JSON limpo, 48 lotes por página.
 *
 * Dois tipos de endereço funcionam:
 *  - o endereço da página do site conhecido, por exemplo https://bidfischer.com/auctions/1870203/lots?page=1
 *  - o endereço da própria API, colado direto (útil para outros sites NextLot).
 *
 * Para outros sites NextLot pelo endereço da página, é preciso incluir o número do site em KNOWN_SITES.
 * Esse número aparece no endereço da API: .../sites/<número>/auctions/...
 */

export type FetchJson = (url: string) => Promise<unknown>;

export const NEXTLOT_API = 'https://api-frontend.nextlot.net/api/frontend/v1';
const API_HOST = 'api-frontend.nextlot.net';

/** Domínio (sem www) → número do site na NextLot. */
export const KNOWN_SITES: Record<string, number> = {
  'bidfischer.com': 2227058,
};

export interface NextlotTarget {
  siteId: number;
  auctionId: number;
  page: number;
  /** true quando o endereço colado era o da API. Nesse caso não dá para montar o link da página do lote. */
  fromApi: boolean;
  /** Endereço mostrado ao usuário para uma página da lista (também usado como fila do crawler). */
  pageUrl: (page: number) => string;
  /** Endereço da API para uma página. */
  apiUrl: (page: number) => string;
}

function toPage(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export function nextlotTarget(raw: string): NextlotTarget | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');

  const apiMatch = u.pathname.match(/^\/api\/frontend\/v1\/sites\/(\d+)\/auctions\/(\d+)\/lots\/?$/);
  if (host === API_HOST && apiMatch) {
    const siteId = Number(apiMatch[1]);
    const auctionId = Number(apiMatch[2]);
    const api = (page: number) =>
      `${NEXTLOT_API}/sites/${siteId}/auctions/${auctionId}/lots?page_number=${page}&details_level=minimal`;
    return {
      siteId,
      auctionId,
      page: toPage(u.searchParams.get('page_number')),
      fromApi: true,
      pageUrl: api,
      apiUrl: api,
    };
  }

  const siteId = KNOWN_SITES[host];
  const pageMatch = u.pathname.match(/^\/auctions\/(\d+)[^/]*\/lots\/?$/);
  if (siteId && pageMatch) {
    const auctionId = Number(pageMatch[1]);
    const origin = u.origin;
    const path = u.pathname;
    return {
      siteId,
      auctionId,
      page: toPage(u.searchParams.get('page')),
      fromApi: false,
      pageUrl: (page: number) => `${origin}${path}?page=${page}`,
      apiUrl: (page: number) =>
        `${NEXTLOT_API}/sites/${siteId}/auctions/${auctionId}/lots?page_number=${page}&details_level=minimal`,
    };
  }
  return null;
}

/** Lotes de aviso (como "How to Bid" ou "Pickup / Payment Information") não são itens à venda. */
const INFO_NAME =
  /\b(how to bid|winning a lot|linked lots|bid extensions?|pickup|payment information|tax exempt|terms (and|&) conditions|buyer'?s premium|shipping information|directions|important notice)\b/i;
const INFO_NUMBER = /^[A-Za-z]{1,3}$/;

const clean = (t: unknown, max: number): string =>
  String(t ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const asCents = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n / 100 : 0;
};

export interface NextlotPage {
  lots: RawLot[];
  page: number;
  pagesCount: number;
  totalCount: number;
  skipped: number;
}

export function parseNextlotPage(json: unknown, target: NextlotTarget, requestedPage: number): NextlotPage {
  const o = (json ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.data)) {
    throw new Error('The auction service answered in a format this app does not recognize.');
  }
  const lots: RawLot[] = [];
  let skipped = 0;
  for (const item of o.data.slice(0, 500)) {
    const l = (item ?? {}) as Record<string, unknown>;
    const number = clean(l.number, 40);
    const title = clean(l.name, 200);
    if (!number || !title || INFO_NUMBER.test(number) || INFO_NAME.test(title)) {
      skipped++;
      continue;
    }
    const qty = Number(l.quantity);
    const bids = Number(l.bids_count);
    const parts: string[] = [];
    if (Number.isFinite(qty) && qty > 1) parts.push(`Quantity: ${qty}.`);
    if (Number.isFinite(bids) && bids >= 0) parts.push(`Bids so far: ${bids}.`);
    const start = asCents(l.starting_bid_amount_cents);
    if (start > 0) parts.push(`Starting bid: $${start}.`);
    const image = typeof l.focal_media_file_url_thumb_image === 'string' ? l.focal_media_file_url_thumb_image : '';
    lots.push({
      lotNumber: number,
      title,
      currentBid: asCents(l.leading_bid_amount_cents),
      // Só montamos o link quando sabemos a página real da lista; abrir essa página leva ao lote.
      directUrl: target.fromApi ? '' : target.pageUrl(requestedPage),
      imageUrl: image.startsWith('https://') ? image.slice(0, 500) : '',
      description: parts.join(' '),
      platformLotId: l.id === undefined || l.id === null ? undefined : clean(l.id, 30),
    });
  }
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    lots,
    page: num(o.page_number, requestedPage),
    pagesCount: Math.max(0, Math.min(10_000, num(o.pages_count, 0))),
    totalCount: Math.max(0, num(o.total_count, lots.length)),
    skipped,
  };
}

/** Lê uma página da API e devolve os lotes, mais o endereço da próxima página (se existir). */
export async function readNextlotPage(
  target: NextlotTarget,
  page: number,
  fetchJson: FetchJson,
): Promise<{ lots: RawLot[]; nextPageUrl: string | null; totalCount: number; skipped: number }> {
  const json = await fetchJson(target.apiUrl(page));
  const r = parseNextlotPage(json, target, page);
  const hasMore = r.pagesCount > page && r.lots.length + r.skipped > 0;
  return {
    lots: r.lots,
    nextPageUrl: hasMore ? target.pageUrl(page + 1) : null,
    totalCount: r.totalCount,
    skipped: r.skipped,
  };
}

const MAX_BYTES = 2_500_000;
const TIMEOUT_MS = 12_000;

/** Busca JSON só no servidor da NextLot. Qualquer outro endereço é recusado. */
export function makeFetchJson(): FetchJson {
  return async (url: string) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new Error('Address not allowed');
    }
    if (u.protocol !== 'https:' || u.hostname !== API_HOST || !u.pathname.startsWith('/api/frontend/v1/')) {
      throw new Error('Address not allowed');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(u.toString(), {
        signal: ctrl.signal,
        // O Workers não aceita redirect: 'error'. Com 'manual' recebemos o 3xx e recusamos nós mesmos.
        redirect: 'manual',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; AuctionAnalysis/1.0)',
          accept: 'application/json',
        },
      });
      if (res.status >= 300 && res.status < 400) throw new Error('The auction service redirected the request');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) throw new Error('Response is too large');
      try {
        return JSON.parse(new TextDecoder('utf-8').decode(buf));
      } catch {
        throw new Error('The auction service did not answer with JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  };
}
