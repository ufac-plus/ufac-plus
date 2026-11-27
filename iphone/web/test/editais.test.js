// Editais da Proaes e da Prograd: listagem pública (API do Plone em www3.ufac.br), sem login e sem dado pessoal.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const gravados = {};
vi.mock('../src/lib/armazenamento.js', () => ({
  ler: async (k) => gravados[k],
  gravar: async (k, v) => { gravados[k] = v; },
  apagar: async (k) => { delete gravados[k]; },
}));

const { lerEditais } = await import('../src/lib/extratores/editais.js');
const { apagarEditaisGuardados, enderecoBusca, enderecoPasta, lerEditaisDe, editaisGuardados, rotuloDatas, VALIDADE_EDITAIS_MS } = await import('../src/lib/editais.js');
const { SemConexao } = await import('../src/lib/api.js');
const { ErroLeitura } = await import('../src/lib/dados.js');

const fixture = (nome) => JSON.parse(readFileSync(resolve(__dirname, '../../fixtures/public', nome), 'utf8'));

describe('extrator de editais', () => {
  test('lê título, link e datas da Proaes, do mais novo para o mais antigo', () => {
    const lista = lerEditais(fixture('proaes_editais.json'));
    expect(lista).toHaveLength(6);
    expect(lista[0]).toEqual({
      titulo: 'Edital Proaes nº 22/2026 - Programa Pulsar Acolhe',
      descricao: '',
      url: 'https://www3.ufac.br/proaes/2026/edital-proaes-no-22-2026-programa-pulsar-acolhe',
      publicadoEm: '2026-11-06T22:13:02+00:00',
      atualizadoEm: '2026-11-16T14:49:40+00:00',
    });
  });
  test('aceita também os itens do tipo Link (Prograd)', () => {
    const lista = lerEditais(fixture('prograd_editais.json'));
    expect(lista).toHaveLength(4);
    expect(lista[2].titulo).toMatch(/^Edital Prograd nº 47\/2026/);
  });
  test('ano sem edital é lista vazia', () => {
    expect(lerEditais(fixture('proaes_editais_vazio.json'))).toEqual([]);
  });
  test('resposta que não é a listagem não vira dado', () => {
    expect(lerEditais(null)).toBeNull();
    expect(lerEditais('<html></html>')).toBeNull();
    expect(lerEditais({ erro: 'x' })).toBeNull();
  });
  test('descarta link fora da Ufac, título vazio e data inválida', () => {
    const lista = lerEditais({
      items_total: 3,
      items: [
        { '@id': 'https://exemplo.org/x', '@type': 'Folder', title: 'Fora' },
        { '@id': 'https://www3.ufac.br/proaes/2026/a', '@type': 'Folder', title: '   ' },
        { '@id': 'https://www3.ufac.br/proaes/2026/b', '@type': 'Folder', title: ' Edital  de teste ', effective: 'None', modified: null },
      ],
    });
    expect(lista).toEqual([{ titulo: 'Edital de teste', descricao: '', url: 'https://www3.ufac.br/proaes/2026/b', publicadoEm: null, atualizadoEm: null }]);
  });
});

describe('endereços', () => {
  test('busca do ano, ordenada pela publicação, com as datas', () => {
    const u = new URL(enderecoBusca('proaes', 2026));
    expect(u.origin).toBe('https://www3.ufac.br');
    expect(u.pathname).toBe('/proaes/@search');
    expect(u.searchParams.get('path.query')).toBe('/proaes/2026');
    expect(u.searchParams.get('path.depth')).toBe('1');
    expect(u.searchParams.get('sort_on')).toBe('effective');
    expect(u.searchParams.get('sort_order')).toBe('descending');
    expect(u.searchParams.getAll('metadata_fields')).toEqual(['effective', 'modified', 'description']);
    expect(enderecoPasta('prograd', 2026)).toBe('https://www3.ufac.br/prograd/2026');
  });
});

