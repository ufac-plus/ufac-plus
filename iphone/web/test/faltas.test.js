// Faltas permitidas e frequência pela carga horária de cada disciplina (issues #22 e #13).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { lerCargaHoraria } from '../src/lib/extratores/portal.js';
import { faltasPermitidas, LIMITE_FALTAS, situacaoFaltas } from '../src/lib/dominio/academico.js';

const s = (f, carga) => situacaoFaltas(f, { cargaHoraria: carga });

describe('faltas por carga horária', () => {
  test('60 h: 16 ainda passa, a 17ª reprova (decisão de Arthur)', () => {
    expect(faltasPermitidas(60)).toBe(16);
    expect(s('11', 60).nivel).toBe('tranquilo');
    expect(s('12', 60).nivel).toBe('atencao');
    expect(s('16', 60).nivel).toBe('atencao');
    expect(s('17', 60).nivel).toBe('limite');
    expect(s('16', 60).estimado).toBe(false);
  });

  test('30 h: 8 permitidas', () => {
    expect(s('0', 30).permitidas).toBe(8);
    expect(s('5', 30).nivel).toBe('tranquilo');
    expect(s('6', 30).nivel).toBe('atencao');
    expect(s('8', 30).nivel).toBe('atencao');
    expect(s('9', 30).nivel).toBe('limite');
  });

  test('45 h: 12 permitidas', () => {
    expect(s('12', 45).permitidas).toBe(12);
    expect(s('12', 45).nivel).toBe('atencao');
    expect(s('13', 45).nivel).toBe('limite');
  });

  test('90 h: 24 permitidas; 75 h: 20', () => {
    expect(s('24', 90).permitidas).toBe(24);
    expect(s('24', 90).nivel).toBe('atencao');
    expect(s('25', 90).nivel).toBe('limite');
    expect(faltasPermitidas(75)).toBe(20);
  });

  test('carga fora dos múltiplos de 15 h: a última falta permitida não fica abaixo de 75%', () => {
    expect(faltasPermitidas(40)).toBe(10);
    expect(s('10', 40).frequencia).toBeGreaterThanOrEqual(75);
    expect(s('11', 40).nivel).toBe('limite');
    expect(s('11', 40).frequencia).toBeLessThan(75);
  });

  test('frequência coerente com o limite: no limite fica em 75%, depois cai abaixo', () => {
    expect(s('0', 60).frequencia).toBe(100);
    expect(s('4', 60).frequencia).toBe(93);
    expect(s('16', 60).frequencia).toBe(75);
    expect(s('17', 60).frequencia).toBe(73);
    expect(s('8', 30).frequencia).toBe(75);
    expect(s('12', 45).frequencia).toBe(75);
    expect(s('24', 90).frequencia).toBe(75);
    expect(s('25', 90).frequencia).toBeLessThan(75);
    expect(s('999', 60).frequencia).toBe(0);
  });

  test('sem carga: 16 como estimativa e sem porcentagem', () => {
    for (const carga of [null, undefined, 0, 'abc']) {
      const r = s('5', carga);
      expect(r.permitidas).toBe(LIMITE_FALTAS);
      expect(r.estimado).toBe(true);
      expect(r.frequencia).toBeNull();
    }
    expect(s('17', null).nivel).toBe('limite');
    expect(s('', 60)).toBeNull();
    expect(s('–', 60)).toBeNull();
  });

  test('a carga da fixture da turma (60 h) dá 16 permitidas', () => {
    const turma = readFileSync(resolve(__dirname, '../../fixtures/portal_turma.html'), 'utf8');
    const carga = lerCargaHoraria(turma);
    expect(carga).toBe(60);
    expect(s('3', carga).permitidas).toBe(16);
  });
});
