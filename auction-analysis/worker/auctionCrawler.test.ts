import { describe, expect, it } from 'vitest';
import {
  crawlAuctionCatalog,
  crawlStep,
  emptyState,
  isAllowedUrl,
  makeFetchHtml,
  parseByLotLinks,
  parseLots,
  parseMoney,
  probeNext,
  sanitizeCrawlState,
} from './auctionCrawler';

const page = (lots: string, extra = '') => `<html><body>${lots}${extra}</body></html>`;
const lotHtml = (n: number, title: string, bid: string) =>
  `<div class="lot-card" data-lot-id="${n}"><img src="/img/${n}.jpg"><a href="/catalog/1/lot/${n}">${title}</a><span class="lot-number">${n}</span><span class="current-bid">${bid}</span></div>`;

describe('parseMoney', () => {
  it('lê valores com símbolo, vírgula e centavos', () => {
    expect(parseMoney('$1,250.50')).toBe(1250.5);
    expect(parseMoney('Current bid: $45')).toBe(45);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney(undefined)).toBe(0);
  });
});

describe('parseLots: formatos extras do manual', () => {
  it('lê data-lot-number, Item N, imagem preguiçosa e seletores de HiBid', () => {
    const html = page(
      `<div class="hibid-lot-item" data-lot-number="104"><img data-original="/o/104.jpg" src="/placeholder.gif"><a href="/lot/104">Dell PowerEdge R740 server</a><span class="bid">$210</span></div>` +
        `<div class="catalog-lot"><h3>Item 42 Cisco switch 2960X</h3><span class="price">$55.00</span></div>` +
        `<table><tr class="lot-row"><td><a href="/lot/9">Lot #9 Fluke multimeter 87V</a></td><td class="bid">$20</td></tr></table>`,
    );
    const lots = parseLots(html, 'https://x.example.com/c');
    expect(lots.map((l) => l.lotNumber)).toEqual(['104', '42', '9']);
    expect(lots[0].imageUrl).toBe('https://x.example.com/o/104.jpg');
    expect(lots[1].currentBid).toBe(55);
  });
});

describe('probeNext', () => {
  it('soma 1 ao número da página em page, p e pg', () => {
    expect(probeNext('https://a.example.com/c?page=1')).toBe('https://a.example.com/c?page=2');
    expect(probeNext('https://a.example.com/c?x=1&p=4')).toBe('https://a.example.com/c?x=1&p=5');
    expect(probeNext('https://a.example.com/c?pg=9')).toBe('https://a.example.com/c?pg=10');
    expect(probeNext('https://a.example.com/c')).toBeNull();
  });
});

describe('sonda automática de paginação', () => {
  it('descobre as páginas seguintes sem links e para quando a página vem vazia', async () => {
    const pages: Record<string, string> = {
      'https://a.example.com/c?page=1': page(lotHtml(1, 'First page lot item', '$1')),
      'https://a.example.com/c?page=2': page(lotHtml(2, 'Second page lot item', '$2')),
      'https://a.example.com/c?page=3': page('<p>No lots</p>'),
    };
    const seen: string[] = [];
    const f = async (u: string) => {
      seen.push(u);
      if (!(u in pages)) throw new Error('HTTP 404');
      return pages[u];
    };
    const r = await crawlAuctionCatalog('https://a.example.com/c?page=1', f);
    expect(r.lots.map((l) => l.lotNumber)).toEqual(['1', '2']);
    expect(seen).toEqual(['https://a.example.com/c?page=1', 'https://a.example.com/c?page=2', 'https://a.example.com/c?page=3']);
  });
});

describe('parseLots', () => {
  it('extrai título, lance, número, foto e link absoluto', () => {
    const lots = parseLots(page(lotHtml(7, 'Dell PowerEdge R740 server', '$210.00')), 'https://x.example.com/catalog/1');
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      lotNumber: '7',
      title: 'Dell PowerEdge R740 server',
      currentBid: 210,
      directUrl: 'https://x.example.com/catalog/1/lot/7',
      imageUrl: 'https://x.example.com/img/7.jpg',
    });
  });

  it('remove tags do título e ignora lotes sem título', () => {
    const html = page(
      `<div class="lot-card"><h3>Fluke <b>87V</b> meter</h3></div><div class="lot-card"><span class="bid">$5</span></div>`,
    );
    const lots = parseLots(html, 'https://x.example.com/');
    expect(lots).toHaveLength(1);
    expect(lots[0].title).toBe('Fluke 87V meter');
  });

  it('não duplica quando contêineres estão aninhados', () => {
    const html = page(`<div class="lot-card"><div class="lot"><a href="/l/1">Hakko FX-951 station</a></div></div>`);
    expect(parseLots(html, 'https://x.example.com/')).toHaveLength(1);
  });

  it('devolve lista vazia para página sem lotes', () => {
    expect(parseLots('<html><body><p>Nothing</p></body></html>', 'https://x.example.com/')).toEqual([]);
  });
});

