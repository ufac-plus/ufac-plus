// Mesmos casos do Android (test/biblioteca_test.dart), contra as mesmas fixtures.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const banco = new Map();
vi.mock('../src/lib/armazenamento.js', () => ({
  ler: async (k) => banco.get(k),
  gravar: async (k, v) => void banco.set(k, v),
  apagar: async (k) => void banco.delete(k),
  apagarTudo: async () => banco.clear(),
}));

const { caminhoBusca, caminhoExemplares, doCache, ErroBibliotecaNoSite, guardarNoCache, lerHistoricoEmprestimos, normalizarTermo } = await import('../src/lib/biblioteca.js');
import { ehRequisicaoIncompleta, lerExemplares, lerHistoricoBiblioteca, lerResultadoAcervo, tituloCompleto } from '../src/lib/extratores/biblioteca.js';
import { classificar } from '../src/lib/regras.js';

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
  test('JSON puro funciona, rows nulo vira lista vazia e o que não for a lista vira null', () => {
    expect(lerHistoricoBiblioteca('{"rows":[{"nome":"Livro /","dataRetirada":"01/10/2026 10:00:00","dataEntrega":""}]}')).toHaveLength(1);
    expect(lerHistoricoBiblioteca('{"rows":[]}')).toEqual([]);
    expect(lerHistoricoBiblioteca('{"firstResult":0,"rows":null,"totalPages":0,"totalRows":"0","page":1}')).toEqual([]);
    expect(lerHistoricoBiblioteca('{"rows":[{"nome":"","dataRetirada":"x"}]}')).toEqual([]);
    for (const ruim of [null, '', 'não é json', '<html></html>', '{"a":1}']) expect(lerHistoricoBiblioteca(ruim)).toBeNull();
  });
  test('reconhece 500.action ("Requisição Incompleta") e login da Biblioteca', () => {
    expect(ehRequisicaoIncompleta('<html><title>Requisição Incompleta</title></html>', '')).toBe(true);
    expect(ehRequisicaoIncompleta('', 'https://portal.ufac.br/biblioteca/500.action')).toBe(true);
    expect(ehRequisicaoIncompleta('{"rows":[]}', 'https://portal.ufac.br/biblioteca/usuario/emprestimo/gridhistorico.action')).toBe(false);
    expect(classificar('portal', 'https://portal.ufac.br/biblioteca/login.action;jsessionid=1?error=')).toBe('naLogin');
    expect(classificar('portal', 'https://portal.ufac.br/biblioteca/500.action')).toBe('erroBiblioteca');
    expect(classificar('portal', 'https://portal.ufac.br/biblioteca/usuario/emprestimo/gridhistorico.action')).toBe('logado');
  });

  beforeEach(() => banco.clear());

  test('se o primeiro gridhistorico falhar, passa por Meu Espaço › Histórico com X-Nova-Biblioteca e lê o JSON', async () => {
    banco.set('idInterno', '11111');
    banco.set('sessao', 'S1');
    const vistos = [];
    let abriuMoldura = false;
    vi.stubGlobal('fetch', async (url, init) => {
      const u = new URL(url);
      vistos.push({ caminho: u.pathname, nova: init.headers['X-Nova-Biblioteca'] ?? '', xhr: init.headers['X-Requested-With'] ?? '' });
      if (u.pathname.endsWith('/historico.action')) abriuMoldura = true;
      if (u.pathname.endsWith('/gridhistorico.action')) {
        return abriuMoldura
          ? new Response(fixture('biblioteca_historico.html'), { headers: { 'X-Url-Final': `https://portal.ufac.br${u.pathname.slice(7)}` } })
          : new Response('<html><body>vazio</body></html>', { headers: { 'X-Url-Final': 'https://portal.ufac.br/biblioteca/usuario/index.action' } });
      }
      return new Response('<html></html>', { headers: { 'X-Url-Final': `https://portal.ufac.br${u.pathname.slice(7)}` } });
    });
    const r = await lerHistoricoEmprestimos({ forcar: true });
    expect(r.lista).toHaveLength(2);
    expect(vistos[0]).toMatchObject({ caminho: '/portal/biblioteca/pesquisa/pesquisar.action', nova: '1' });
    expect(vistos[1]).toMatchObject({ caminho: '/portal/biblioteca/usuario/emprestimo/gridhistorico.action', xhr: 'XMLHttpRequest' });
  });

  test('quando a Biblioteca da Ufac responde 500.action ("Requisição Incompleta"), lança ErroBibliotecaNoSite', async () => {
    banco.set('idInterno', '11111');
    banco.set('sessao', 'S1');
    vi.stubGlobal('fetch', async (url) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/pesquisar.action')) {
        return new Response('<html></html>', { headers: { 'X-Url-Final': 'https://portal.ufac.br/biblioteca/pesquisa/pesquisar.action' } });
      }
      return new Response('<html><head><title>Portal da Biblioteca - UFAC - Requisição Incompleta</title></head><body>Requisição Incompleta</body></html>', {
        headers: { 'X-Url-Final': 'https://portal.ufac.br/biblioteca/500.action' },
      });
    });
    await expect(lerHistoricoEmprestimos({ forcar: true })).rejects.toBeInstanceOf(ErroBibliotecaNoSite);
  });
});
