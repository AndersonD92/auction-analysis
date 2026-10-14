import { describe, expect, it } from 'vitest';
import {
  analyzeLots,
  callGemini,
  extractLots,
  GeminiError,
  normalizeCondition,
  normalizeMarket,
  parseJsonLoose,
} from './gemini';
import { handleEnrich, handleExtract, handleCrawl, sanitizeRaw } from './handlers';
import type { RawLot } from '../src/types';

const raw = (n: string, title = 'Dell Latitude 7420 laptop lot'): RawLot => ({
  lotNumber: n,
  title,
  currentBid: 100,
  directUrl: 'https://x.hibid.com/catalog/1/lot/' + n,
  imageUrl: '',
  description: '',
});

const gemResponse = (text: string, extra: object = {}) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], ...extra }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** Simula o Gemini: 1ª chamada devolve pesquisa, 2ª devolve JSON. Guarda o que foi enviado. */
function fakeGemini(json: unknown) {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    return calls.length === 1 ? gemResponse('[0] research notes') : gemResponse(JSON.stringify(json));
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const goodItem = {
  index: 0,
  make: 'Dell',
  model: 'Latitude 7420',
  category: 'IT Equipment',
  condition: 'Used - Tested',
  quantity: 8,
  weightLb: 32,
  shippingEstimate: 25,
  priceMedian: 315,
  priceP25: 280,
  priceP75: 340,
  priceLow: 240,
  priceHigh: 380,
  confidence: 0.9,
  daysToSell: 6,
  comps: [{ title: 'Latitude 7420', price: 320, soldAt: '2026-09-20', source: 'eBay' }],
  risks: ['No adapters'],
  thesis: 'Fast turnover.',
};

describe('parseJsonLoose', () => {
  it('lê JSON puro, com cercas e com texto em volta', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Here you go: {"a":1} thanks')).toEqual({ a: 1 });
  });
  it('lança erro claro para lixo', () => {
    expect(() => parseJsonLoose('nothing here')).toThrow(GeminiError);
  });
});

describe('normalizeCondition', () => {
  it('mapeia textos livres para as 5 condições do manual', () => {
    expect(normalizeCondition('Brand New')).toBe('Brand New');
    expect(normalizeCondition('new in box')).toBe('Brand New');
    expect(normalizeCondition('open box')).toBe('Open Box');
    expect(normalizeCondition('Used, tested and working')).toBe('Used - Tested');
    expect(normalizeCondition('customer returns, untested')).toBe('Used - Untested / As-Is');
    expect(normalizeCondition('sold as-is')).toBe('Used - Untested / As-Is');
    expect(normalizeCondition('for parts or repair')).toBe('For Parts / Repair');
    expect(normalizeCondition(undefined)).toBe('Used - Untested / As-Is');
  });
});

describe('normalizeMarket', () => {
  it('ordena os percentis e preenche faltas', () => {
    const m = normalizeMarket({ priceMedian: 100, priceP25: 150, priceP75: 50, priceLow: 500, priceHigh: 1 })!;
    expect(m.low).toBeLessThanOrEqual(m.p25);
    expect(m.p25).toBeLessThanOrEqual(m.p50);
    expect(m.p50).toBeLessThanOrEqual(m.p75);
    expect(m.p75).toBeLessThanOrEqual(m.high);
  });
  it('rejeita mediana inválida e limita confiança sem comparáveis', () => {
    expect(normalizeMarket({ priceMedian: 0 })).toBeNull();
    expect(normalizeMarket({ priceMedian: 'abc' })).toBeNull();
    expect(normalizeMarket({ priceMedian: 100, confidence: 0.95 })!.confidence).toBe(0.4);
  });
  it('classifica a velocidade pelos dias', () => {
    expect(normalizeMarket({ priceMedian: 100, daysToSell: 3 })!.sellSpeed).toBe('Fast');
    expect(normalizeMarket({ priceMedian: 100, daysToSell: 40 })!.sellSpeed).toBe('Slow');
  });
});

