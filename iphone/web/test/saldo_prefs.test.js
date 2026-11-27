// Aviso de saldo baixo (issue #14), preferências com "monitoria" e agenda do aviso de edital.
import { beforeEach, describe, expect, test, vi } from 'vitest';

const gravados = {};
vi.mock('../src/lib/armazenamento.js', () => ({
  ler: async (k) => gravados[k],
  gravar: async (k, v) => { gravados[k] = v; },
  apagar: async (k) => { delete gravados[k]; },
}));

const { saldoBaixo, LIMITE_SALDO_BAIXO } = await import('../src/lib/dominio/saldo.js');
const { lerPrefs, montarAgenda } = await import('../src/lib/push.js');

describe('saldo baixo', () => {
  test('R$ 2,00 ou menos avisa; acima ou sem saldo lido, não', () => {
    expect(LIMITE_SALDO_BAIXO).toBe(2);
    expect(saldoBaixo({ saldo: 2 })).toBe(true);
    expect(saldoBaixo({ saldo: 0.5 })).toBe(true);
    expect(saldoBaixo({ saldo: 0 })).toBe(true);
    expect(saldoBaixo({ saldo: 2.01 })).toBe(false);
    expect(saldoBaixo({ saldo: 12.5 })).toBe(false);
    for (const nada of [null, undefined, {}, { saldo: null }, { saldo: '1,00' }, { saldo: NaN }]) expect(saldoBaixo(nada)).toBe(false);
  });
});

describe('preferências e agenda de monitoria', () => {
  beforeEach(() => Object.keys(gravados).forEach((k) => delete gravados[k]));

  test('preferências antigas (sem "monitoria") ganham o padrão sem perder o que a pessoa ligou', async () => {
    gravados.prefs = { tema: 'escuro', feriados: false, avisos: { aulas: true, refeicoes: ['almoco'], classroom: false } };
    const p = await lerPrefs();
    expect(p.tema).toBe('escuro');
    expect(p.feriados).toBe(false);
    expect(p.avisos).toEqual({ aulas: true, refeicoes: ['almoco'], classroom: false, monitoria: false });
    expect(p.saldoBaixo).toBe(true);
  });

  test('sem nada salvo, tudo no padrão', async () => {
    const p = await lerPrefs();
    expect(p.avisos.monitoria).toBe(false);
    expect(p.saldoBaixo).toBe(true);
  });

  test('a agenda leva só o sim/não da monitoria', () => {
    const base = { aulas: false, refeicoes: [], classroom: false };
    expect(montarAgenda({ prefs: { avisos: { ...base, monitoria: true } }, agora: new Date(2026, 10, 10) }).monitoria).toBe(true);
    expect(montarAgenda({ prefs: { avisos: base }, agora: new Date(2026, 10, 10) }).monitoria).toBe(false);
  });
});
