/**
 * Resolve o link direto da página de lance de cada lote.
 *
 * Ordem de decisão:
 *  1. O link que o crawler leu da própria página do leiloeiro, se for um link de lote de verdade
 *     (não a home e não o catálogo inteiro).
 *  2. O padrão conhecido da plataforma, montado a partir da URL do catálogo e do número do lote.
 *  3. Âncora #lot-N na URL do catálogo.
 *
 * Os padrões da etapa 2 seguem as regras de negócio do manual e devem ser conferidos contra os
 * sites reais, porque as plataformas mudam suas rotas sem aviso.
 */

export type Platform = 'hibid' | '4less' | 'proxibid' | 'publicsurplus' | 'govdeals' | 'bidspotter' | 'unknown';

export interface LinkInput {
  lotNumber: string;
  directUrl?: string;
  catalogUrl?: string;
  /** Identificador do lote na plataforma, quando o crawler conseguiu extrair. */
  platformLotId?: string;
}

function parse(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** Devolve a URL só se for http(s). Qualquer outra coisa (javascript:, data:) vira null. */
export function safeExternalUrl(url: string | undefined): string | null {
  return parse(url)?.toString() ?? null;
}

export function detectPlatform(url: string | undefined): Platform {
  const host = parse(url)?.hostname.toLowerCase();
  if (!host) return 'unknown';
  if (host === '4lessauctions.com' || host.endsWith('.4lessauctions.com') || host.startsWith('4lessauctions.')) {
    return '4less';
  }
  if (host === 'hibid.com' || host.endsWith('.hibid.com')) return 'hibid';
  if (host === 'proxibid.com' || host.endsWith('.proxibid.com')) return 'proxibid';
  if (host === 'publicsurplus.com' || host.endsWith('.publicsurplus.com')) return 'publicsurplus';
  if (host === 'govdeals.com' || host.endsWith('.govdeals.com')) return 'govdeals';
  if (host === 'bidspotter.com' || host.endsWith('.bidspotter.com')) return 'bidspotter';
  return 'unknown';
}

/** Id do perfil de taxas correspondente a cada plataforma. */
export function houseIdForPlatform(p: Platform): string {
  switch (p) {
    case '4less':
      return '4less';
    case 'hibid':
      return 'hibid';
    case 'proxibid':
      return 'proxibid';
    case 'govdeals':
      return 'govdeals';
    case 'publicsurplus':
      return 'publicsurplus';
    default:
      return 'default';
  }
}

function anchorFallback(catalog: URL | null, lotNumber: string): string {
  if (!catalog) return '';
  const u = new URL(catalog.toString());
  u.hash = `lot-${lotNumber}`;
  return u.toString();
}

/** Um link só vale se levar a um lote: não pode ser a raiz do site nem a própria página do catálogo. */
function looksLikeLotLink(direct: URL, catalog: URL | null): boolean {
  if (direct.pathname === '/' || direct.pathname === '') return false;
  if (catalog) {
    const sameDoc =
      direct.hostname === catalog.hostname &&
      direct.pathname.replace(/\/$/, '') === catalog.pathname.replace(/\/$/, '') &&
      direct.search === catalog.search;
    if (sameDoc) return false;
  }
  return true;
}

export function getDirectAuctionLotUrl(lot: LinkInput): string {
  const catalog = parse(lot.catalogUrl);
  const direct = parse(lot.directUrl);
  if (direct && looksLikeLotLink(direct, catalog)) return direct.toString();

  const num = encodeURIComponent(lot.lotNumber);
  const platform = detectPlatform(lot.catalogUrl);

  if (catalog && (platform === 'hibid' || platform === '4less')) {
    const catalogId = catalog.pathname.match(/\/catalog\/(\d+)/)?.[1];
    // A 4Less publica o catálogo no subdomínio dela dentro do HiBid.
    const host =
      platform === '4less' && !catalog.hostname.endsWith('hibid.com') ? '4lessauctions.hibid.com' : catalog.hostname;
    if (catalogId) return `https://${host}/catalog/${catalogId}/lot/${num}`;
  }

  if (catalog && platform === 'proxibid') {
    if (lot.platformLotId) {
      return `https://www.proxibid.com/asp/LotInformation.asp?lid=${encodeURIComponent(lot.platformLotId)}`;
    }
    const event =
      catalog.searchParams.get('auctionid') ??
      catalog.searchParams.get('ei') ??
      catalog.pathname.match(/\/(\d{5,})(?:\/|$)/)?.[1];
    if (event) return `https://www.proxibid.com/lotInformation/${encodeURIComponent(event)}-${num}`;
  }

  if (catalog && platform === 'publicsurplus') {
    const auc = catalog.searchParams.get('auc') ?? lot.platformLotId;
    if (auc) {
      return `https://www.publicsurplus.com/sms/auction/view?auc=${encodeURIComponent(auc)}&lot=${num}`;
    }
  }

  if (catalog && platform === 'govdeals') {
    const itemId = lot.platformLotId ?? lot.lotNumber;
    const acct =
      catalog.searchParams.get('acctid') ?? catalog.searchParams.get('accountid') ?? catalog.searchParams.get('ac');
    if (acct) {
      return `https://www.govdeals.com/index.cfm?fa=Main.Item&itemid=${encodeURIComponent(itemId)}&acctid=${encodeURIComponent(acct)}`;
    }
  }

  return anchorFallback(catalog, lot.lotNumber);
}
