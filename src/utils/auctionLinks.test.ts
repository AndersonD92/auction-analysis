import { describe, expect, it } from 'vitest';
import { detectPlatform, getDirectAuctionLotUrl, houseIdForPlatform, safeExternalUrl } from './auctionLinks';

describe('safeExternalUrl', () => {
  it('só aceita http e https', () => {
    expect(safeExternalUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>')).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});

describe('detectPlatform', () => {
  it('reconhece as plataformas do manual', () => {
    expect(detectPlatform('https://4lessauctions.hibid.com/catalog/1')).toBe('4less');
    expect(detectPlatform('https://consumerliquidation.hibid.com/catalog/1')).toBe('hibid');
    expect(detectPlatform('https://www.4lessauctions.com/x')).toBe('4less');
    expect(detectPlatform('https://www.proxibid.com/a')).toBe('proxibid');
    expect(detectPlatform('https://www.publicsurplus.com/sms/auction/view?auc=1')).toBe('publicsurplus');
    expect(detectPlatform('https://www.govdeals.com/')).toBe('govdeals');
    expect(detectPlatform('https://evilhibid.com/')).toBe('unknown');
    expect(detectPlatform('https://hibid.com.evil.com/')).toBe('unknown');
  });
  it('mapeia plataforma para perfil de taxas', () => {
    expect(houseIdForPlatform('hibid')).toBe('hibid');
    expect(houseIdForPlatform('unknown')).toBe('default');
  });
});

describe('getDirectAuctionLotUrl', () => {
  it('prefere o link lido da página quando leva a um lote', () => {
    expect(
      getDirectAuctionLotUrl({
        lotNumber: '5',
        directUrl: 'https://x.hibid.com/catalog/9/lot/55',
        catalogUrl: 'https://x.hibid.com/catalog/9/name',
      }),
    ).toBe('https://x.hibid.com/catalog/9/lot/55');
  });
  it('descarta link que é a home ou o próprio catálogo', () => {
    const catalogUrl = 'https://x.hibid.com/catalog/9/name';
    expect(getDirectAuctionLotUrl({ lotNumber: '5', directUrl: 'https://x.hibid.com/', catalogUrl })).toBe(
      'https://x.hibid.com/catalog/9/lot/5',
    );
    expect(getDirectAuctionLotUrl({ lotNumber: '5', directUrl: catalogUrl, catalogUrl })).toBe(
      'https://x.hibid.com/catalog/9/lot/5',
    );
  });
  it('monta o padrão do HiBid e da 4Less', () => {
    expect(getDirectAuctionLotUrl({ lotNumber: '104', catalogUrl: 'https://4lessauctions.hibid.com/catalog/512408/x' })).toBe(
      'https://4lessauctions.hibid.com/catalog/512408/lot/104',
    );
  });
  it('monta Proxibid, Public Surplus e GovDeals', () => {
    expect(
      getDirectAuctionLotUrl({ lotNumber: '3', catalogUrl: 'https://www.proxibid.com/x/1', platformLotId: '987' }),
    ).toBe('https://www.proxibid.com/asp/LotInformation.asp?lid=987');
    expect(
      getDirectAuctionLotUrl({ lotNumber: '3', catalogUrl: 'https://www.publicsurplus.com/sms/auction/view?auc=4455' }),
    ).toBe('https://www.publicsurplus.com/sms/auction/view?auc=4455&lot=3');
    expect(
      getDirectAuctionLotUrl({
        lotNumber: '3',
        platformLotId: '77',
        catalogUrl: 'https://www.govdeals.com/index.cfm?fa=Main&acctid=12',
      }),
    ).toBe('https://www.govdeals.com/index.cfm?fa=Main.Item&itemid=77&acctid=12');
  });
  it('cai para âncora quando a plataforma é desconhecida', () => {
    expect(getDirectAuctionLotUrl({ lotNumber: '8', catalogUrl: 'https://shop.example.com/auction/3' })).toBe(
      'https://shop.example.com/auction/3#lot-8',
    );
  });
  it('devolve vazio sem nenhuma informação', () => {
    expect(getDirectAuctionLotUrl({ lotNumber: '8' })).toBe('');
  });
  it('rejeita esquemas perigosos no link lido', () => {
    expect(
      getDirectAuctionLotUrl({ lotNumber: '8', directUrl: 'javascript:alert(1)', catalogUrl: 'https://shop.example.com/a/3' }),
    ).toBe('https://shop.example.com/a/3#lot-8');
  });
});