describe('leitura com cache', () => {
  beforeEach(() => Object.keys(gravados).forEach((k) => delete gravados[k]));
  const resposta = (corpo, status = 200) => ({ ok: status < 400, status, json: async () => corpo });
  const agora = new Date('2026-11-21T10:00:00-05:00');

  test('lê da Ufac sem cookies e guarda', async () => {
    const buscar = vi.fn(async () => resposta(fixture('proaes_editais.json')));
    const r = await lerEditaisDe('proaes', { agora, buscar });
    expect(r.ano).toBe(2026);
    expect(r.lista).toHaveLength(6);
    expect(buscar).toHaveBeenCalledTimes(1);
    const [url, opcoes] = buscar.mock.calls[0];
    expect(url).toBe(enderecoBusca('proaes', 2026));
    expect(opcoes.credentials).toBe('omit');
    expect(opcoes.headers.Accept).toBe('application/json');
    expect((await editaisGuardados('proaes')).lista).toHaveLength(6);
  });
  test('"Limpar dados salvos" apaga os editais das três fontes', async () => {
    const buscar = vi.fn(async () => resposta(fixture('proaes_editais.json')));
    await lerEditaisDe('proaes', { agora, buscar });
    await lerEditaisDe('prograd', { agora, buscar });
    await lerEditaisDe('proex', { agora, buscar });
    await apagarEditaisGuardados();
    expect(await editaisGuardados('proaes')).toBeUndefined();
    expect(await editaisGuardados('prograd')).toBeUndefined();
    expect(await editaisGuardados('proex')).toBeUndefined();
    expect(Object.keys(gravados)).toEqual([]);
  });
  test('dentro da validade não pede de novo; puxar para atualizar pede', async () => {
    const buscar = vi.fn(async () => resposta(fixture('proaes_editais.json')));
    await lerEditaisDe('proaes', { agora, buscar });
    await lerEditaisDe('proaes', { agora: new Date(agora.getTime() + VALIDADE_EDITAIS_MS - 1000), buscar });
    expect(buscar).toHaveBeenCalledTimes(1);
    await lerEditaisDe('proaes', { agora, buscar, forcar: true });
    expect(buscar).toHaveBeenCalledTimes(2);
    await lerEditaisDe('proaes', { agora: new Date(agora.getTime() + VALIDADE_EDITAIS_MS + 1000), buscar });
    expect(buscar).toHaveBeenCalledTimes(3);
  });
  test('cada fonte tem o seu cache', async () => {
    const buscar = vi.fn(async (url) => resposta(fixture(url.includes('/prograd/') ? 'prograd_editais.json' : 'proaes_editais.json')));
    await lerEditaisDe('proaes', { agora, buscar });
    const r = await lerEditaisDe('prograd', { agora, buscar });
    expect(r.lista).toHaveLength(4);
    expect(buscar).toHaveBeenCalledTimes(2);
  });
  test('começo de ano sem edital novo: mostra os do ano anterior', async () => {
    const janeiro = new Date('2027-01-05T10:00:00-05:00');
    const buscar = vi.fn(async (url) => resposta(fixture(url.includes('%2F2027') || url.includes('/2027') ? 'proaes_editais_vazio.json' : 'proaes_editais.json')));
    const r = await lerEditaisDe('proaes', { agora: janeiro, buscar });
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(r.ano).toBe(2026);
    expect(r.lista).toHaveLength(6);
  });
  test('sem rede ou erro da Ufac: SemConexao', async () => {
    await expect(lerEditaisDe('proaes', { agora, buscar: async () => { throw new TypeError('Load failed'); } })).rejects.toBeInstanceOf(SemConexao);
    await expect(lerEditaisDe('proaes', { agora, buscar: async () => resposta({}, 503) })).rejects.toBeInstanceOf(SemConexao);
  });
  test('resposta estranha: ErroLeitura, e o cache antigo continua', async () => {
    gravados['editais:proaes'] = { fonte: 'proaes', ano: 2026, lidoEm: '2026-11-01T10:00:00Z', lista: [{ titulo: 'Antigo', url: 'https://www3.ufac.br/proaes/2026/a', publicadoEm: null, atualizadoEm: null }] };
    await expect(lerEditaisDe('proaes', { agora, buscar: async () => resposta({ nada: true }) })).rejects.toBeInstanceOf(ErroLeitura);
    await expect(lerEditaisDe('proaes', { agora, buscar: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }) })).rejects.toBeInstanceOf(ErroLeitura);
    expect((await editaisGuardados('proaes')).lista[0].titulo).toBe('Antigo');
  });
});

describe('datas no formato brasileiro', () => {
  const agora = new Date('2026-11-21T10:00:00-05:00');
  test('publicado e atualizado em dias diferentes', () => {
    expect(rotuloDatas({ publicadoEm: '2026-11-06T22:13:02+00:00', atualizadoEm: '2026-11-16T14:49:40+00:00' }, agora)).toBe('Publicado em 6 de novembro · atualizado em 16 de novembro');
  });
  test('atualizado no mesmo dia da publicação não repete', () => {
    expect(rotuloDatas({ publicadoEm: '2026-10-23T14:28:47+00:00', atualizadoEm: '2026-10-23T14:28:47+00:00' }, agora)).toBe('Publicado em 23 de outubro');
  });
  test('usa o fuso de Rio Branco (22h13 UTC ainda é 6 de novembro)', () => {
    expect(rotuloDatas({ publicadoEm: '2026-11-07T03:00:00+00:00', atualizadoEm: null }, agora)).toBe('Publicado em 6 de novembro');
  });
  test('outro ano mostra o ano; sem data, nada', () => {
    expect(rotuloDatas({ publicadoEm: '2025-12-10T12:00:00+00:00', atualizadoEm: null }, agora)).toBe('Publicado em 10 de dezembro de 2025');
    expect(rotuloDatas({ publicadoEm: null, atualizadoEm: null }, agora)).toBe('');
  });
});

