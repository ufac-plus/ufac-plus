// Faltas permitidas e frequência pela carga horária de cada disciplina (issues #22 e #13).
// Referência: 72 h → 16 faltas permitidas (as disciplinas de Direito), como no Android.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { lerCargaHoraria } from '../src/lib/extratores/portal.js';
import { CARGA_REFERENCIA_FALTAS, faltasPermitidas, LIMITE_FALTAS, situacaoFaltas } from '../src/lib/dominio/academico.js';

const s = (f, carga) => situacaoFaltas(f, { cargaHoraria: carga });

describe('faltas por carga horária', () => {
  test('a referência é 72 h → 16', () => {
    expect(CARGA_REFERENCIA_FALTAS).toBe(72);
    expect(faltasPermitidas(72)).toBe(LIMITE_FALTAS);
  });

  test('72 h: 16 ainda passa, a 17ª reprova (decisão de Arthur)', () => {
    expect(s('11', 72).nivel).toBe('tranquilo');
    expect(s('12', 72).nivel).toBe('atencao');
    expect(s('16', 72).nivel).toBe('atencao');
    expect(s('17', 72).nivel).toBe('limite');
    expect(s('16', 72).estimado).toBe(false);
  });

  test('36 h: 8 permitidas', () => {
    expect(s('0', 36).permitidas).toBe(8);
    expect(s('5', 36).nivel).toBe('tranquilo');
    expect(s('6', 36).nivel).toBe('atencao');
    expect(s('8', 36).nivel).toBe('atencao');
    expect(s('9', 36).nivel).toBe('limite');
  });

  test('54 h: 12 permitidas; 108 h: 24', () => {
    expect(s('12', 54).permitidas).toBe(12);
    expect(s('12', 54).nivel).toBe('atencao');
    expect(s('13', 54).nivel).toBe('limite');
    expect(s('24', 108).permitidas).toBe(24);
    expect(s('25', 108).nivel).toBe('limite');
  });

  test('carga fora dos múltiplos de 9 h: a última falta permitida não fica abaixo de 75%', () => {
    expect(faltasPermitidas(60)).toBe(13);
    expect(s('13', 60).frequencia).toBeGreaterThanOrEqual(75);
    expect(s('14', 60).nivel).toBe('limite');
    expect(s('14', 60).frequencia).toBeLessThan(75);
    expect(faltasPermitidas(40)).toBe(8);
    expect(s('8', 40).frequencia).toBeGreaterThanOrEqual(75);
  });

  test('frequência coerente com o limite: no limite fica em 75%, depois cai abaixo', () => {
    expect(s('0', 72).frequencia).toBe(100);
    expect(s('4', 72).frequencia).toBe(93);
    expect(s('16', 72).frequencia).toBe(75);
    expect(s('17', 72).frequencia).toBe(73);
    expect(s('8', 36).frequencia).toBe(75);
    expect(s('12', 54).frequencia).toBe(75);
    expect(s('24', 108).frequencia).toBe(75);
    expect(s('25', 108).frequencia).toBeLessThan(75);
    expect(s('999', 72).frequencia).toBe(0);
  });

  test('sem carga: 16 como estimativa e sem porcentagem', () => {
    for (const carga of [null, undefined, 0, 'abc']) {
      const r = s('5', carga);
      expect(r.permitidas).toBe(LIMITE_FALTAS);
      expect(r.estimado).toBe(true);
      expect(r.frequencia).toBeNull();
    }
    expect(s('17', null).nivel).toBe('limite');
    expect(s('', 72)).toBeNull();
    expect(s('–', 72)).toBeNull();
  });

  test('a carga da fixture da turma (60 h) dá 13 permitidas', () => {
    const turma = readFileSync(resolve(__dirname, '../../fixtures/portal_turma.html'), 'utf8');
    const carga = lerCargaHoraria(turma);
    expect(carga).toBe(60);
    expect(s('3', carga).permitidas).toBe(13);
  });
});
