import * as cheerio from 'cheerio/slim';
import type { RawLot } from '../src/types';

/**
 * Leitura de catálogos de leilão por HTML. Roda dentro do Worker.
 *
 * Duas regras de desenho:
 *  - Uma chamada processa poucas páginas (CRAWL_PAGES_PER_CALL) e devolve o estado para o front-end
 *    pedir a próxima. Assim cada requisição fica curta, o que cabe nos limites do plano gratuito.
 *  - O estado que volta do navegador NUNCA é confiável: só aceitamos URLs do mesmo site do catálogo.
 */

export interface CrawlState {
  /** Próximas páginas a visitar. */
  queue: string[];
  visited: string[];
  /** Quantas páginas já foram lidas no total. */
  pages: number;
}

export interface CrawlStepResult {
  lots: RawLot[];
  state: CrawlState;
  done: boolean;
  warnings: string[];
}

export type FetchHtml = (url: string) => Promise<string>;

const CONTAINER_SELECTOR = [
  '[data-lot-id]',
  '[data-lotid]',
  '[data-lot-number]',
  '.lot-card',
  '.lot-item',
  '.catalog-lot',
  '.hibid-lot-item',
  '.lot-row',
  '.lot',
  '.auction-item',
  '.catalog-item',
  '.item-card',
  '.lotitem',
  'li.lot',
  'article.lot',
  'tr.lot',
].join(',');

const MAX_LOTS_PER_PAGE = 300;

export function parseMoney(text: string | undefined): number {
  if (!text) return 0;
  const m = text.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : 0;
}

