// Mesmos casos do Android (test/biblioteca_test.dart), contra as mesmas fixtures.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { caminhoBusca, caminhoExemplares, doCache, guardarNoCache, normalizarTermo } from '../src/lib/biblioteca.js';
import { lerExemplares, lerHistoricoBiblioteca, lerResultadoAcervo, tituloCompleto } from '../src/lib/extratores/biblioteca.js';

const fixture = (nome) => readFileSync(resolve(__dirname, '../../fixtures', nome), 'utf8');

describe('Biblioteca: acervo', () => {
  test('lê os títulos do resultado', () => {
    const lista = lerResultadoAcervo(fixture('biblioteca_resultado.html'));
    expect(lista).toHaveLength(2);
    expect(lista[0]).toEqual({ idRegistro: '1001', titulo: 'Curso de direito civil de exemplo', subtitulo: 'parte geral', autor: 'SOUZA, Maria de Teste.', ano: '2019', biblioteca: 'Biblioteca Central' });
    expect(tituloCompleto(lista[0])).toBe('Curso de direito civil de exemplo: parte geral');
  });
  test('campos vazios viram null', () => {
    const t = lerResultadoAcervo(fixture('biblioteca_resultado.html'))[1];
    expect(t).toMatchObject({ idRegistro: '1002', autor: null, ano: null, subtitulo: null, biblioteca: 'Biblioteca Setorial de Exemplo' });
    expect(tituloCompleto(t)).toBe('Manual fictício de contratos');
  });
  test('busca sem resultado é lista vazia', () => {
    expect(lerResultadoAcervo(fixture('biblioteca_resultado_vazio.html'))).toEqual([]);
  });
  test('outra página não vira dado', () => {
    expect(lerResultadoAcervo(fixture('public/portal_login.html'))).toBeNull();
    expect(lerResultadoAcervo('')).toBeNull();
  });
});

describe('Biblioteca: exemplares', () => {
  test('lê localização e situação pelo nome da coluna', () => {
    const lista = lerExemplares(fixture('biblioteca_itens.html'));
    expect(lista).toHaveLength(3);
    expect(lista[0]).toEqual({ localizacao: 'CLA 00001-1', biblioteca: 'CENTRAL', situacao: 'Disponível', colecao: 'CENTRAL', tipo: 'Livro', regulamento: 'Empréstimo Normal - 10 Dias', disponivel: true });
    expect(lista[1]).toMatchObject({ situacao: 'Emprestado', disponivel: false });
    expect(lista[2]).toMatchObject({ biblioteca: 'SETORIAL', colecao: 'REFERÊNCIA', regulamento: 'Consulta Local' });
  });
  test('colunas em outra ordem continuam certas', () => {
    const trocada = fixture('biblioteca_itens.html')
      .replace('<th>Localização</th><th>Biblioteca</th>', '<th>Biblioteca</th><th>Localização</th>')
      .replace('<td>CLA 00001-1</td><td>CENTRAL</td><td>CENTRAL</td><td>Livro</td><td>Empréstimo Normal - 10 Dias</td><td>Disponível</td>', '<td>CENTRAL</td><td>CLA 00001-1</td><td>CENTRAL</td><td>Livro</td><td>Empréstimo Normal - 10 Dias</td><td>Disponível</td>');
    expect(lerExemplares(trocada)[0]).toMatchObject({ localizacao: 'CLA 00001-1', biblioteca: 'CENTRAL' });
  });
  test('sem a tabela de exemplares devolve null', () => {
    expect(lerExemplares(fixture('biblioteca_resultado.html'))).toBeNull();
    expect(lerExemplares('<table class="itens"><thead><tr><th>Outra</th></tr></thead></table>')).toBeNull();
  });
});

describe('Biblioteca: endereços e cache', () => {
  test('endereços da busca e dos exemplares', () => {
    expect(caminhoBusca('direito civil')).toBe('/biblioteca/pesquisa/resultado.action?keyword=direito%20civil');
    expect(caminhoExemplares({ idRegistro: '1001', titulo: 'Curso & cia', autor: null })).toBe('/biblioteca/ajax/exemplar/itens.action?idRegistro=1001&titulo=Curso+%26+cia&subtitulo=&autor=');
  });
  test('o mesmo termo com espaços e maiúsculas é a mesma busca', () => {
    expect(normalizarTermo('  Direito   CIVIL ')).toBe('direito civil');
  });
  test('cache vale por algumas horas, guarda poucas buscas e põe a última na frente', () => {
    const agora = Date.parse('2026-11-21T12:00:00Z');
    const hora = 60 * 60 * 1000;
    const em = (h) => new Date(agora - h * hora).toISOString();
    const entradas = [{ chave: 'a', lidoEm: em(1) }, { chave: 'b', lidoEm: em(7) }];
    expect(doCache(entradas, 'a', 6 * hora, agora)?.chave).toBe('a');
    expect(doCache(entradas, 'b', 6 * hora, agora)).toBeNull();
    const nova = guardarNoCache(entradas, { chave: 'c', lidoEm: em(0) }, 6 * hora, 2, agora);
    expect(nova.map((e) => e.chave)).toEqual(['c', 'a']);
    expect(guardarNoCache(nova, { chave: 'a', lidoEm: em(0) }, 6 * hora, 5, agora).map((e) => e.chave)).toEqual(['a', 'c']);
  });
});

describe('Biblioteca: histórico de empréstimos', () => {
  test('lê o JSON da fixture (dentro do <pre>): um devolvido e um ainda emprestado', () => {
    const lista = lerHistoricoBiblioteca(fixture('biblioteca_historico.html'));
    expect(lista).toHaveLength(2);
    expect(lista[0].titulo).toBe('Curso de direito civil de exemplo: parte geral / Souza, Maria de Teste.');
    expect(lista[0].devolucaoEm).not.toBeNull();
    expect(new Date(lista[0].retiradaEm).getDate()).toBe(3);
    // "Título /" fica sem a barra solta do fim; sem data de entrega, ainda está emprestado.
    expect(lista[1]).toMatchObject({ titulo: 'Manual fictício de contratos', devolucaoEm: null });
  });
  test('JSON puro funciona e o que não for a lista vira null', () => {
    expect(lerHistoricoBiblioteca('{"rows":[{"nome":"Livro /","dataRetirada":"01/10/2026 10:00:00","dataEntrega":""}]}')).toHaveLength(1);
    expect(lerHistoricoBiblioteca('{"rows":[]}')).toEqual([]);
    expect(lerHistoricoBiblioteca('{"rows":[{"nome":"","dataRetirada":"x"}]}')).toEqual([]);
    for (const ruim of [null, '', 'não é json', '<html></html>', '{"a":1}']) expect(lerHistoricoBiblioteca(ruim)).toBeNull();
  });
});
