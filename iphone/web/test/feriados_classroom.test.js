import { describe, expect, test } from 'vitest';
import { avisoFeriado, feriadosDoAno, pascoa } from '../src/lib/dominio/feriados.js';
import { atividadesDaSemana, lerPrazo, lerSituacao, lerTurma, ordenarPorPrazo, planejarAvisos } from '../src/lib/dominio/classroom.js';

const ts = (d) => d.getTime();

describe('feriados', () => {
  test('Páscoa', () => {
    expect(ts(pascoa(2026))).toBe(ts(new Date(2026, 3, 5)));
    expect(ts(pascoa(2025))).toBe(ts(new Date(2025, 3, 20)));
    expect(ts(pascoa(2027))).toBe(ts(new Date(2027, 2, 28)));
    expect(ts(pascoa(2028))).toBe(ts(new Date(2028, 3, 16)));
  });
  test('2026 tem móveis e locais; 2027 só o que a lei fixa', () => {
    const d26 = feriadosDoAno(2026).map((f) => ts(f.data));
    for (const [m, d] of [[2, 16], [2, 17], [4, 3], [6, 4], [6, 15], [11, 19], [12, 28]]) expect(d26).toContain(ts(new Date(2026, m - 1, d)));
    // Tratado de Petrópolis de 2026 foi adiado de 17 para 19/11 (Decreto 11.809/2025).
    expect(d26).not.toContain(ts(new Date(2026, 10, 17)));
    const d27 = feriadosDoAno(2027).map((f) => ts(f.data));
    for (const [m, d] of [[11, 20], [1, 23], [6, 15], [9, 5], [12, 28]]) expect(d27).toContain(ts(new Date(2027, m - 1, d)));
    // Datas que o decreto de 2027 ainda pode adiar ficam de fora até ele sair.
    for (const [m, d] of [[1, 20], [3, 8], [11, 17]]) expect(d27).not.toContain(ts(new Date(2027, m - 1, d)));
  });
  test('avisos', () => {
    expect(avisoFeriado(new Date(2027, 10, 19, 10))).toEqual({ titulo: 'Amanhã é feriado · Dia da Consciência Negra', texto: 'Sem aulas. Confira o funcionamento do RU.' });
    // No dia 19/11/2026 o feriado do dia vence o de amanhã.
    expect(avisoFeriado(new Date(2026, 10, 19, 10)).titulo).toBe('Hoje é feriado · Tratado de Petrópolis');
    expect(avisoFeriado(new Date(2026, 11, 25, 23, 59)).titulo).toBe('Hoje é feriado · Natal');
    expect(avisoFeriado(new Date(2026, 1, 16)).titulo).toBe('Hoje é ponto facultativo · Carnaval');
    expect(avisoFeriado(new Date(2026, 5, 3)).titulo).toBe('Amanhã é ponto facultativo · Corpus Christi');
    expect(avisoFeriado(new Date(2026, 11, 31)).titulo).toBe('Amanhã é feriado · Confraternização Universal');
    expect(avisoFeriado(new Date(2026, 10, 4))).toBeNull();
    expect(avisoFeriado(new Date(2026, 10, 18, 10)).titulo).toBe('Amanhã é feriado · Tratado de Petrópolis');
    expect(avisoFeriado(new Date(2026, 10, 16, 10))).toBeNull();
  });
});

