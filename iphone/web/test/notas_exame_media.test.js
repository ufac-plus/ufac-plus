// "Quanto preciso no exame" (Regimento Geral da Ufac, arts. 316, 317, 319 e 320) e a média das disciplinas
// dos semestres em cache (conta do app: a fórmula do CR oficial não é publicada).
import { describe, expect, test } from 'vitest';
import { exameDaDisciplina, formatarNota, lerNumero, mediaDasDisciplinas, notaNecessariaNoExame } from '../src/lib/dominio/academico.js';

describe('lerNumero', () => {
  test('vírgula ou ponto, com espaços', () => {
    expect(lerNumero('6,50')).toBe(6.5);
    expect(lerNumero('6.5')).toBe(6.5);
    expect(lerNumero(' 7 ')).toBe(7);
    expect(lerNumero('0,0')).toBe(0);
    expect(lerNumero(8)).toBe(8);
  });
  test('vazio, traço ou texto não viram número', () => {
    for (const v of ['', '—', '-', '–', null, undefined, 'abc', '7,5a', '1,2,3']) expect(lerNumero(v)).toBeNull();
  });
});

describe('notaNecessariaNoExame: EF = 10 − MP, para MF 5', () => {
  test('MP 3,5 precisa de 6,5', () => expect(notaNecessariaNoExame(3.5)).toBe(6.5));
  test('arredonda para cima na primeira casa (art. 305), para nunca faltar', () => {
    expect(notaNecessariaNoExame(6.75)).toBe(3.3);
    expect(notaNecessariaNoExame(7.99)).toBe(2.1);
    expect(notaNecessariaNoExame(5)).toBe(5);
  });
  test('MP 8 ou mais passa sem exame; MP zero não tem direito ao exame (arts. 316 e 317)', () => {
    expect(notaNecessariaNoExame(8)).toBeNull();
    expect(notaNecessariaNoExame(9.5)).toBeNull();
    expect(notaNecessariaNoExame(0)).toBeNull();
    expect(notaNecessariaNoExame(null)).toBeNull();
    expect(notaNecessariaNoExame(-1)).toBeNull();
  });
});

/** Disciplina no formato do extrator (lerNotasDaDisciplina). */
const disciplina = ({ n1 = '6,00', n2 = '5,00', media = '5,50', exame = '', final = '', mf = '', faltas = '4', carga = 60 } = {}) => ({
  disciplina: 'Disciplina Exemplo',
  situacao: 'Matrícula',
  notas: [
    { rotulo: 'Nota 1', peso: '50.00%', itens: [{ rotulo: 'Total', peso: '100%', valor: n1 }] },
    { rotulo: 'Nota 2', peso: '50.00%', itens: [{ rotulo: 'Total', peso: '100%', valor: n2 }] },
  ],
  resumo: [
    { rotulo: 'Média', peso: '', valor: media },
    { rotulo: 'Exame', peso: '', valor: exame },
    { rotulo: 'Média Final', peso: '', valor: final },
  ],
  media: mf,
  faltas,
  cargaHoraria: carga,
});

