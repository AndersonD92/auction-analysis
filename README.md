# Auction Analysis

Painel para analisar lotes de leilão: calcula o custo real de arrematar (taxas, imposto, frete, reparo), o lance máximo que ainda deixa lucro, a velocidade de revenda e uma nota de oportunidade. Lê catálogos por link, PDF, foto ou texto colado, e usa IA (Gemini) para pesquisar o preço de mercado de cada lote.

## Como funciona

O navegador conversa com um Worker da Cloudflare (pasta `worker/`). O Worker faz três coisas: lê as páginas do catálogo (`/api/crawl`), extrai lotes de texto, PDF ou imagem com a IA (`/api/extract`) e pesquisa o preço de mercado de cada lote com a IA (`/api/enrich`). A chave do Gemini fica só no Worker, como segredo, e nunca chega ao navegador.

Para caber no plano gratuito da Cloudflare (10 ms de CPU por requisição), quem orquestra é o navegador: ele pede uma página do catálogo por vez e analisa os lotes em grupos de 6. Cada requisição fica curta.

A análise de cada grupo usa duas chamadas ao Gemini: uma pesquisa com o Google Search ligado, em texto livre, e outra que organiza o resultado em JSON validado por schema. Tudo que volta da IA é conferido antes de ser mostrado (faixas de preço em ordem, condição entre as cinco válidas, quantidades e pesos dentro de limites). Lote sem preço confiável é descartado com aviso.

## Rodar no seu computador

```bash
npm install
npm run dev:demo     # só os 3 catálogos de demonstração, sem servidor e sem IA
npm run cf:dev       # site + API juntos, simulando a Cloudflare (para testar a IA, crie o arquivo .dev.vars)
npm test             # 83 testes
npm run typecheck    # tipos do app e do Worker
npm run build        # build de produção em dist/
```

Para testar a IA localmente, crie um arquivo `.dev.vars` na raiz com a linha `GEMINI_API_KEY=sua_chave`. Esse arquivo já está no `.gitignore`, então não vai para o GitHub.

## Publicar

O passo a passo completo, com GitHub, Cloudflare e a chave da IA, está em [PASSO-A-PASSO.md](./PASSO-A-PASSO.md).

## O que o app tem

Cabeçalho com o nome do catálogo ativo, botão Scan New Auction, Watchlist com contador, painel de Alertas e indicador de conexão. Barra de resumo com Total Lots, Market Resale Value, Est. Net Profit, Avg Projected ROI e Strong Buys, mais filtro por faixa (STRONG BUY, GOOD FLIP, MODERATE, HIGH RISK / AVOID). Busca, filtro por categoria e ordenação por score, lucro, ROI ou número do lote.

Cada lote mostra foto, faixa e score, condição (Brand New, Open Box, Used - Tested, Used - Untested / As-Is, For Parts / Repair), lance atual, valor de mercado, os três lances (Conservative 40%, Balanced 27%, Max 15% de margem, arredondados para o incremento válido da casa), lucro e ROI, riscos, restrições de envio, AI Investment Thesis, Deep Data, Visit Auction (link direto do lote), Copy Bid, Calculator e Market Research. O Conservative é destacado automaticamente para itens sem teste ou incompletos.

Extras: perfil de taxas por leiloeiro (4Less, HiBid, GovDeals, Proxibid, Public Surplus e os que você criar), alocação de orçamento (mochila 0/1), calibração pelo histórico de vendas reais, modo ao vivo em tela cheia, PWA instalável que abre sem internet com os dados salvos, backup e restauração em JSON.

Cálculo (`src/lib/pricing.ts`): custo total = lance + premium + taxas por lote e documento + imposto + taxa do cartão + frete + reparo + armazenagem. Os lances saem da inversão dessa fórmula. A receita esperada desconta as taxas do canal de venda e o risco de item morto por condição. Opportunity Score: margem 40, velocidade de venda 30, condição 20, facilidade de transporte 10, com penalidade para lotes repetidos e baixa confiança. Faixas: 80, 65 e 50. Velocidade: Fast abaixo de 7 dias, Medium de 7 a 30, Slow acima de 30.

## Limites que você precisa saber

O leitor de catálogos usa heurísticas sobre o HTML. Foi testado contra páginas simuladas, não contra os sites reais. Sites que montam os lotes com JavaScript no navegador não funcionam por link: use PDF, foto ou texto colado. Se um site específico não for lido direito, ajuste `CONTAINER_SELECTOR` em `worker/auctionCrawler.ts`.

Os padrões de link direto por plataforma (`src/utils/auctionLinks.ts`) seguem as regras do manual, mas as plataformas mudam suas rotas. Confira o botão Visit Auction com um lote real. Taxas e incrementos dos perfis são pontos de partida: confira os termos de cada evento.

Preços e comparáveis dos catálogos de demonstração são fictícios.

## Estrutura

```
src/App.tsx              estado do app, filtros, ações
src/components/          cartão do lote, calculadora, mercado, scan, watchlist, alertas, ajustes, orçamento, modo ao vivo
src/lib/pricing.ts       todo o cálculo financeiro, sem React
src/lib/houses.ts        perfis de leiloeiro e incrementos
src/lib/api.ts           cliente da API (crawl, extract, enrich)
src/lib/demoData.ts      3 catálogos de demonstração (dados fictícios)
src/utils/auctionLinks.ts  link direto de cada lote por plataforma
worker/index.ts          rotas /api/*
worker/auctionCrawler.ts leitura de catálogos (cheerio) com proteção contra SSRF
worker/gemini.ts         chamadas ao Gemini e validação das respostas
worker/handlers.ts       validação de entrada e limites de tamanho
wrangler.jsonc           configuração do Worker (nome: auction-analysis)
```
