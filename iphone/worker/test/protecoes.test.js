// Issue #12: limite por IP em /google/* e localhost só em desenvolvimento.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import worker, { origemPermitida } from '../src/index.js';
import { redirecionamentoPermitido } from '../src/google.js';
import { LIMITE_POR_MINUTO, limiteEmMemoria, zerarLimiteEmMemoria } from '../src/limite.js';

const PROD = 'https://ufac-plus-ios.pages.dev';
const base = { ORIGENS: `${PROD},*.ufac-plus-ios.pages.dev`, ORIGENS_DEV: 'http://localhost:5173,http://localhost:4173' };

const pedidoGoogle = (ip, caminho = '/google/renovar') =>
  new Request(`https://w.dev${caminho}`, { method: 'POST', headers: { Origin: PROD, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: '{}' });

describe('origens', () => {
  test('localhost fica de fora sem DEV_LOCAL', () => {
    expect(origemPermitida('http://localhost:5173', base)).toBe(false);
    expect(origemPermitida('http://localhost:4173', base)).toBe(false);
    expect(origemPermitida(PROD, base)).toBe(true);
  });

  test('localhost vale com DEV_LOCAL=1', () => {
    const dev = { ...base, DEV_LOCAL: '1' };
    expect(origemPermitida('http://localhost:5173', dev)).toBe(true);
    expect(origemPermitida('http://localhost:9999', dev)).toBe(false);
  });

  test('a volta do Google para localhost pede DEV_LOCAL e GOOGLE_DEV', () => {
    expect(redirecionamentoPermitido('http://localhost:5173/', { ...base, GOOGLE_DEV: '1' })).toBe(false);
    expect(redirecionamentoPermitido('http://localhost:5173/', { ...base, DEV_LOCAL: '1' })).toBe(false);
    expect(redirecionamentoPermitido('http://localhost:5173/', { ...base, DEV_LOCAL: '1', GOOGLE_DEV: '1' })).toBe(true);
    expect(redirecionamentoPermitido(`${PROD}/`, base)).toBe(true);
  });

  test('wrangler.toml não põe localhost em ORIGENS e o dev liga DEV_LOCAL', () => {
    const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    const origens = toml.match(/^ORIGENS\s*=\s*"([^"]*)"/m)[1];
    expect(origens).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(toml).not.toMatch(/^DEV_LOCAL\s*=/m);
    expect(toml).toMatch(/\[\[ratelimits\]\][\s\S]*name = "LIMITE_GOOGLE"[\s\S]*limit = 30, period = 60/);
    expect(LIMITE_POR_MINUTO).toBe(30);
    const pacote = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pacote.scripts.dev).toContain('--var DEV_LOCAL:1');
  });
});

describe('limite em /google/*', () => {
  beforeEach(() => zerarLimiteEmMemoria());

  test('com o binding da Cloudflare: 429 com texto humano e CORS', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const r = await worker.fetch(pedidoGoogle('203.0.113.7'), { ...base, LIMITE_GOOGLE: { limit } });
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('60');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(PROD);
    const j = await r.json();
    expect(j.erro).toBe('muitos_pedidos');
    expect(j.mensagem).toMatch(/Espere um minuto/);
  });

  test('com o binding liberando, o pedido segue para a rota', async () => {
    const r = await worker.fetch(pedidoGoogle('203.0.113.7'), { ...base, LIMITE_GOOGLE: { limit: async () => ({ success: true }) } });
    expect(r.status).toBe(503); // sem GOOGLE_CLIENT_ID: chegou na rota, não foi barrado
  });

  test('as outras rotas não consultam o limite', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const r = await worker.fetch(new Request('https://w.dev/push/chave', { headers: { Origin: PROD } }), { ...base, VAPID_PUBLICA: 'x', LIMITE_GOOGLE: { limit } });
    expect(r.status).toBe(200);
    expect(limit).not.toHaveBeenCalled();
  });

  test('sem binding (ou com ele falhando), o contador em memória barra depois do limite', async () => {
    const quebrado = { ...base, LIMITE_GOOGLE: { limit: async () => { throw new Error('fora'); } } };
    for (let i = 0; i < LIMITE_POR_MINUTO; i++) expect((await worker.fetch(pedidoGoogle('198.51.100.1'), quebrado)).status).toBe(503);
    expect((await worker.fetch(pedidoGoogle('198.51.100.1'), quebrado)).status).toBe(429);
    expect((await worker.fetch(pedidoGoogle('198.51.100.2', '/google/trocar'), base)).status).toBe(503); // outro IP segue livre
  });

  test('o contador em memória zera depois de um minuto', () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITE_POR_MINUTO; i++) expect(limiteEmMemoria('ip', t)).toBe(true);
    expect(limiteEmMemoria('ip', t + 1000)).toBe(false);
    expect(limiteEmMemoria('ip', t + 60_000)).toBe(true);
  });
});

describe('feriados nos avisos de aula', async () => {
  const { eventosNaJanela, validarAgenda } = await import('../src/agenda.js');
  test('não manda aviso de aula dentro de uma pausa, mas manda o de refeição', () => {
    const fim = Date.UTC(2026, 10, 2, 12, 0); // segunda, 2/11/2026 (Finados)
    const fimMin = Math.floor(fim / 60000);
    const m = Math.floor(fim / 60000 + 4 * 1440) % (7 * 1440);
    const agenda = validarAgenda({ semanais: [{ m, t: 'aula', r: '1-480' }, { m, t: 'refeicao', r: 'almoco' }], unicos: [], pausas: [{ de: fimMin - 600, ate: fimMin + 840 }] });
    expect(eventosNaJanela(agenda, fim).map((e) => e.t)).toEqual(['refeicao']);
    const semPausa = validarAgenda({ semanais: [{ m, t: 'aula', r: '1-480' }], unicos: [] });
    expect(eventosNaJanela(semPausa, fim)).toHaveLength(1);
  });
  test('recusa pausas inválidas', () => {
    expect(validarAgenda({ pausas: [{ de: 10, ate: 5 }, { de: 'x', ate: 9 }, { de: 0, ate: 99999 }] }).pausas).toEqual([]);
  });
});