describe('analyzeLots (fluxo de duas chamadas)', () => {
  it('pesquisa com busca ligada e estrutura sem busca, chave no cabeçalho', async () => {
    const { impl, calls } = fakeGemini({ lots: [goodItem] });
    const r = await analyzeLots({ apiKey: 'SECRET-KEY' }, [raw('141')], { catalogUrl: 'https://x.hibid.com/catalog/1/a' }, impl);
    expect(calls).toHaveLength(2);
    expect(calls[0].body.tools).toEqual([{ google_search: {} }]);
    expect(calls[0].body.generationConfig.responseJsonSchema).toBeUndefined();
    expect(calls[1].body.tools).toBeUndefined();
    expect(calls[1].body.generationConfig.responseMimeType).toBe('application/json');
    expect(calls[1].body.generationConfig.responseJsonSchema).toBeDefined();
    for (const c of calls) {
      expect(c.headers['x-goog-api-key']).toBe('SECRET-KEY');
      expect(c.url).not.toContain('SECRET-KEY');
      expect(c.url).toContain('gemini-3.8-flash');
    }
    expect(r.lots).toHaveLength(1);
    expect(r.lots[0]).toMatchObject({ lotNumber: '141', make: 'Dell', quantity: 8, logistics: 25, condition: 'Used - Tested' });
    expect(r.lots[0].market.p50).toBe(315);
  });

  it('usa o modelo de GEMINI_MODEL', async () => {
    const { impl, calls } = fakeGemini({ lots: [goodItem] });
    await analyzeLots({ apiKey: 'k', model: 'gemini-3.8-flash' }, [raw('1')], {}, impl);
    expect(calls[0].url).toContain('gemini-3.8-flash');
  });

  it('descarta lote sem preço confiável e avisa; ignora índices inválidos', async () => {
    const { impl } = fakeGemini({ lots: [{ ...goodItem, priceMedian: 0 }, { ...goodItem, index: 9 }] });
    const r = await analyzeLots({ apiKey: 'k' }, [raw('1')], {}, impl);
    expect(r.lots).toHaveLength(0);
    expect(r.warnings.join(' ')).toMatch(/no reliable market price/);
  });

  it('avisa quando a IA esquece um lote', async () => {
    const { impl } = fakeGemini({ lots: [goodItem] });
    const r = await analyzeLots({ apiKey: 'k' }, [raw('1'), raw('2')], {}, impl);
    expect(r.lots).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/Lot 2/);
  });

  it('não confia em campos fora de faixa', async () => {
    const { impl } = fakeGemini({
      lots: [{ ...goodItem, quantity: -5, weightLb: 1e9, shippingEstimate: -10, confidence: 7, risks: 'not-array' }],
    });
    const r = await analyzeLots({ apiKey: 'k' }, [raw('1')], {}, impl);
    expect(r.lots[0].quantity).toBe(1);
    expect(r.lots[0].weightLb).toBe(5000);
    expect(r.lots[0].logistics).toBe(0);
    expect(r.lots[0].market.confidence).toBeLessThanOrEqual(1);
    expect(r.lots[0].risks).toEqual([]);
  });
});

describe('erros do Gemini', () => {
  const status = (s: number, body = '{}') => (async () => new Response(body, { status: s })) as unknown as typeof fetch;
  it('traduz chave inválida, modelo ausente e limite de uso', async () => {
    await expect(callGemini({ apiKey: 'k' }, { parts: [{ text: 'x' }] }, status(400, 'API key not valid'))).rejects.toMatchObject({
      code: 'bad_key',
    });
    await expect(callGemini({ apiKey: 'k', model: 'm' }, { parts: [{ text: 'x' }] }, status(404))).rejects.toThrow(/GEMINI_MODEL/);
    await expect(callGemini({ apiKey: 'k' }, { parts: [{ text: 'x' }] }, status(429))).rejects.toMatchObject({ status: 429 });
  });
  it('trata resposta vazia e bloqueio', async () => {
    const empty = (async () => new Response(JSON.stringify({ candidates: [] }))) as unknown as typeof fetch;
    await expect(callGemini({ apiKey: 'k' }, { parts: [{ text: 'x' }] }, empty)).rejects.toMatchObject({ code: 'empty' });
    const blocked = (async () =>
      new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }))) as unknown as typeof fetch;
    await expect(callGemini({ apiKey: 'k' }, { parts: [{ text: 'x' }] }, blocked)).rejects.toMatchObject({ code: 'blocked' });
  });
  it('detecta resposta estruturada cortada', async () => {
    const cut = (async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"lots":[' }] }, finishReason: 'MAX_TOKENS' }] }),
      )) as unknown as typeof fetch;
    await expect(callGemini({ apiKey: 'k' }, { parts: [{ text: 'x' }], schema: {} }, cut)).rejects.toMatchObject({
      code: 'truncated',
    });
  });
});

describe('modelo reserva', () => {
  it('troca de modelo quando o principal responde 503, e para nos erros que trocar não resolve', async () => {
    const urls: string[] = [];
    const impl = (async (url: string) => {
      urls.push(url);
      return url.includes('gemini-3.8-flash') ? new Response('{}', { status: 503 }) : gemResponse('ok');
    }) as unknown as typeof fetch;
    const out = await callGemini({ apiKey: 'k' }, { parts: [{ text: 'x' }] }, impl);
    expect(out).toBe('ok');
    expect(urls.some((u) => u.includes('gemini-3.6-flash'))).toBe(true);

    let calls = 0;
    const badKey = (async () => {
      calls++;
      return new Response('API key not valid', { status: 400 });
    }) as unknown as typeof fetch;
    await expect(callGemini({ apiKey: 'k' }, { parts: [{ text: 'x' }] }, badKey)).rejects.toMatchObject({ code: 'bad_key' });
    expect(calls).toBe(1);
  });
});

