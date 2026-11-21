import { describe, expect, it } from 'vitest';
import { dobrarLinha, escaparTexto, gerarIcs, uidDaAula } from '../src/lib/dominio/agenda.js';

// Dados fictícios.
const agora = new Date(2026, 10, 21, 10, 0); // sábado, 21/11/2026
const aula = { disciplina: 'Direito Civil VI', diaSemana: 3, inicioMin: 19 * 60, fimMin: 20 * 60 + 40, valeDe: '2026-08-10', valeAte: '2026-12-18' };

describe('agenda (.ics)', () => {
  it('escapa vírgula, ponto-e-vírgula, barra e quebra de linha', () => {
    expect(escaparTexto('A, B; C\\D\nE')).toBe('A\\, B\\; C\\\\D\\nE');
  });

  it('usa CRLF e termina com CRLF', () => {
    const { texto } = gerarIcs([aula], agora);
    expect(texto.endsWith('\r\n')).toBe(true);
    expect(texto.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('dobra linhas em 75 octetos sem cortar acentos', () => {
    const longa = 'SUMMARY:' + 'ção'.repeat(40);
    const dobrada = dobrarLinha(longa);
    const partes = dobrada.split('\r\n');
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    partes.slice(1).forEach((p) => expect(p.startsWith(' ')).toBe(true));
    expect(partes.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(longa);
    expect(dobrarLinha('curta')).toBe('curta');
  });

  it('UID estável para a mesma aula e diferente para outra', () => {
    expect(uidDaAula(aula)).toBe(uidDaAula({ ...aula }));
    expect(uidDaAula(aula)).not.toBe(uidDaAula({ ...aula, diaSemana: 4 }));
    const a = gerarIcs([aula], agora).texto.match(/UID:(.+)/)[1];
    const b = gerarIcs([aula], new Date(2026, 11, 1)).texto.match(/UID:(.+)/)[1];
    expect(a).toBe(b);
  });

  it('gera evento semanal com fuso de Rio Branco e fim do período', () => {
    const { texto, eventos, prazoPadrao } = gerarIcs([aula], agora);
    expect(eventos).toBe(1);
    expect(prazoPadrao).toBe(false);
    expect(texto).toContain('BEGIN:VTIMEZONE\r\nTZID:America/Rio_Branco');
    expect(texto).toContain('TZOFFSETTO:-0500');
    // 10/08/2026 é segunda; a primeira quarta é 12/08.
    expect(texto).toContain('DTSTART;TZID=America/Rio_Branco:20260812T190000');
    expect(texto).toContain('DTEND;TZID=America/Rio_Branco:20260812T204000');
    // 18/12 23:59:59 em UTC-5 = 19/12 04:59:59Z.
    expect(texto).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20261219T045959Z');
    expect(texto).toContain('SUMMARY:Direito Civil VI');
    expect(texto).not.toContain('LOCATION');
  });

  it('sem fim do período, repete por 4 meses e avisa', () => {
    const { texto, prazoPadrao } = gerarIcs([{ disciplina: 'Teste, Um', diaSemana: 1, inicioMin: 480, fimMin: 600 }], agora);
    expect(prazoPadrao).toBe(true);
    expect(texto).toContain('DTSTART;TZID=America/Rio_Branco:20261123T080000');
    expect(texto).toContain('UNTIL=20270322T045959Z');
    expect(texto).toContain('SUMMARY:Teste\\, Um');
  });

  it('ignora aula inválida e domingo vira SU', () => {
    const { texto, eventos } = gerarIcs([{ disciplina: '', diaSemana: 1, inicioMin: 1, fimMin: 2 }, { ...aula, diaSemana: 7 }], agora);
    expect(eventos).toBe(1);
    expect(texto).toContain('BYDAY=SU');
  });
});

describe('feriados no .ics', () => {
  it('tira da repetição a aula que cai em feriado', async () => {
    const { gerarIcs } = await import('../src/lib/dominio/agenda.js');
    // Segunda, 2/11/2026 é Finados; 9/11 não é feriado.
    const { texto } = gerarIcs([{ disciplina: 'Teste', diaSemana: 1, inicioMin: 8 * 60, fimMin: 10 * 60, valeDe: '2026-10-26', valeAte: '2026-11-16' }], new Date(2026, 9, 20));
    expect(texto).toContain('EXDATE;TZID=America/Rio_Branco:20261102T080000');
    expect(texto).not.toContain('EXDATE;TZID=America/Rio_Branco:20261109');
  });
});
