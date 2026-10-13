import { describe, expect, it } from 'vitest';
import { listDemoCatalogs, loadDemoCatalog, finalizeLots } from './api';
import { suggestedBid, computeRows, DEFAULT_PREFS } from './derive';
import { DEFAULT_GLOBALS, DEFAULT_HOUSES } from './houses';
import { buildAlerts } from './alerts';

describe('catálogos de demonstração', () => {
  it('são os três do manual, com link direto e perfil de taxas', () => {
    const list = listDemoCatalogs();
    expect(list.map((d) => d.name)).toEqual([
      'Industrial & Lab Equipment Liquidation',
      'Enterprise IT & Networking Surplus',
      'Consumer Electronics & Audio Liquidation',
    ]);
    for (const d of list) {
      const c = loadDemoCatalog(d.slug);
      expect(c.lots.length).toBeGreaterThanOrEqual(7);
      for (const l of c.lots) {
        expect(l.directUrl, `${d.slug} ${l.lotNumber}`).toMatch(/^https:\/\//);
        expect(l.directUrl).toContain(l.lotNumber);
        expect(l.houseId).not.toBe('');
      }
    }
    expect(loadDemoCatalog('enterprise-it').lots[0].directUrl).toBe('https://4lessauctions.hibid.com/catalog/512408/lot/104');
    expect(loadDemoCatalog('enterprise-it').lots[0].houseId).toBe('4less');
  });
  it('ids são únicos dentro do catálogo', () => {
    for (const d of listDemoCatalogs()) {
      const ids = loadDemoCatalog(d.slug).lots.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('finalizeLots', () => {
  it('dá id único, perfil e link direto aos lotes vindos da IA', () => {
    const base = loadDemoCatalog('consumer-audio').lots[0];
    const out = finalizeLots([{ ...base, directUrl: '', houseId: 'default', id: 'lot-201' }], 'https://consumerliquidation.hibid.com/catalog/498120/x', 's1', 'X');
    expect(out[0].id).toBe('s1-201');
    expect(out[0].houseId).toBe('hibid');
    expect(out[0].directUrl).toBe('https://consumerliquidation.hibid.com/catalog/498120/lot/201');
  });
});

describe('lance sugerido e alertas', () => {
  const rows = computeRows(loadDemoCatalog('enterprise-it').lots, DEFAULT_GLOBALS, DEFAULT_HOUSES, DEFAULT_PREFS, []);
  it('usa o Conservative quando o card o recomenda', () => {
    const ups = rows.find((r) => r.lot.lotNumber === '132')!;
    expect(suggestedBid(ups).label).toBe('Conservative');
  });
  it('avisa quando o lance passa do teto e quando o seu máximo é alto demais', () => {
    const r = rows[0];
    const over = { ...r, lot: { ...r.lot, currentBid: r.plan.max + 100 } };
    const alerts = buildAlerts([over], [{ lotId: r.lot.id, status: 'Monitoring', myMaxBid: r.plan.max + 500 }]);
    expect(alerts.map((a) => a.id)).toEqual(expect.arrayContaining([`over-${r.lot.id}`, `mymax-${r.lot.id}`]));
  });
  it('lotes encerrados (Won/Lost) não geram alerta de teto', () => {
    const r = rows[0];
    const over = { ...r, lot: { ...r.lot, currentBid: r.plan.max + 100 } };
    const alerts = buildAlerts([over], [{ lotId: r.lot.id, status: 'Won', myMaxBid: 0 }]);
    expect(alerts.some((a) => a.id.startsWith('over-'))).toBe(false);
  });
  it('avisa sobre lotes repetidos uma vez só', () => {
    expect(buildAlerts(rows, []).filter((a) => a.id.startsWith('dup-'))).toHaveLength(1);
  });
});