describe('Proex e horas complementares', async () => {
  const { ehEditalMonitoria, infoHorasComplementares, FONTES } = await import('../src/lib/editais.js');
  const lista = (nome) => lerEditais(fixture(nome));
  const achar = (itens, trecho) => itens.find((e) => e.titulo.includes(trecho));

  test('a Proex é a terceira fonte e a fixture dela tem 17 editais', () => {
    expect(Object.keys(FONTES)).toEqual(['proaes', 'prograd', 'proex']);
    expect(lista('proex_editais.json')).toHaveLength(17);
  });

  test('monitoria: monitoria, monitores e Promaed; o resto não', () => {
    expect(ehEditalMonitoria({ titulo: 'Edital Prograd nº 10/2026 - Seleção de Monitores', descricao: '', url: 'https://www3.ufac.br/prograd/2026/a' })).toBe(true);
    expect(ehEditalMonitoria({ titulo: 'Programa de Monitoria Acadêmica', url: '' })).toBe(true);
    expect(ehEditalMonitoria({ titulo: 'Edital do Promaed', url: '' })).toBe(true);
    for (const e of lista('prograd_editais.json')) expect(ehEditalMonitoria(e)).toBe(false);
  });

  test('auxílios, transporte, moradia e cadastros não rendem horas', () => {
    for (const e of lista('proaes_editais.json')) {
      if (/Pulsar|parceiros|Pró-PcD|Passe Livre|Primeira Infância/i.test(e.titulo)) expect(infoHorasComplementares(e), e.titulo).toBeNull();
    }
    for (const e of lista('proex_editais.json')) {
      if (/Aux[ií]lio|Apoio para apresentação|Bolsista Administrativo/i.test(e.titulo)) expect(infoHorasComplementares(e), e.titulo).toBeNull();
    }
    expect(infoHorasComplementares(achar(lista('prograd_editais.json'), 'Transporte'))).toBeNull();
    expect(infoHorasComplementares(achar(lista('prograd_editais.json'), 'Auxílio para Realização'))).toBeNull();
  });

  test('categorias com a faixa típica (estimativa)', () => {
    expect(infoHorasComplementares(achar(lista('prograd_editais.json'), 'PET Agronomia'))).toEqual({ categoria: 'Ensino · PET', horas: null, rotulo: '~30 a 60 h complementares por semestre', estimado: true });
    expect(infoHorasComplementares(achar(lista('prograd_editais.json'), 'Brinquedotecas'))).toMatchObject({ categoria: 'Bolsa acadêmica', estimado: true });
    expect(infoHorasComplementares(achar(lista('proex_editais.json'), 'Semanas Acadêmicas'))).toMatchObject({ categoria: 'Evento', rotulo: '~10 a 40 h complementares (pelo certificado)' });
    expect(infoHorasComplementares(achar(lista('proex_editais.json'), 'Programas de Extensão Universitária'))).toMatchObject({ categoria: 'Extensão', rotulo: '~30 a 60 h complementares' });
    expect(infoHorasComplementares(achar(lista('proex_editais.json'), 'Projetos em Música'))).toMatchObject({ categoria: 'Cultura / Esporte' });
    expect(infoHorasComplementares(achar(lista('proaes_editais.json'), 'JUBS'))).toMatchObject({ categoria: 'Cultura / Esporte', rotulo: '~15 a 30 h complementares' });
    expect(infoHorasComplementares({ titulo: 'Seleção de monitores', descricao: '' })).toMatchObject({ categoria: 'Monitoria' });
  });

  test('horas escritas no edital valem mais; carga semanal não conta', () => {
    expect(infoHorasComplementares({ titulo: 'Curso de formação com certificado de 40h', descricao: '' })).toMatchObject({ horas: 40, rotulo: '40 h complementares', estimado: false });
    expect(infoHorasComplementares({ titulo: 'Seleção de monitores com carga horária de 12h semanais', descricao: '' })).toMatchObject({ categoria: 'Monitoria', horas: null, estimado: true });
    expect(infoHorasComplementares({ titulo: 'Seleção de monitores com carga horária de 12 horas semanais', descricao: '' })).toMatchObject({ horas: null });
  });
});