describe('exameDaDisciplina', () => {
  test('semestre atual, média parcial abaixo de 8 e sem exame lançado', () => {
    expect(exameDaDisciplina(disciplina(), { atual: true })).toEqual({ mediaParcial: 5.5, necessaria: 4.5 });
  });
  test('aceita a média com ponto', () => {
    expect(exameDaDisciplina(disciplina({ media: '3.5' }), { atual: true })).toEqual({ mediaParcial: 3.5, necessaria: 6.5 });
  });
  test('semestre encerrado não mostra nada', () => {
    expect(exameDaDisciplina(disciplina(), { atual: false })).toBeNull();
  });
  test('média vazia, com traço, zero ou de 8 para cima: nada', () => {
    for (const media of ['', '—', '0,00', '8,00', '9,1']) expect(exameDaDisciplina(disciplina({ media }), { atual: true })).toBeNull();
  });
  test('com uma das notas ainda sem lançar, a média parcial não é a final: nada', () => {
    expect(exameDaDisciplina(disciplina({ n2: '' }), { atual: true })).toBeNull();
    expect(exameDaDisciplina(disciplina({ n2: '—' }), { atual: true })).toBeNull();
  });
  test('exame ou média final já no portal: vale o que o portal diz', () => {
    expect(exameDaDisciplina(disciplina({ exame: '6,0' }), { atual: true })).toBeNull();
    expect(exameDaDisciplina(disciplina({ final: '5,8' }), { atual: true })).toBeNull();
    expect(exameDaDisciplina(disciplina({ mf: '5,8' }), { atual: true })).toBeNull();
  });
  test('passou do limite de faltas: não tem direito ao exame (art. 317)', () => {
    expect(exameDaDisciplina(disciplina({ faltas: '17' }), { atual: true })).toBeNull();
    expect(exameDaDisciplina(disciplina({ faltas: '16' }), { atual: true })).not.toBeNull();
  });
  test('sem a carga horária, o limite de faltas é estimativa: com faltas, nada (numa de 30 h já teria passado)', () => {
    expect(exameDaDisciplina(disciplina({ faltas: '10', carga: null }), { atual: true })).toBeNull();
    expect(exameDaDisciplina(disciplina({ faltas: '1', carga: null }), { atual: true })).toBeNull();
    expect(exameDaDisciplina(disciplina({ faltas: '0', carga: null }), { atual: true })).not.toBeNull();
    expect(exameDaDisciplina(disciplina({ faltas: '8', carga: 30 }), { atual: true })).not.toBeNull();
    expect(exameDaDisciplina(disciplina({ faltas: '9', carga: 30 }), { atual: true })).toBeNull();
  });
  test('sem quadro de notas: nada', () => {
    expect(exameDaDisciplina({ ...disciplina(), notas: [], resumo: [] }, { atual: true })).toBeNull();
    expect(exameDaDisciplina(null, { atual: true })).toBeNull();
  });
});

describe('mediaDasDisciplinas', () => {
  const d = (media, cargaHoraria = null) => ({ disciplina: 'X', media, cargaHoraria });
  test('ponderada pela carga horária quando todas têm carga', () => {
    const r = mediaDasDisciplinas([{ disciplinas: [d('8,0', 60), d('6,0', 30)] }, { disciplinas: [d('7,0', 30)] }]);
    expect(r).toEqual({ media: (8 * 60 + 6 * 30 + 7 * 30) / 120, disciplinas: 3, semestres: 2, ponderada: true });
  });
  test('sem a carga de alguma, média simples', () => {
    const r = mediaDasDisciplinas([{ disciplinas: [d('8,0', 60), d('6,0')] }]);
    expect(r).toEqual({ media: 7, disciplinas: 2, semestres: 1, ponderada: false });
  });
  test('ignora disciplina sem média final (em andamento, vazia ou traço)', () => {
    const r = mediaDasDisciplinas([{ disciplinas: [d('', 60), d('—', 60), d('9.0', 60)] }, { disciplinas: [d('')] }]);
    expect(r).toEqual({ media: 9, disciplinas: 1, semestres: 1, ponderada: true });
  });
  test('nenhuma média final: null', () => {
    expect(mediaDasDisciplinas([{ disciplinas: [d('')] }])).toBeNull();
    expect(mediaDasDisciplinas([])).toBeNull();
    expect(mediaDasDisciplinas([{ disciplinas: undefined }])).toBeNull();
  });
});

test('formatarNota usa vírgula', () => {
  expect(formatarNota(6.5)).toBe('6,5');
  expect(formatarNota(7, 2)).toBe('7,00');
  expect(formatarNota(7.8333, 2)).toBe('7,83');
});

test('fixture: quadro com média parcial 3,50 e exame em branco pede 6,5', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const { lerNotasDaDisciplina } = await import('../src/lib/extratores/portal.js');
  const pagina = readFileSync(resolve(__dirname, '../../fixtures/portal_notaturma_exame_ajax.html'), 'utf8');
  const d = { ...lerNotasDaDisciplina(pagina, { disciplina: 'Outra Disciplina', situacao: 'Matrícula' }), cargaHoraria: 60 };
  expect(exameDaDisciplina(d, { atual: true })).toEqual({ mediaParcial: 3.5, necessaria: 6.5 });
  // A fixture de sempre (média 8,00, aprovado) não pede exame.
  const aprovado = lerNotasDaDisciplina(readFileSync(resolve(__dirname, '../../fixtures/portal_notaturma_ajax.html'), 'utf8'), { disciplina: 'X', situacao: 'Matrícula' });
  expect(exameDaDisciplina(aprovado, { atual: true })).toBeNull();
});
