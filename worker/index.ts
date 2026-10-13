import { errorResponse, handleCrawl, handleEnrich, handleExtract, json } from './handlers';

export interface Env {
  ASSETS: Fetcher;
  /** Secret: wrangler secret put GEMINI_API_KEY */
  GEMINI_API_KEY?: string;
  /** Opcional. Padrão: gemini-3.5-flash */
  GEMINI_MODEL?: string;
  /** Opcional. Páginas lidas por chamada ao /api/crawl (1 a 5). Padrão 1 (plano gratuito). */
  CRAWL_PAGES_PER_CALL?: string;
  /** Só para testes locais. Nunca defina em produção. */
  ALLOW_PRIVATE_HOSTS?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/health') {
        return json({ ok: true, ai: Boolean(env.GEMINI_API_KEY), model: env.GEMINI_MODEL || 'gemini-3.5-flash' });
      }
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed.', 405, 'method');
      }
      switch (url.pathname) {
        case '/api/crawl':
          return handleCrawl(request, env);
        case '/api/extract':
          return handleExtract(request, env);
        case '/api/enrich':
          return handleEnrich(request, env);
        default:
          return errorResponse('Not found.', 404, 'not_found');
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