describe('isAllowedUrl', () => {
  it('bloqueia destinos internos e formas estranhas', () => {
    for (const u of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'http://intranet/',
      'ftp://example.com/',
      'file:///etc/passwd',
      'https://user:pw@example.com/',
      'https://example.com:8443/',
      'javascript:alert(1)',
    ]) {
      expect(isAllowedUrl(u), u).toBe(false);
    }
  });
  it('aceita sites públicos', () => {
    expect(isAllowedUrl('https://4lessauctions.hibid.com/catalog/1')).toBe(true);
    expect(isAllowedUrl('http://example.com/')).toBe(true);
  });
  it('permite hosts privados só quando liberado para teste', () => {
    expect(isAllowedUrl('http://127.0.0.1/', true)).toBe(true);
  });
});

describe('sanitizeCrawlState', () => {
  it('descarta URLs de outro site, inseguras ou lixo', () => {
    const s = sanitizeCrawlState(
      {
        queue: ['https://a.example.com/?page=2', 'https://evil.com/x', 'http://169.254.169.254/', 5, null],
        visited: ['https://a.example.com/'],
        pages: 3.7,
      },
      'https://a.example.com/',
    );
    expect(s.queue).toEqual(['https://a.example.com/?page=2']);
    expect(s.visited).toEqual(['https://a.example.com/']);
    expect(s.pages).toBe(3);
  });
  it('aceita estado ausente', () => {
    expect(sanitizeCrawlState(undefined, 'https://a.example.com/')).toEqual({ queue: [], visited: [], pages: 0 });
  });
});

describe('crawl com paginação', () => {
  const site: Record<string, string> = {
    'https://a.example.com/c': page(lotHtml(1, 'Item one title', '$10'), '<a rel="next" href="/c?page=2">next</a>'),
    'https://a.example.com/c?page=2': page(lotHtml(2, 'Item two title', '$20'), '<div class="pagination"><a href="/c?page=3">3</a></div>'),
    'https://a.example.com/c?page=3': page(lotHtml(3, 'Item three title', '$30')),
  };
  const fetchHtml = async (u: string) => {
    if (!(u in site)) throw new Error('HTTP 404');
    return site[u];
  };

  it('segue as páginas até o fim', async () => {
    const r = await crawlAuctionCatalog('https://a.example.com/c', fetchHtml);
    expect(r.lots.map((l) => l.lotNumber)).toEqual(['1', '2', '3']);
  });

  it('respeita o limite de páginas por chamada e devolve o estado', async () => {
    const r = await crawlStep({
      startUrl: 'https://a.example.com/c',
      state: emptyState('https://a.example.com/c'),
      fetchHtml,
      pagesThisCall: 1,
      maxPages: 10,
    });
    expect(r.lots).toHaveLength(1);
    expect(r.done).toBe(false);
    expect(r.state.queue).toContain('https://a.example.com/c?page=2');
  });

  it('para no limite total de páginas com aviso', async () => {
    const r = await crawlAuctionCatalog('https://a.example.com/c', fetchHtml, 2);
    expect(r.lots).toHaveLength(2);
    expect(r.warnings.join(' ')).toMatch(/Stopped after 2 pages/);
  });

  it('não visita a mesma página duas vezes', async () => {
    let calls = 0;
    const loop = async () => {
      calls++;
      return page(lotHtml(1, 'Looping title item', '$1'), '<a rel="next" href="/c">again</a>');
    };
    await crawlAuctionCatalog('https://a.example.com/c', loop);
    expect(calls).toBe(1);
  });

  it('segue em frente quando uma página falha', async () => {
    const r = await crawlAuctionCatalog('https://a.example.com/missing', fetchHtml);
    expect(r.lots).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/Could not read/);
  });

  it('ignora links de paginação para outro site', async () => {
    const f = async () => page(lotHtml(1, 'Only one here', '$1'), '<a rel="next" href="https://evil.com/?page=2">n</a>');
    const r = await crawlStep({
      startUrl: 'https://a.example.com/c',
      state: emptyState('https://a.example.com/c'),
      fetchHtml: f,
      pagesThisCall: 3,
      maxPages: 10,
    });
    expect(r.state.queue).toEqual([]);
    expect(r.done).toBe(true);
  });
});