describe('Classroom', () => {
  const agora = new Date(2026, 10, 10, 12);
  test('turma e prazo', () => {
    expect(lerTurma({ id: '1', name: 'Direito Civil', alternateLink: 'https://evil.com' })).toMatchObject({ nome: 'Direito Civil', link: null });
    expect(lerTurma({ name: 'sem id' })).toBeNull();
    expect(ts(lerPrazo({ dueDate: { year: 2026, month: 11, day: 12 }, dueTime: { hours: 3, minutes: 59 } }))).toBe(Date.UTC(2026, 10, 12, 3, 59));
    expect(lerPrazo({})).toBeNull();
  });
  test('situação', () => {
    const passado = new Date(2026, 10, 9), futuro = new Date(2026, 10, 12);
    expect(lerSituacao({ state: 'TURNED_IN' }, passado, agora)).toBe('entregue');
    expect(lerSituacao({ state: 'RETURNED' }, null, agora)).toBe('entregue');
    expect(lerSituacao({ state: 'CREATED' }, passado, agora)).toBe('atrasada');
    expect(lerSituacao({ state: 'CREATED', late: true }, null, agora)).toBe('atrasada');
    expect(lerSituacao(null, futuro, agora)).toBe('pendente');
  });
  const a = (titulo, prazo, situacao = 'pendente') => ({ id: titulo, titulo, prazo: prazo?.toISOString() ?? null, situacao });
  test('ordem e semana', () => {
    expect(ordenarPorPrazo([a('sem', null), a('depois', new Date(2026, 10, 12)), a('antes', new Date(2026, 10, 11))]).map((x) => x.titulo)).toEqual(['antes', 'depois', 'sem']);
    const l = atividadesDaSemana([
      a('amanha', new Date(2026, 10, 11)), a('atrasou ontem', new Date(2026, 10, 9), 'atrasada'),
      a('entregue', new Date(2026, 10, 11), 'entregue'), a('longe', new Date(2026, 10, 30)), a('velha', new Date(2026, 9, 1), 'atrasada'),
    ], agora);
    expect(l.map((x) => x.titulo)).toEqual(['atrasou ontem', 'amanha']);
  });
  test('aviso às 19h com o que vence até o fim do dia seguinte', () => {
    const avisos = planejarAvisos([a('Fichamento', new Date(2026, 10, 11, 23, 59)), a('Resenha', new Date(2026, 10, 14, 10))], agora);
    expect(avisos.map((x) => ts(x.quando))).toEqual([ts(new Date(2026, 10, 10, 19)), ts(new Date(2026, 10, 11, 19)), ts(new Date(2026, 10, 13, 19))]);
    expect(avisos[0].texto).toBe('Fichamento · amanhã 23h59');
  });
});

import { montarAgenda, paraMinutoUtc } from '../src/lib/push.js';

describe('agenda das notificações', () => {
  test('segunda 18h45 em Rio Branco (UTC-5) vira segunda 23h45 UTC', () => {
    expect(paraMinutoUtc(1, 19 * 60 - 15, 300)).toBe(1440 + 23 * 60 + 45);
    // Sábado 22h em Rio Branco cai no domingo 03h UTC (volta da semana).
    expect(paraMinutoUtc(6, 22 * 60, 300)).toBe(3 * 60);
  });
  test('só horários, tipo e referência; nada de nome de disciplina', () => {
    const prefs = { avisos: { aulas: true, refeicoes: ['almoco'], classroom: false } };
    const aulas = [{ disciplina: 'Direito Civil VII', diaSemana: 1, inicioMin: 19 * 60, fimMin: 22 * 60, valeAte: '2026-12-12' }];
    const a = montarAgenda({ prefs, aulas, agora: new Date(2026, 10, 10), fusoMin: 300 });
    expect(a.semanais[0]).toEqual({ m: 2865, t: 'aula', r: '1-1140' });
    expect(a.semanais.filter((e) => e.t === 'refeicao')).toHaveLength(5);
    expect(JSON.stringify(a)).not.toContain('Direito');
    expect(montarAgenda({ prefs, aulas, agora: new Date(2027, 0, 10), fusoMin: 300 }).semanais.filter((e) => e.t === 'aula')).toHaveLength(0);
  });
});

describe('pausas de feriado nos avisos', () => {
  test('manda os feriados dos próximos dias só quando há aviso de aula', async () => {
    const { montarAgenda } = await import('../src/lib/push.js');
    const aulas = [{ disciplina: 'X', diaSemana: 1, inicioMin: 480, fimMin: 600 }];
    const ligado = { avisos: { aulas: true, refeicoes: [], classroom: false } };
    const a = montarAgenda({ prefs: ligado, aulas, agora: new Date(2026, 10, 10), fusoMin: 300 });
    const dias = a.pausas.map((p) => new Date(p.de * 60000).getDate());
    expect(dias).toContain(19); // Tratado de Petrópolis (adiado para 19/11/2026)
    expect(montarAgenda({ prefs: { avisos: { aulas: false, refeicoes: ['almoco'], classroom: false } }, aulas, agora: new Date(2026, 10, 10) }).pausas).toEqual([]);
  });
});