describe('extractLots', () => {
  it('lê lotes de texto colado e evita números repetidos', async () => {
    const impl = (async () =>
      gemResponse(
        JSON.stringify({
          lots: [
            { lotNumber: '1', title: 'Fluke 87V', currentBid: 50 },
            { lotNumber: '1', title: 'Hakko FX-951' },
            { lotNumber: '', title: '' },
          ],
        }),
      )) as unknown as typeof fetch;
    const r = await extractLots({ apiKey: 'k' }, { text: 'Lot 1 Fluke 87V...' }, impl);
    expect(r.lots).toHaveLength(2);
    expect(new Set(r.lots.map((l) => l.lotNumber)).size).toBe(2);
  });
  it('envia PDF/imagem como inlineData e recusa tipos não permitidos', async () => {
    let sent: any;
    const impl = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return gemResponse('{"lots":[]}');
    }) as unknown as typeof fetch;
    const r = await extractLots({ apiKey: 'k' }, { mimeType: 'application/pdf', data: 'AAAA' }, impl);
    expect(sent.contents[0].parts[1].inlineData.mimeType).toBe('application/pdf');
    expect(r.warnings.join(' ')).toMatch(/No lots/);
    await expect(extractLots({ apiKey: 'k' }, { mimeType: 'text/html', data: 'AAAA' }, impl)).rejects.toMatchObject({ status: 415 });
    await expect(extractLots({ apiKey: 'k' }, {}, impl)).rejects.toMatchObject({ code: 'empty_input' });
  });
});

describe('handlers', () => {
  const post = (body: unknown) =>
    new Request('https://app.test/api/x', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('enrich e extract respondem 503 sem chave, sem quebrar', async () => {
    const a = await handleEnrich(post({ lots: [raw('1')] }), {});
    expect(a.status).toBe(503);
    expect(((await a.json()) as any).error.code).toBe('no_key');
    expect((await handleExtract(post({ text: 'x' }), {})).status).toBe(503);
  });

  it('enrich valida a entrada', async () => {
    const env = { GEMINI_API_KEY: 'k' };
    expect((await handleEnrich(post({ lots: [] }), env)).status).toBe(400);
    expect((await handleEnrich(post({}), env)).status).toBe(400);
    expect((await handleEnrich(post('not json'), env)).status).toBe(400);
    expect((await handleEnrich(post({ lots: Array.from({ length: 9 }, (_, i) => raw(String(i))) }), env)).status).toBe(400);
  });

  it('enrich funciona de ponta a ponta com Gemini simulado', async () => {
    const { impl } = fakeGemini({ lots: [goodItem] });
    const res = await handleEnrich(post({ lots: [raw('141')], auctionName: 'Test' }), { GEMINI_API_KEY: 'k' }, impl);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.lots[0].auctionName).toBe('Test');
  });

  it('crawl recusa endereços internos e entradas ruins', async () => {
    for (const url of ['http://169.254.169.254/', 'http://localhost/', 'file:///etc/passwd', '', 5]) {
      const r = await handleCrawl(post({ url }), {}, async () => '');
      expect(r.status, String(url)).toBe(400);
    }
  });

  it('crawl devolve lotes e estado', async () => {
    const html = '<div class="lot-card"><a href="/l/1">Keysight scope DSOX1204G</a><span class="bid">$5</span></div>';
    const r = await handleCrawl(post({ url: 'https://a.example.com/c' }), {}, async () => html);
    const body = (await r.json()) as any;
    expect(body.lots).toHaveLength(1);
    expect(body.done).toBe(true);
  });

  it('corpo grande demais é recusado', async () => {
    const big = JSON.stringify({ url: 'https://a.example.com/', pad: 'x'.repeat(60_000) });
    const r = await handleCrawl(post(big), {}, async () => '');
    expect(r.status).toBe(413);
  });

  it('sanitizeRaw remove links perigosos e limita valores', () => {
    const s = sanitizeRaw({ lotNumber: '1', title: '<b>X</b> item', currentBid: -4, directUrl: 'javascript:alert(1)', imageUrl: 'https://i.example.com/a.jpg' })!;
    expect(s.title).toBe('X item');
    expect(s.currentBid).toBe(0);
    expect(s.directUrl).toBe('');
    expect(s.imageUrl).toBe('https://i.example.com/a.jpg');
    expect(sanitizeRaw({ title: '' })).toBeNull();
  });
});