describe('makeFetchHtml', () => {
  const realFetch = globalThis.fetch;
  const withFetch = (impl: typeof fetch) => {
    globalThis.fetch = impl;
  };
  const restore = () => {
    globalThis.fetch = realFetch;
  };

  it('recusa endereços bloqueados sem fazer requisição', async () => {
    let called = false;
    withFetch((async () => {
      called = true;
      return new Response('x');
    }) as typeof fetch);
    await expect(makeFetchHtml()('http://127.0.0.1/')).rejects.toThrow(/not allowed/);
    expect(called).toBe(false);
    restore();
  });

  it('decodifica ISO-8859-1', async () => {
    const bytes = new Uint8Array([0x3c, 0x70, 0x3e, 0xe7, 0xe3, 0x6f, 0x3c, 0x2f, 0x70, 0x3e]);
    withFetch((async () =>
      new Response(bytes, { headers: { 'content-type': 'text/html; charset=iso-8859-1' } })) as typeof fetch);
    const f = makeFetchHtml();
    expect(await f('https://example.com/')).toBe('<p>ção</p>');
    restore();
  });

  it('rejeita conteúdo que não é HTML e erros HTTP', async () => {
    withFetch((async () => new Response('{}', { headers: { 'content-type': 'application/json' } })) as typeof fetch);
    await expect(makeFetchHtml()('https://example.com/')).rejects.toThrow(/Not an HTML/);
    withFetch((async () => new Response('no', { status: 403 })) as typeof fetch);
    await expect(makeFetchHtml()('https://example.com/')).rejects.toThrow(/HTTP 403/);
    restore();
  });
});

describe('leitura pelos links de lote (formato do Proxibid, sem classes úteis)', () => {
  const lot = (n: string, id: string, title: string, desc: string, bid: string) => `
    <div><table><tr>
      <td><a href="/x/lotInformation/${id}"><img src="/img/${id}.jpg"></a><img src="/images/progressbarempty.gif"></td>
      <td>
        <h2><a href="https://www.proxibid.com/SD-Surplus/lotInformation/${id}">${title}</a></h2>
        <a href="/x/lotInformation/${id}">Lot # ${n}</a>
        <p>${desc}</p>
        <div>High Bid: USD ${bid} <span>2****y</span></div>
        <a href="/asp/LoginBidder.asp?PlaceBidInfo=:301808:${id}:">BID NOW $26.00</a>
        <a href="javascript:WatchThisLot(301808,${id},'${n}',1)">Watch this Item</a>
      </td></tr></table></div>`;
  const html = `<html><head><title>Oct 15th RAW Billet</title></head><body>
    <div><h2><a href="/x/lotInformation/100000001">Terms of Sale</a></h2><a href="/x/lotInformation/100000001">Lot # 00</a></div>
    ${lot('900', '103323560', 'Raw Billet 6061 Aluminum 4in x 12in', 'Qty 3. Removal Mon-Fri.', '24.00')}
    ${lot('901', '103323561', 'Titanium Grade 5 Round Bar 2in', 'Qty 1. No shipping.', '1,250.50')}
  </body></html>`;

  it('acha os lotes, número, lance, foto e link, e ignora Terms of Sale', () => {
    const lots = parseByLotLinks(html, 'https://www.proxibid.com/SD-Surplus/event-catalog/301808');
    expect(lots.map((l) => l.lotNumber)).toEqual(['900', '901']);
    expect(lots[0]).toMatchObject({
      title: 'Raw Billet 6061 Aluminum 4in x 12in',
      currentBid: 24,
      directUrl: 'https://www.proxibid.com/SD-Surplus/lotInformation/103323560',
      imageUrl: 'https://www.proxibid.com/img/103323560.jpg',
      platformLotId: '103323560',
    });
    expect(lots[1].currentBid).toBe(1250.5);
    expect(lots[0].description).toContain('Qty 3');
    expect(lots[0].description).not.toContain('BID NOW');
  });

  it('parseLots cai nesse plano B quando não há contêiner conhecido', () => {
    expect(parseLots(html, 'https://www.proxibid.com/SD-Surplus/event-catalog/301808')).toHaveLength(2);
  });

  it('explica na aviso quando a página é lida mas não tem lotes', async () => {
    const r = await crawlStep({
      startUrl: 'https://a.example.com/c',
      state: emptyState('https://a.example.com/c'),
      fetchHtml: async () => '<html><head><title>Just a moment...</title></head><body>challenge</body></html>',
      pagesThisCall: 1,
      maxPages: 10,
    });
    expect(r.lots).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/Just a moment/);
  });

  it('é rápido o bastante para o plano gratuito (300 lotes)', () => {
    const big = `<html><body>${Array.from({ length: 300 }, (_, i) => lot(String(i + 1), String(200000 + i), `Lot item number ${i} aluminum bar`, 'desc', '10.00')).join('')}</body></html>`;
    const t = performance.now();
    const lots = parseByLotLinks(big, 'https://www.proxibid.com/x');
    const ms = performance.now() - t;
    expect(lots).toHaveLength(300);
    expect(ms).toBeLessThan(250);
    console.log('parseByLotLinks 300 lotes:', ms.toFixed(1), 'ms');
  });
});
