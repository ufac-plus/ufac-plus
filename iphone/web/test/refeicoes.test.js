import { describe, expect, test } from 'vitest';
import { cardapioPendente, cardapioValeEm, proximaRefeicao, refeicaoRepetida } from '../src/lib/dominio/refeicoes.js';

// Datas locais fictícias; textos de cardápio inventados só para o teste.
const em = (dia, h, m = 0) => new Date(2026, 10, dia, h, m);
const textosA = { cafe: 'Café preto, Leite, Pão com manteiga.', almoco: 'Arroz, Feijão, Frango assado.', jantar: 'Sopa de legumes, Pão.' };
const textosB = { cafe: 'Café preto, Leite, Pão com manteiga.', almoco: 'Arroz, Feijão, Carne moída.', jantar: 'Macarrão, Salada.' };
const cardapio = (lidoEm, textos, anterior) => ({ lidoEm: lidoEm.toISOString(), textos, ...(anterior ? { anterior } : {}) });

describe('proximaRefeicao', () => {
  const casos = [
    [5, 0, 'cafe', false],
    [7, 0, 'cafe', false], // café em andamento
    [10, 0, 'almoco', false],
    [15, 0, 'jantar', false],
    [19, 0, 'jantar', false], // jantar em andamento
    [21, 0, 'cafe', true], // depois do jantar: café de amanhã
    [23, 59, 'cafe', true],
    [0, 0, 'cafe', false], // virou o dia: o café agora é de hoje
  ];
  test.each(casos)('%ih%i → %s (amanhã: %s)', (h, m, id, amanha) => {
    const r = proximaRefeicao(em(20, h, m));
    expect(r.id).toBe(id);
    expect(r.amanha).toBe(amanha);
  });
  test('limite exato do fim do jantar já é amanhã', () => {
    expect(proximaRefeicao(em(20, 19, 29)).amanha).toBe(false);
    expect(proximaRefeicao(em(20, 19, 30)).amanha).toBe(true);
  });
  test('não altera a lista de refeições', () => {
    proximaRefeicao(em(20, 21));
    expect(proximaRefeicao(em(20, 5)).amanha).toBe(false);
  });
});

describe('cardápio de ontem na manhã seguinte', () => {
  const ontem = { lidoEm: em(19, 18, 30).toISOString(), textos: textosA };

  test('virada do dia: cardápio de ontem não vale hoje e pede nova leitura', () => {
    const c = cardapio(em(19, 18, 30), textosA);
    expect(cardapioValeEm(c, em(20, 0, 1))).toBe(false);
    expect(cardapioPendente(c, em(20, 0, 1))).toBe(true);
  });

  test('05h: texto igual ao de ontem, lido antes da refeição, fica em dúvida', () => {
    const c = cardapio(em(20, 5), textosA, ontem);
    expect(refeicaoRepetida(c, 'cafe')).toBe(true);
    expect(refeicaoRepetida(c, 'almoco')).toBe(true);
    expect(cardapioPendente(c, em(20, 5))).toBe(true);
  });

  test('07h: café igual ao de ontem, lido depois de começar, vale (o café costuma repetir)', () => {
    const c = cardapio(em(20, 7), textosB, ontem);
    expect(refeicaoRepetida(c, 'cafe')).toBe(false);
    expect(refeicaoRepetida(c, 'almoco')).toBe(false); // texto novo
    expect(refeicaoRepetida(c, 'jantar')).toBe(false);
    expect(cardapioPendente(c, em(20, 7))).toBe(false);
  });

  test('10h: almoço igual ao de ontem ainda em dúvida; depois das 11h, vale', () => {
    expect(refeicaoRepetida(cardapio(em(20, 10), textosA, ontem), 'almoco')).toBe(true);
    expect(refeicaoRepetida(cardapio(em(20, 11, 5), textosA, ontem), 'almoco')).toBe(false);
  });

  test('diferença só de espaços ou maiúsculas conta como igual', () => {
    const c = cardapio(em(20, 5), { ...textosB, cafe: '  café preto,  leite, pão com manteiga ' }, ontem);
    expect(refeicaoRepetida(c, 'cafe')).toBe(true);
  });

  test('sem leitura anterior, "Não informado" ou anterior do mesmo dia: nada em dúvida', () => {
    expect(refeicaoRepetida(cardapio(em(20, 5), textosA), 'cafe')).toBe(false);
    expect(refeicaoRepetida(cardapio(em(20, 5), { ...textosA, cafe: 'Não informado' }, { ...ontem, textos: { cafe: 'Não informado' } }), 'cafe')).toBe(false);
    expect(refeicaoRepetida(cardapio(em(20, 5), textosA, { lidoEm: em(20, 4).toISOString(), textos: textosA }), 'cafe')).toBe(false);
    expect(refeicaoRepetida(null, 'cafe')).toBe(false);
  });
});