export function sanitizeTitle(t: string): string {
  return t
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function absolute(href: string | undefined, base: string): string {
  if (!href) return '';
  try {
    const u = new URL(href, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

/** Bloqueia destinos internos para que o crawler não vire uma porta para a rede privada (SSRF). */
export function isAllowedUrl(raw: string, allowPrivate = false): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (allowPrivate) return true;
  if (u.port && u.port !== '80' && u.port !== '443') return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (!host.includes('.') && !host.includes(':')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
  }
  if (host.includes(':')) {
    // IPv6 literal: não há motivo legítimo para um catálogo usar isso.
    return false;
  }
  return true;
}

function sameSite(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

/** Leitura de um lote percorrendo o nó uma única vez (várias chamadas .find() ficam caras em 100+ lotes). */
function readLot(
  $: cheerio.CheerioAPI,
  el: Parameters<cheerio.CheerioAPI>[0],
  pageUrl: string,
  index: number,
): RawLot | null {
  let title = '';
  let titleHref = '';
  let anyHref = '';
  let img = '';
  let bidText = '';
  let lotNo = '';
  let desc = '';
  let condition = '';

  const root = $(el);
  const dataId = root.attr('data-lot-id') ?? root.attr('data-lotid') ?? '';
  const dataNumber = root.attr('data-lot-number') ?? '';
  const stack = root.children().toArray();
  // Percurso em largura, limitado: nós de lote reais são pequenos.
  let visited = 0;
  while (stack.length && visited < 400) {
    const node = stack.shift()!;
    visited++;
    if (node.type !== 'tag') continue;
    const n = $(node);
    const tag = node.tagName.toLowerCase();
    const cls = (n.attr('class') ?? '').toLowerCase();

    if (tag === 'a') {
      const href = n.attr('href');
      if (href && !anyHref && !href.startsWith('#') && !href.toLowerCase().startsWith('javascript:')) anyHref = href;
      if (!titleHref && href && n.text().trim().length > 4 && !href.startsWith('#')) {
        titleHref = href;
        if (!title) title = n.text();
      }
    }
    if (tag === 'img' && !img) {
      img =
        n.attr('data-src') ?? n.attr('data-original') ?? n.attr('data-lazy-src') ?? n.attr('src') ?? '';
    }
    if (/(^|\s)(lot-title|item-title|title|name|lot-name|lotname)(\s|$)/.test(cls) || /^h[1-6]$/.test(tag)) {
      if (!title || title.length < 4) title = n.text();
    }
    if (/(bid|price|current)/.test(cls) && !bidText) bidText = n.text();
    if (/(lot-?num|lot-?no|lotnumber|lot-id)/.test(cls) && !lotNo) lotNo = n.text();
    if (/(desc|summary|detail)/.test(cls) && !desc) desc = n.text();
    if (/(condition)/.test(cls) && !condition) condition = n.text();

    for (const c of node.children ?? []) if (c.type === 'tag') stack.push(c);
  }

  const cleanTitle = sanitizeTitle(title);
  if (!cleanTitle) return null;

  const numFromText = lotNo.match(/(\d+[A-Za-z]?)/)?.[1];
  const numFromTitle = cleanTitle.match(/^\s*(?:lot|item)\s*#?\s*(\d{1,6})\b/i)?.[1] ?? cleanTitle.match(/^\s*#(\d{1,6})\b/)?.[1];
  const lotNumber = dataNumber || numFromText || dataId || numFromTitle || String(index + 1);

  return {
    lotNumber: String(lotNumber || index + 1),
    title: cleanTitle,
    currentBid: parseMoney(bidText),
    directUrl: absolute(titleHref || anyHref, pageUrl),
    imageUrl: absolute(img, pageUrl),
    description: sanitizeTitle(desc).slice(0, 400),
    condition: condition ? sanitizeTitle(condition).slice(0, 60) : undefined,
    platformLotId: dataId || undefined,
  };
}

export function parseLots(html: string, pageUrl: string): RawLot[] {
  const $ = cheerio.load(html);
  const lots: RawLot[] = [];
  const seen = new Set<string>();
  let nodes = $(CONTAINER_SELECTOR).toArray();
  // Se o seletor pegou contêineres aninhados (.lot dentro de .lot-card), ficamos com os mais externos.
  const set = new Set(nodes);
  nodes = nodes.filter((n) => {
    let p = n.parent;
    while (p) {
      if (set.has(p as typeof n)) return false;
      p = p.parent;
    }
    return true;
  });
  for (let i = 0; i < nodes.length && lots.length < MAX_LOTS_PER_PAGE; i++) {
    const lot = readLot($, nodes[i], pageUrl, i);
    if (!lot) continue;
    const key = `${lot.lotNumber}|${lot.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lots.push(lot);
  }
  return lots;
}

/** Procura o link de próxima página: rel=next, paginação comum, ?page=N ou /page/N. */
export function findNextPages(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();

  const rel = $('a[rel="next"], link[rel="next"]').first().attr('href');
  const relAbs = absolute(rel, pageUrl);
  if (relAbs) out.add(relAbs);

  $('.pagination a, .pager a, nav[aria-label*="agination" i] a, a.next, li.next a').each((_, a) => {
    const href = absolute($(a).attr('href'), pageUrl);
    if (href && href !== pageUrl) out.add(href);
  });

  $('.page-nav a').each((_, a) => {
    const href = absolute($(a).attr('href'), pageUrl);
    if (href && href !== pageUrl) out.add(href);
  });

  $('a[href]').each((_, a) => {
    const href = absolute($(a).attr('href'), pageUrl);
    if (!href) return;
    if (/[?&](?:page|p|pg)=\d+/i.test(href) || /\/page\/\d+/i.test(href)) out.add(href);
  });

  return [...out].filter((u) => sameSite(u, pageUrl));
}

function normalize(u: string): string {
  try {
    const x = new URL(u);
    x.hash = '';
    return x.toString();
  } catch {
    return u;
  }
}

const PAGE_PARAM = /([?&])(page|p|pg)=(\d+)/i;

/**
 * Sonda automática: se a URL tem ?page=N mas a página não mostra link de paginação,
 * tentamos a página N+1. Quando a próxima vier sem lotes, a sonda para sozinha.
 */
export function probeNext(url: string): string | null {
  const m = url.match(PAGE_PARAM);
  if (!m) return null;
  return url.replace(PAGE_PARAM, `${m[1]}${m[2]}=${Number(m[3]) + 1}`);
}

export function emptyState(startUrl: string): CrawlState {
  return { queue: [normalize(startUrl)], visited: [], pages: 0 };
}

/** Limpa o estado vindo do navegador: só URLs http(s) permitidas e do mesmo site do catálogo. */
export function sanitizeCrawlState(raw: unknown, startUrl: string, allowPrivate = false): CrawlState {
  const s = (raw ?? {}) as Partial<CrawlState>;
  const ok = (u: unknown): u is string =>
    typeof u === 'string' && u.length < 2000 && isAllowedUrl(u, allowPrivate) && sameSite(u, startUrl);
  const queue = Array.isArray(s.queue) ? s.queue.filter(ok).map(normalize).slice(0, 50) : [];
  const visited = Array.isArray(s.visited) ? s.visited.filter(ok).map(normalize).slice(0, 200) : [];
  const pages = Number.isFinite(s.pages) ? Math.max(0, Math.min(1000, Math.floor(s.pages as number))) : 0;
  return { queue, visited, pages };
}

export async function crawlStep(opts: {
  startUrl: string;
  state: CrawlState;
  fetchHtml: FetchHtml;
  pagesThisCall: number;
  maxPages: number;
  allowPrivate?: boolean;
}): Promise<CrawlStepResult> {
  const { fetchHtml, maxPages, pagesThisCall, startUrl } = opts;
  const allowPrivate = opts.allowPrivate ?? false;
  const state: CrawlState = {
    queue: [...opts.state.queue],
    visited: [...opts.state.visited],
    pages: opts.state.pages,
  };
  const visited = new Set(state.visited);
  const lots: RawLot[] = [];
  const warnings: string[] = [];
  let thisCall = 0;

  while (state.queue.length && thisCall < pagesThisCall && state.pages < maxPages) {
    const url = state.queue.shift()!;
    if (visited.has(url)) continue;
    if (!isAllowedUrl(url, allowPrivate)) {
      warnings.push(`Skipped a blocked address: ${url}`);
      continue;
    }
    visited.add(url);
    state.visited.push(url);
    state.pages++;
    thisCall++;
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (e) {
      warnings.push(`Could not read ${url}: ${e instanceof Error ? e.message : 'unknown error'}`);
      continue;
    }
    const found = parseLots(html, url);
    lots.push(...found);
    const nexts = findNextPages(html, url);
    if (nexts.length === 0 && found.length > 0) {
      const probe = probeNext(url);
      if (probe) nexts.push(probe);
    }
    for (const next of nexts) {
      const n = normalize(next);
      if (!visited.has(n) && !state.queue.includes(n) && isAllowedUrl(n, allowPrivate) && sameSite(n, startUrl)) {
        state.queue.push(n);
      }
    }
    if (state.queue.length > 50) state.queue.length = 50;
  }

  const done = state.queue.length === 0 || state.pages >= maxPages;
  if (state.pages >= maxPages && state.queue.length) {
    warnings.push(`Stopped after ${maxPages} pages. There may be more lots in this catalog.`);
  }
  return { lots, state, done, warnings };
}

/** Atalho usado nos testes e em usos de uma chamada só. */
export async function crawlAuctionCatalog(
  url: string,
  fetchHtml: FetchHtml,
  maxPages = 10,
  allowPrivate = false,
): Promise<{ lots: RawLot[]; warnings: string[] }> {
  let state = emptyState(url);
  const lots: RawLot[] = [];
  const warnings: string[] = [];
  for (let guard = 0; guard < maxPages + 2; guard++) {
    const r = await crawlStep({ startUrl: url, state, fetchHtml, pagesThisCall: 3, maxPages, allowPrivate });
    lots.push(...r.lots);
    warnings.push(...r.warnings);
    state = r.state;
    if (r.done) break;
  }
  return { lots, warnings };
}

const MAX_BYTES = 2_500_000;
const TIMEOUT_MS = 12_000;

export function makeFetchHtml(allowPrivate = false): FetchHtml {
  return async (url: string) => {
    if (!isAllowedUrl(url, allowPrivate)) throw new Error('Address not allowed');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; AuctionAnalysis/1.0)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (res.url && !isAllowedUrl(res.url, allowPrivate)) throw new Error('Redirected to a blocked address');
      const type = res.headers.get('content-type') ?? '';
      if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) throw new Error('Not an HTML page');
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) throw new Error('Page is too large');
      const charset = type.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8';
      try {
        return new TextDecoder(charset).decode(buf);
      } catch {
        return new TextDecoder('utf-8').decode(buf);
      }
    } finally {
      clearTimeout(timer);
    }
  };
}
