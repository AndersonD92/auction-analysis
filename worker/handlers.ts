import type { RawLot } from '../src/types';
import { crawlStep, emptyState, isAllowedUrl, makeFetchHtml, sanitizeCrawlState, sanitizeTitle } from './auctionCrawler';
import type { FetchHtml } from './auctionCrawler';
import { analyzeLots, extractLots, GeminiError, MAX_ENRICH_LOTS } from './gemini';
import type { GeminiConfig } from './gemini';

export interface HandlerEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  CRAWL_PAGES_PER_CALL?: string;
  ALLOW_PRIVATE_HOSTS?: string;
}

export const MAX_PAGES = 10;
const MAX_BODY_BYTES = 8_000_000;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function errorResponse(message: string, status: number, code: string): Response {
  return json({ error: { message, code } }, status);
}

/** Lê o corpo JSON com limite de tamanho, sem confiar no Content-Length. */
export async function readJson(req: Request, limit = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > limit) throw new GeminiError('The request is too large.', 413, 'too_large');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > limit) throw new GeminiError('The request is too large.', 413, 'too_large');
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new GeminiError('The request body is not valid JSON.', 400, 'bad_json');
  }
}

function geminiConfig(env: HandlerEnv): GeminiConfig | null {
  if (!env.GEMINI_API_KEY) return null;
  return { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined };
}

const NO_KEY = () =>
  errorResponse(
    'The AI is not set up yet. Add the GEMINI_API_KEY secret to the Worker (see PASSO-A-PASSO).',
    503,
    'no_key',
  );

function guard(e: unknown): Response {
  if (e instanceof GeminiError) return errorResponse(e.message, e.status, e.code);
  return errorResponse('Something went wrong on the server.', 500, 'internal');
}

function pagesPerCall(env: HandlerEnv): number {
  const v = Number(env.CRAWL_PAGES_PER_CALL);
  return Number.isFinite(v) && v >= 1 ? Math.min(5, Math.floor(v)) : 1;
}

/** Uma chamada lê poucas páginas e devolve o estado para a próxima. */
export async function handleCrawl(
  req: Request,
  env: HandlerEnv,
  fetchHtml: FetchHtml = makeFetchHtml(env.ALLOW_PRIVATE_HOSTS === 'true'),
): Promise<Response> {
  try {
    const body = (await readJson(req, 50_000)) as { url?: unknown; state?: unknown };
    const allowPrivate = env.ALLOW_PRIVATE_HOSTS === 'true';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url || url.length > 2000 || !isAllowedUrl(url, allowPrivate)) {
      return errorResponse('Enter a valid public http(s) address.', 400, 'bad_url');
    }
    const state = body.state ? sanitizeCrawlState(body.state, url, allowPrivate) : emptyState(url);
    if (!body.state) state.queue = [url];
    const r = await crawlStep({
      startUrl: url,
      state,
      fetchHtml,
      pagesThisCall: pagesPerCall(env),
      maxPages: MAX_PAGES,
      allowPrivate,
    });
    return json({ lots: r.lots, state: r.state, done: r.done, warnings: r.warnings });
  } catch (e) {
    return guard(e);
  }
}

export async function handleExtract(req: Request, env: HandlerEnv): Promise<Response> {
  const cfg = geminiConfig(env);
  if (!cfg) return NO_KEY();
  try {
    const body = (await readJson(req)) as { text?: unknown; mimeType?: unknown; data?: unknown };
    const input = {
      text: typeof body.text === 'string' ? body.text : undefined,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
      data: typeof body.data === 'string' ? body.data : undefined,
    };
    if (input.data && !/^[A-Za-z0-9+/=\s]+$/.test(input.data.slice(0, 2000))) {
      return errorResponse('The file data is not valid base64.', 400, 'bad_data');
    }
    const r = await extractLots(cfg, input);
    return json(r);
  } catch (e) {
    return guard(e);
  }
}

export function sanitizeRaw(x: unknown): RawLot | null {
  const o = (x ?? {}) as Record<string, unknown>;
  const title = sanitizeTitle(String(o.title ?? ''));
  if (!title) return null;
  const bid = Number(o.currentBid);
  const url = (v: unknown) => {
    const s = typeof v === 'string' ? v.slice(0, 1000) : '';
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
    } catch {
      return '';
    }
  };
  return {
    lotNumber: String(o.lotNumber ?? '').slice(0, 20) || '0',
    title,
    currentBid: Number.isFinite(bid) && bid >= 0 ? Math.min(bid, 10_000_000) : 0,
    directUrl: url(o.directUrl),
    imageUrl: url(o.imageUrl),
    description: sanitizeTitle(String(o.description ?? '')).slice(0, 400),
    condition: o.condition ? sanitizeTitle(String(o.condition)).slice(0, 60) : undefined,
    platformLotId: o.platformLotId ? String(o.platformLotId).slice(0, 60) : undefined,
  };
}

export async function handleEnrich(req: Request, env: HandlerEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const cfg = geminiConfig(env);
  if (!cfg) return NO_KEY();
  try {
    const body = (await readJson(req, 200_000)) as {
      lots?: unknown;
      catalogUrl?: unknown;
      auctionName?: unknown;
    };
    if (!Array.isArray(body.lots) || body.lots.length === 0) {
      return errorResponse('Send at least one lot to analyze.', 400, 'no_lots');
    }
    if (body.lots.length > MAX_ENRICH_LOTS) {
      return errorResponse(`Send at most ${MAX_ENRICH_LOTS} lots per request.`, 400, 'too_many');
    }
    const raws = body.lots.map(sanitizeRaw).filter((r): r is RawLot => r !== null);
    const catalogUrl = typeof body.catalogUrl === 'string' && isAllowedUrl(body.catalogUrl, true) ? body.catalogUrl : undefined;
    const auctionName = typeof body.auctionName === 'string' ? sanitizeTitle(body.auctionName).slice(0, 120) : '';
    const r = await analyzeLots(cfg, raws, { catalogUrl, auctionName }, fetchImpl);
    return json(r);
  } catch (e) {
    return guard(e);
  }
}
